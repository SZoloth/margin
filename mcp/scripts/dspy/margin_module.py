"""DSPy module for Margin voice-compliant writing."""

import json
import os
import sqlite3
from pathlib import Path

import dspy

DB_PATH = Path(os.path.expanduser("~/.margin/margin.db"))

# Hardcoded prohibitions block (from arch-e-hybrid.ts)
PROHIBITIONS = """<prohibition id="NEG_PARALLELISM" severity="BLOCK">
Never contrast what something "isn't" with what it "is."
Match variants: "isn't X — it's Y", "isn't X. It's Y", "not about X — it's about Y", "wasn't X — was Y", "don't X — Y", "more X, not Y", "X works. It fails Y"
Instead: state what it IS directly. Drop the contrast.
Bad: "The challenge isn't technical — it's organizational"
Good: "The challenge is organizational"
</prohibition>

<prohibition id="EM_DASH_LIMIT" severity="BLOCK">
Maximum 2 em dashes (—) per document. Zero is fine. Three or more is a violation.
Instead: use periods, commas, or restructure the sentence.
</prohibition>

<prohibition id="TERMINAL_PUNCTUATION" severity="BLOCK">
Every paragraph of prose must end with a period, question mark, or exclamation point. No trailing off without punctuation.
This applies to email bodies, message bodies, and all prose — not headers or signatures.
</prohibition>

<prohibition id="AI_SLOP" severity="BLOCK">
Never use "is the kind of X that" — this is a recognized AI writing tell.
Bad: "This is the kind of problem I want to work on"
Good: "I want to work on this problem"
Also avoid: hyperbolic claims like "the most [adj] thing", "thing nobody mentions", "the real X is"
</prohibition>

<prohibition id="COLON_LIMIT" severity="ADVISORY">
Maximum 1 colon in prose per document. Use sparingly.
</prohibition>"""


class WriteInVoice(dspy.Signature):
    """Write prose in a specific editorial voice, following corrections and rules."""

    writing_type: str = dspy.InputField()
    prompt: str = dspy.InputField()
    voice_register: str = dspy.InputField(desc="casual or professional")
    corrections: str = dspy.InputField(desc="Recent correction diffs with context")
    rules: str = dspy.InputField(desc="High-signal structural rules")
    prohibitions: str = dspy.InputField(desc="Hard-blocked patterns")
    prose: str = dspy.OutputField(desc="Only the prose, no meta-commentary")


class MarginWriter(dspy.Module):
    """DSPy module that generates voice-compliant prose."""

    def __init__(self) -> None:
        super().__init__()
        self.writer = dspy.Predict(WriteInVoice)

    def forward(
        self,
        writing_type: str,
        prompt: str,
        register: str = "casual",
        corrections: str | None = None,
        rules: str | None = None,
    ) -> dspy.Prediction:
        if corrections is None:
            corrections = load_corrections(writing_type)
        if rules is None:
            rules = load_high_signal_rules(writing_type)

        return self.writer(
            writing_type=writing_type,
            prompt=prompt,
            voice_register=register,
            corrections=corrections,
            rules=rules,
            prohibitions=PROHIBITIONS,
        )


def _get_db() -> sqlite3.Connection:
    """Open a readonly connection to the Margin database."""
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Margin database not found at {DB_PATH}")
    uri = f"file:{DB_PATH}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def format_corrections(rows: list[tuple]) -> str:
    """Format correction rows into the arch-e-hybrid style.

    Each row is (original_text, notes_json, prefix_context, suffix_context).
    """
    if not rows:
        return "(no corrections available)"

    parts: list[str] = []
    for i, (original_text, notes_json, prefix_context, suffix_context) in enumerate(rows, 1):
        # Parse notes
        try:
            parsed = json.loads(notes_json)
            if isinstance(parsed, list):
                notes = "; ".join(
                    n.get("text", str(n)) if isinstance(n, dict) else str(n)
                    for n in parsed
                )
            else:
                notes = str(parsed)
        except (json.JSONDecodeError, TypeError):
            notes = str(notes_json)

        # Build context string
        context_parts = []
        if prefix_context:
            context_parts.append(f"...{prefix_context} ")
        context_parts.append(f"[{original_text}]")
        if suffix_context:
            context_parts.append(f" {suffix_context}...")
        context = "".join(context_parts)

        parts.append(
            f"{i}. Flagged: \"{original_text}\"\n"
            f"   Context: {context}\n"
            f"   Why: {notes}"
        )

    return "\n\n".join(parts)


def load_corrections(writing_type: str | None = None, limit: int = 30) -> str:
    """Load recent corrections from SQLite, return formatted string."""
    try:
        db = _get_db()
        cursor = db.cursor()

        if writing_type:
            cursor.execute(
                """SELECT original_text, notes_json, prefix_context, suffix_context
                   FROM corrections
                   WHERE notes_json IS NOT NULL AND notes_json != '[]'
                     AND (writing_type = ? OR writing_type IS NULL)
                   ORDER BY created_at DESC LIMIT ?""",
                (writing_type, limit),
            )
        else:
            cursor.execute(
                """SELECT original_text, notes_json, prefix_context, suffix_context
                   FROM corrections
                   WHERE notes_json IS NOT NULL AND notes_json != '[]'
                   ORDER BY created_at DESC LIMIT ?""",
                (limit,),
            )

        rows = cursor.fetchall()
        db.close()
        return format_corrections(rows)
    except Exception as e:
        return f"(failed to load corrections: {e})"


def load_high_signal_rules(writing_type: str | None = None, limit: int = 30) -> str:
    """Load high-signal writing rules from SQLite, return formatted string."""
    try:
        db = _get_db()
        cursor = db.cursor()

        if writing_type:
            cursor.execute(
                """SELECT rule_text, severity, example_before, example_after, category
                   FROM writing_rules
                   WHERE (signal_count >= 2 OR severity = 'must-fix')
                     AND (writing_type = ? OR writing_type = 'general')
                   ORDER BY signal_count DESC LIMIT ?""",
                (writing_type, limit),
            )
        else:
            cursor.execute(
                """SELECT rule_text, severity, example_before, example_after, category
                   FROM writing_rules
                   WHERE signal_count >= 2 OR severity = 'must-fix'
                   ORDER BY signal_count DESC LIMIT ?""",
                (limit,),
            )

        rows = cursor.fetchall()
        db.close()

        if not rows:
            return "(no high-signal rules available)"

        parts: list[str] = []
        for rule_text, severity, example_before, example_after, category in rows:
            line = f"- [{severity}] {rule_text}"
            if example_before:
                line += f'\n  Bad: "{example_before}"'
            if example_after:
                line += f'\n  Good: "{example_after}"'
            parts.append(line)

        return "\n".join(parts)
    except Exception as e:
        return f"(failed to load rules: {e})"


def get_prohibitions() -> str:
    """Return the hardcoded prohibition block."""
    return PROHIBITIONS
