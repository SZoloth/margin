"""Detect repeat corrections: corrections that match existing rules.

Two-tier matching:
  1. Mechanical — substring/keyword overlap between correction and rule
  2. Semantic — LLM-based comparison for unmatched corrections

Usage: python -m gepa.detect_repeat
       python gepa/detect_repeat.py
"""

import json
import os
import re
import sqlite3
import subprocess
import time
import uuid
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


def load_corrective_corrections(db: sqlite3.Connection) -> list[dict]:
    """Load corrections that already generated rules (synthesized_at IS NOT NULL)."""
    rows = db.execute(
        """SELECT id, original_text, notes_json, writing_type
           FROM corrections
           WHERE polarity = 'corrective'
             AND synthesized_at IS NOT NULL"""
    ).fetchall()
    return [dict(r) for r in rows]


def load_rules(db: sqlite3.Connection) -> list[dict]:
    """Load all writing rules."""
    rows = db.execute(
        """SELECT id, writing_type, category, rule_text, severity,
                  example_before, example_after, signal_count
           FROM writing_rules
           ORDER BY signal_count DESC"""
    ).fetchall()
    return [dict(r) for r in rows]


def parse_notes(notes_json: str | None) -> str:
    """Extract human-readable notes text from notes_json."""
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


def extract_keywords(text: str) -> set[str]:
    """Extract meaningful keywords (3+ chars) from text."""
    words = re.findall(r"[a-zA-Z]{3,}", text.lower())
    stopwords = {
        "the", "and", "for", "that", "this", "with", "from", "are", "was",
        "were", "been", "have", "has", "had", "not", "but", "what", "all",
        "can", "will", "just", "more", "also", "than", "into", "its",
        "you", "your", "about", "should", "would", "could", "which",
        "their", "there", "when", "how", "does", "did", "use", "used",
    }
    return set(words) - stopwords


def already_matched(db: sqlite3.Connection, correction_id: str, rule_id: str) -> bool:
    """Check if this correction-rule pair already exists in repeat_corrections."""
    row = db.execute(
        """SELECT 1 FROM repeat_corrections
           WHERE correction_id = ? AND matched_rule_id = ?""",
        (correction_id, rule_id),
    ).fetchone()
    return row is not None


def mechanical_match(
    correction: dict, rules: list[dict], db: sqlite3.Connection
) -> dict | None:
    """Try mechanical matching: substring and keyword overlap.

    Returns match dict or None.
    """
    original = (correction.get("original_text") or "").lower()
    notes = parse_notes(correction.get("notes_json"))
    note_keywords = extract_keywords(notes)

    best_match: dict | None = None
    best_confidence: float = 0.0

    for rule in rules:
        if already_matched(db, correction["id"], rule["id"]):
            continue

        example_before = (rule.get("example_before") or "").lower()
        rule_text = (rule.get("rule_text") or "").lower()

        confidence = 0.0

        # Substring match: original_text appears in rule's example_before
        if original and example_before and original in example_before:
            confidence = max(confidence, 0.95)
        elif example_before and original and example_before in original:
            confidence = max(confidence, 0.9)

        # Keyword overlap between notes and rule_text
        if note_keywords:
            rule_keywords = extract_keywords(rule_text)
            if rule_keywords:
                overlap = note_keywords & rule_keywords
                ratio = len(overlap) / min(len(note_keywords), len(rule_keywords))
                if ratio >= 0.5:
                    confidence = max(confidence, 0.8 + ratio * 0.15)

        if confidence >= 0.8 and confidence > best_confidence:
            best_confidence = confidence
            best_match = {
                "rule_id": rule["id"],
                "confidence": round(min(confidence, 1.0), 2),
                "match_type": "mechanical",
            }

    return best_match


def semantic_match(
    correction: dict, rules: list[dict], db: sqlite3.Connection
) -> dict | None:
    """Try semantic matching via LLM for top rules by signal_count.

    Returns match dict or None.
    """
    original = correction.get("original_text") or ""
    notes = parse_notes(correction.get("notes_json"))
    correction_desc = f"{original} -- {notes}" if notes else original

    # Check against top 20 rules (already sorted by signal_count)
    candidates = [r for r in rules[:20] if not already_matched(db, correction["id"], r["id"])]

    for rule in candidates:
        rule_text = rule.get("rule_text") or ""
        example_before = rule.get("example_before") or ""

        prompt = (
            "Does this correction describe the same pattern as this rule?\n\n"
            f"Correction: {correction_desc}\n"
            f"Rule: {rule_text} (example: {example_before})\n\n"
            "Answer YES or NO, then confidence 0.0-1.0.\n"
            "Format: YES 0.85 or NO 0.1"
        )

        try:
            response = call_llm(prompt)
            parts = response.strip().split()
            if len(parts) >= 2 and parts[0].upper() == "YES":
                conf = float(parts[1])
                if conf >= 0.6:
                    return {
                        "rule_id": rule["id"],
                        "confidence": round(conf, 2),
                        "match_type": "semantic",
                    }
        except (ValueError, subprocess.TimeoutExpired, IndexError):
            continue

    return None


def detect_repeats(dry_run: bool = False) -> dict[str, int]:
    """Run repeat detection pipeline. Returns counts."""
    db = get_db()
    corrections = load_corrective_corrections(db)
    rules = load_rules(db)

    counts = {"mechanical": 0, "semantic": 0, "unmatched": 0, "skipped": 0}

    if not corrections:
        print("No corrective corrections with synthesized rules found.")
        return counts

    if not rules:
        print("No writing rules found.")
        return counts

    print(f"Checking {len(corrections)} corrections against {len(rules)} rules...")

    unmatched: list[dict] = []

    # Tier 1: Mechanical
    for correction in corrections:
        match = mechanical_match(correction, rules, db)
        if match:
            counts["mechanical"] += 1
            print(
                f"  [mechanical {match['confidence']:.2f}] "
                f"correction '{correction['original_text'][:50]}' "
                f"-> rule {match['rule_id'][:8]}"
            )
            if not dry_run:
                db.execute(
                    """INSERT OR IGNORE INTO repeat_corrections
                       (id, correction_id, matched_rule_id, match_type, match_confidence, status, created_at)
                       VALUES (?, ?, ?, ?, ?, 'pending', ?)""",
                    (
                        uuid.uuid4().hex,
                        correction["id"],
                        match["rule_id"],
                        match["match_type"],
                        match["confidence"],
                        int(time.time()),
                    ),
                )
        else:
            unmatched.append(correction)

    # Tier 2: Semantic (only for unmatched)
    if unmatched:
        print(f"\nRunning semantic matching on {len(unmatched)} unmatched corrections...")
        for correction in unmatched:
            match = semantic_match(correction, rules, db)
            if match:
                counts["semantic"] += 1
                print(
                    f"  [semantic {match['confidence']:.2f}] "
                    f"correction '{correction['original_text'][:50]}' "
                    f"-> rule {match['rule_id'][:8]}"
                )
                if not dry_run:
                    db.execute(
                        """INSERT OR IGNORE INTO repeat_corrections
                           (id, correction_id, matched_rule_id, match_type, match_confidence, status, created_at)
                           VALUES (?, ?, ?, ?, ?, 'pending', ?)""",
                        (
                            uuid.uuid4().hex,
                            correction["id"],
                            match["rule_id"],
                            match["match_type"],
                            match["confidence"],
                            int(time.time()),
                        ),
                    )
            else:
                counts["unmatched"] += 1

    if not dry_run:
        db.commit()
    db.close()

    print(f"\nSummary: {counts['mechanical']} mechanical, {counts['semantic']} semantic, {counts['unmatched']} unmatched")
    return counts


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Detect repeat corrections matching existing rules")
    parser.add_argument("--dry-run", action="store_true", help="Print matches without writing to DB")
    args = parser.parse_args()

    detect_repeats(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
