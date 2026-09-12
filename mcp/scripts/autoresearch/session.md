# Autoresearch session

Auto-updated by loop.ts. Enables resumability across agent sessions.

## Status

Not yet started. Run `npx tsx mcp/scripts/autoresearch/loop.ts` to begin.

## History

### Run 023 — 2026-09-12T19:04
- Hypothesis: The current coaching prompt treats all rules equally with no explicit ordering or emphasis. Given that voice:long-sentence violations account for ~40% of all mechanical issues across recent runs (10-12 violations per run), elevating the long-sentence constraint to the top of the prompt with explicit before/after examples will yield higher compliance. The "Apply voice rules matching this register" line is too abstract — replacing it with a concrete directive about sentence length and structure will reduce ambiguity. Expected improvement: +5-8pp pass rate, -3-4 mechanical issues.
- Pass rate: 0.407 | Dim: 45 | Mech: 25
- Result: REVERTED

### Run 022 — 2026-09-12T19:02
- Hypothesis: The current coaching prompt treats all rules equally with no explicit ordering or emphasis. Given that voice:long-sentence violations account for ~40% of all mechanical issues across recent runs, elevating the long-sentence constraint to the top of the prompt with explicit before/after examples will yield higher compliance. This is a simplification + structural test: removing the generic "Apply voice rules matching this register" line and replacing it with a concrete directive about sentence length will reduce ambiguity. Expected improvement: +5-8pp pass rate, -3-4 mechanical issues.
- Pass rate: 0.37 | Dim: 44.7 | Mech: 30
- Result: REVERTED

(populated by loop.ts)
