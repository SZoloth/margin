"""Diagnose why existing rules failed to prevent repeat corrections.

For each pending repeat_correction without a diagnosis, asks the LLM to classify
the failure mode and propose a fix.

Usage: python -m gepa.diagnose
       python gepa/diagnose.py
"""

import json
import os
import re
import sqlite3
import subprocess
import time
from pathlib import Path

DB_PATH = Path(os.path.expanduser("~/.margin/margin.db"))


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def call_llm(prompt: str, timeout: int = 60) -> str:
    """Call claude --print --model sonnet, stripping CLAUDECODE env."""
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    result = subprocess.run(
        ["claude", "--print", "--model", "sonnet"],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
    )
    return result.stdout.strip()


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


def parse_llm_json(response: str) -> dict | None:
    """Parse JSON from LLM response, handling markdown fences."""
    # Strip markdown code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", response.strip())
    cleaned = re.sub(r"\n?```\s*$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find JSON object in the response
        match = re.search(r"\{[^{}]*\}", response, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return None


def load_pending_undiagnosed(db: sqlite3.Connection) -> list[dict]:
    """Load repeat_corrections that are pending and have no diagnosis."""
    rows = db.execute(
        """SELECT rc.id, rc.correction_id, rc.matched_rule_id,
                  rc.match_type, rc.match_confidence,
                  c.original_text, c.notes_json, c.writing_type AS correction_writing_type,
                  wr.rule_text, wr.category, wr.severity,
                  wr.example_before, wr.example_after, wr.writing_type AS rule_writing_type
           FROM repeat_corrections rc
           JOIN corrections c ON c.id = rc.correction_id
           JOIN writing_rules wr ON wr.id = rc.matched_rule_id
           WHERE rc.status = 'pending' AND rc.diagnosis IS NULL"""
    ).fetchall()
    return [dict(r) for r in rows]


def diagnose_one(record: dict) -> dict | None:
    """Ask LLM to diagnose why a rule failed to prevent a correction."""
    notes = parse_notes(record.get("notes_json"))

    prompt = (
        "A user made this correction, but a rule already existed that should have prevented it.\n\n"
        f'Correction: "{record["original_text"]}"\n'
        f"Notes: {notes}\n"
        f"Writing type: {record['correction_writing_type'] or 'unknown'}\n\n"
        f'Existing rule: "{record["rule_text"]}"\n'
        f"Category: {record['category']}\n"
        f"Severity: {record['severity']}\n"
        f'Example: "{record["example_before"] or ""}" -> "{record["example_after"] or ""}"\n'
        f"Rule writing_type: {record['rule_writing_type'] or 'general'}\n\n"
        "Why did this rule fail to prevent the violation? Classify as one of:\n"
        "- rule_too_vague: rule text is abstract, needs concrete patterns\n"
        "- buried_in_noise: rule exists but drowns among many others\n"
        "- near_miss_variant: violation is a variant not covered by rule's examples\n"
        "- wrong_scope: rule's writing_type doesn't cover where violation occurred\n"
        "- wrong_severity: should be must-fix but isn't\n\n"
        "Output ONLY valid JSON:\n"
        '{"type": "...", "explanation": "...", "proposed_fix": "..."}'
    )

    try:
        response = call_llm(prompt)
        parsed = parse_llm_json(response)
        if parsed and "type" in parsed:
            valid_types = {
                "rule_too_vague", "buried_in_noise", "near_miss_variant",
                "wrong_scope", "wrong_severity",
            }
            if parsed["type"] not in valid_types:
                parsed["type"] = "rule_too_vague"  # safe fallback
            return parsed
        print(f"  Warning: could not parse LLM response for {record['id'][:8]}")
        return None
    except subprocess.TimeoutExpired:
        print(f"  Warning: LLM timed out for {record['id'][:8]}")
        return None


def run_diagnoses() -> int:
    """Diagnose all pending undiagnosed repeat corrections. Returns count."""
    db = get_db()
    pending = load_pending_undiagnosed(db)

    if not pending:
        print("No pending undiagnosed repeat corrections.")
        return 0

    print(f"Diagnosing {len(pending)} repeat corrections...\n")
    diagnosed = 0

    for record in pending:
        print(f"--- Correction: \"{record['original_text'][:60]}\"")
        print(f"    Rule: \"{record['rule_text'][:60]}\"")
        print(f"    Match: {record['match_type']} ({record['match_confidence']:.2f})")

        diagnosis = diagnose_one(record)
        if diagnosis:
            diagnosis_json = json.dumps(diagnosis)
            db.execute(
                "UPDATE repeat_corrections SET diagnosis = ? WHERE id = ?",
                (diagnosis_json, record["id"]),
            )
            diagnosed += 1
            print(f"    Diagnosis: {diagnosis['type']}")
            print(f"    Explanation: {diagnosis.get('explanation', '')[:100]}")
            print(f"    Proposed fix: {diagnosis.get('proposed_fix', '')[:100]}")
        else:
            print("    Diagnosis: FAILED")
        print()

    db.commit()
    db.close()
    print(f"Diagnosed {diagnosed}/{len(pending)} repeat corrections.")
    return diagnosed


def main() -> None:
    run_diagnoses()


if __name__ == "__main__":
    main()
