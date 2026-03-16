"""Propose and optionally apply fixes for diagnosed repeat corrections.

Maps each diagnosis type to a concrete SQL mutation on writing_rules.

Usage: python gepa/propose_fix.py          # review mode (print only)
       python gepa/propose_fix.py --apply  # execute mutations
"""

import argparse
import json
import os
import sqlite3
import time
import uuid
from pathlib import Path

DB_PATH = Path(os.path.expanduser("~/.margin/margin.db"))


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def load_diagnosed_pending(db: sqlite3.Connection) -> list[dict]:
    """Load repeat_corrections with diagnosis that are still pending."""
    rows = db.execute(
        """SELECT rc.id AS rc_id, rc.correction_id, rc.matched_rule_id,
                  rc.match_type, rc.match_confidence, rc.diagnosis,
                  c.original_text, c.notes_json, c.writing_type AS correction_writing_type,
                  wr.id AS rule_id, wr.rule_text, wr.category, wr.severity,
                  wr.example_before, wr.example_after, wr.writing_type AS rule_writing_type,
                  wr.signal_count
           FROM repeat_corrections rc
           JOIN corrections c ON c.id = rc.correction_id
           JOIN writing_rules wr ON wr.id = rc.matched_rule_id
           WHERE rc.status = 'pending' AND rc.diagnosis IS NOT NULL"""
    ).fetchall()
    return [dict(r) for r in rows]


def parse_notes(notes_json: str | None) -> str:
    if not notes_json:
        return ""
    try:
        parsed = json.loads(notes_json)
        if isinstance(parsed, list):
            return " ".join(
                n.get("text", str(n)) if isinstance(n, dict) else str(n)
                for n in parsed
            )
        return str(parsed)
    except (json.JSONDecodeError, TypeError):
        return str(notes_json)


def build_proposal(record: dict) -> dict | None:
    """Map a diagnosis to a concrete SQL mutation proposal.

    Returns a dict with:
      - action: description of what will happen
      - sql: the SQL statement
      - params: tuple of params for the SQL
      - diagnosis_type: the classification
    """
    try:
        diagnosis = json.loads(record["diagnosis"])
    except (json.JSONDecodeError, TypeError):
        return None

    dtype = diagnosis.get("type", "")
    proposed_fix = diagnosis.get("proposed_fix", "")
    rule_id = record["rule_id"]
    original_text = record.get("original_text", "")
    notes = parse_notes(record.get("notes_json"))

    if dtype == "rule_too_vague":
        # Rewrite rule_text with the proposed fix, add correction as new example
        new_rule_text = proposed_fix if proposed_fix else record["rule_text"]
        new_example_before = original_text[:200] if original_text else record.get("example_before")
        return {
            "diagnosis_type": dtype,
            "action": f"UPDATE rule {rule_id[:8]}: rewrite rule_text, update example_before",
            "sql": """UPDATE writing_rules
                      SET rule_text = ?, example_before = ?
                      WHERE id = ?""",
            "params": (new_rule_text, new_example_before, rule_id),
            "diff": {
                "field": "rule_text",
                "old": record["rule_text"],
                "new": new_rule_text,
                "example_old": record.get("example_before"),
                "example_new": new_example_before,
            },
        }

    elif dtype == "near_miss_variant":
        # Insert a new rule covering the variant pattern
        new_rule_text = proposed_fix if proposed_fix else f"Variant of: {record['rule_text'][:100]}"
        return {
            "diagnosis_type": dtype,
            "action": f"INSERT new rule (variant of {rule_id[:8]})",
            "sql": """INSERT INTO writing_rules
                      (id, writing_type, category, rule_text, severity,
                       example_before, example_after, signal_count, source, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'gepa-variant', ?, ?)""",
            "params": (
                uuid.uuid4().hex,
                record.get("correction_writing_type") or record.get("rule_writing_type") or "general",
                record.get("category") or "auto-synthesized",
                new_rule_text,
                record.get("severity") or "should-fix",
                original_text[:200] if original_text else None,
                None,  # example_after not available
                int(time.time()),
                int(time.time()),
            ),
            "diff": {
                "field": "NEW RULE",
                "old": None,
                "new": new_rule_text,
                "example_new": original_text[:80] if original_text else None,
            },
        }

    elif dtype == "wrong_scope":
        # Broaden rule to 'general' writing_type
        return {
            "diagnosis_type": dtype,
            "action": f"UPDATE rule {rule_id[:8]}: writing_type -> 'general'",
            "sql": "UPDATE writing_rules SET writing_type = 'general' WHERE id = ?",
            "params": (rule_id,),
            "diff": {
                "field": "writing_type",
                "old": record.get("rule_writing_type"),
                "new": "general",
            },
        }

    elif dtype == "wrong_severity":
        # Escalate severity to must-fix
        return {
            "diagnosis_type": dtype,
            "action": f"UPDATE rule {rule_id[:8]}: severity -> 'must-fix'",
            "sql": "UPDATE writing_rules SET severity = 'must-fix' WHERE id = ?",
            "params": (rule_id,),
            "diff": {
                "field": "severity",
                "old": record.get("severity"),
                "new": "must-fix",
            },
        }

    elif dtype == "buried_in_noise":
        # Boost signal_count to surface the rule
        return {
            "diagnosis_type": dtype,
            "action": f"UPDATE rule {rule_id[:8]}: signal_count += 2 (was {record.get('signal_count', 0)})",
            "sql": "UPDATE writing_rules SET signal_count = signal_count + 2 WHERE id = ?",
            "params": (rule_id,),
            "diff": {
                "field": "signal_count",
                "old": record.get("signal_count", 0),
                "new": (record.get("signal_count", 0) or 0) + 2,
            },
        }

    return None


def format_proposal(record: dict, proposal: dict) -> str:
    """Format a proposal as a human-readable diff."""
    lines = [
        f"[{proposal['diagnosis_type']}] {proposal['action']}",
        f"  Correction: \"{record['original_text'][:60]}\"",
        f"  Rule: \"{record['rule_text'][:60]}\"",
    ]

    diff = proposal.get("diff", {})
    if diff.get("old") is not None:
        lines.append(f"  - {diff['field']}: {diff['old']}")
    if diff.get("new") is not None:
        lines.append(f"  + {diff['field']}: {diff['new']}")
    if diff.get("example_old") is not None:
        lines.append(f"  - example_before: {diff['example_old']}")
    if diff.get("example_new") is not None:
        lines.append(f"  + example_before: {diff['example_new']}")

    return "\n".join(lines)


def propose_fixes(apply: bool = False) -> int:
    """Generate and optionally apply fix proposals. Returns count."""
    db = get_db()
    records = load_diagnosed_pending(db)

    if not records:
        print("No diagnosed pending repeat corrections.")
        return 0

    mode = "APPLY" if apply else "REVIEW"
    print(f"Mode: {mode} -- {len(records)} diagnosed repeat corrections\n")

    proposed = 0
    applied = 0

    for record in records:
        proposal = build_proposal(record)
        if not proposal:
            print(f"  Skipped: no proposal for diagnosis of {record['rc_id'][:8]}")
            continue

        proposed += 1
        print(format_proposal(record, proposal))

        if apply:
            try:
                db.execute(proposal["sql"], proposal["params"])
                db.execute(
                    "UPDATE repeat_corrections SET status = 'applied' WHERE id = ?",
                    (record["rc_id"],),
                )
                applied += 1
                print("  -> APPLIED")
            except sqlite3.Error as e:
                print(f"  -> FAILED: {e}")
        print()

    if apply:
        db.commit()

    db.close()

    if apply:
        print(f"Applied {applied}/{proposed} proposals.")
    else:
        print(f"Proposed {proposed} fixes. Run with --apply to execute.")

    return proposed


def main() -> None:
    parser = argparse.ArgumentParser(description="Propose fixes for diagnosed repeat corrections")
    parser.add_argument("--apply", action="store_true", help="Execute mutations (default: review only)")
    args = parser.parse_args()

    propose_fixes(apply=args.apply)


if __name__ == "__main__":
    main()
