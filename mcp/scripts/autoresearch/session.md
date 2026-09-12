# Autoresearch session

Auto-updated by loop.ts. Enables resumability across agent sessions.

## Status

Not yet started. Run `npx tsx mcp/scripts/autoresearch/loop.ts` to begin.

## History

### Run 025 — 2026-09-12T21:33
- Hypothesis: The current coaching prompt places the "Sentence Craft Protocol" after the general rules section, but the worst violations in the last eval were voice:long-sentence (×10), which accounted for ~40% of all mechanical issues. While run 24 added the protocol and improved to 0.37 pass rate with 24 mechanical issues (worse than the current baseline), the key insight from the audit is that **negative parallelism** (structural:Negative parallelism (isn't X — it's Y) ×4 + (isn't X. It's Y) ×4) and **repetitive structure** (×4) are equally devastating but not explicitly addressed. The current prompt has no prohibition against the "isn't X — it's Y" pattern that triggers negative parallelism. Adding a specific structural prohibition for this pattern, placed prominently in the prompt, should reduce these 8 violations. This is a simplification — adding one targeted structural guard rather than trying to cover all bases generically.
- Pass rate: 0.333 | Dim: 44.7 | Mech: 35
- Result: REVERTED

### Run 024 — 2026-09-12T19:20
- Hypothesis: The current coaching prompt provides no specific structural guidance for sentence construction, leaving the model to manage sentence length organically. Adding an explicit "Sentence Craft Protocol" section that teaches Claude to build complex ideas from linked short sentences (with concrete techniques like mid-point punctuation + connectives) will reduce long-sentence violations by ~50%. I expect this to drop mechanical issues from the current ~8-12 down to ~4-6, and increase pass rate by ~5-8pp. This is more specific than the previously-reverted prompts because it teaches a construction technique, not just states a constraint.
- Pass rate: 0.37 | Dim: 45.4 | Mech: 24
- Result: KEPT

### Run 023 — 2026-09-12T19:04
- Hypothesis: The current coaching prompt treats all rules equally with no explicit ordering or emphasis. Given that voice:long-sentence violations account for ~40% of all mechanical issues across recent runs (10-12 violations per run), elevating the long-sentence constraint to the top of the prompt with explicit before/after examples will yield higher compliance. The "Apply voice rules matching this register" line is too abstract — replacing it with a concrete directive about sentence length and structure will reduce ambiguity. Expected improvement: +5-8pp pass rate, -3-4 mechanical issues.
- Pass rate: 0.407 | Dim: 45 | Mech: 25
- Result: REVERTED

### Run 022 — 2026-09-12T19:02
- Hypothesis: The current coaching prompt treats all rules equally with no explicit ordering or emphasis. Given that voice:long-sentence violations account for ~40% of all mechanical issues across recent runs, elevating the long-sentence constraint to the top of the prompt with explicit before/after examples will yield higher compliance. This is a simplification + structural test: removing the generic "Apply voice rules matching this register" line and replacing it with a concrete directive about sentence length will reduce ambiguity. Expected improvement: +5-8pp pass rate, -3-4 mechanical issues.
- Pass rate: 0.37 | Dim: 44.7 | Mech: 30
- Result: REVERTED

(populated by loop.ts)
