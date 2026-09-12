# Autoresearch session

Auto-updated by loop.ts. Enables resumability across agent sessions.

## Status

Not yet started. Run `npx tsx mcp/scripts/autoresearch/loop.ts` to begin.

## History

### Run 031 — 2026-09-12T22:11
- Hypothesis: Run 30's improvement from 0.37 to 0.556 came from adding the prohibition block for "the real X is" pattern but NOT from reordering — the prohibitions still sit after the register guidance. The worst violations remain long sentences (×7) and repetitive structure (×4), which the "Sentence Craft Protocol" isn't stopping because it's too abstract. The fix: replace the abstract Sentence Craft section with an explicit sentence-length constraint placed in the Structural Prohibitions block (where Claude actually reads it), and add a direct prohibition against repetitive sentence structure. This targets the actual failure patterns rather than prescribing a writing technique.
- Pass rate: 0.63 | Dim: 45.1 | Mech: 17
- Result: KEPT

### Run 030 — 2026-09-12T21:52
- Hypothesis: The current coaching prompt regressed catastrophically in run 26 (0.185 pass rate, 49 mechanical issues) because the "Sentence Craft Protocol" section in run 24 was too abstract and diluted focus. The key insight from the audit is that **negative parallelism** (×10 violations across two variants) and **repetitive structure** (×7) are equally devastating but not explicitly addressed.

The current prompt already includes a prohibition block for negative parallelism, but it's placed AFTER the "Sentence Craft" section. Per the compliance checker results, this block is ineffective because Claude doesn't process it with sufficient weight. 

The hypothesis is that **moving the prohibition blocks to the very top of the prompt, before register guidance, with explicit before/after examples** will reduce these violations. Additionally, the hyperbolic-claim pattern "the real X is" appeared in multiple runs and needs an explicit prohibition.

Expected improvement: +5-8pp pass rate, -8-10 mechanical issues from eliminating the most frequent violations.
- Pass rate: 0.556 | Dim: 45.3 | Mech: 21
- Result: KEPT

### Run 029 — 2026-09-12T21:50
- Hypothesis: The current coaching prompt is too verbose and dilutes focus. The prohibition blocks are buried under too much guidance text. Simplifying to the core violations with explicit severity ordering (most frequent first), removing the abstract "Sentence Craft" section that isn't preventing long sentences, and elevating the terminal punctuation requirement will improve compliance. The hyperbolic-claim pattern ("the real X is") is new and needs an explicit prohibition.
- Pass rate: 0.556 | Dim: 45.9 | Mech: 18
- Result: REVERTED

### Run 028 — 2026-09-12T21:47
- Hypothesis: The current coaching prompt treats all rules equally with no explicit ordering, and lacks a dedicated structural guardrail for the most devastating violation patterns. The last eval show negative parallelism (×6 "isn't X. It's Y" + ×4 "isn't X — it's Y" = 10 violations), repetitive structure (×7), and long sentences (×12). These three patterns alone account for ~29 of 49 mechanical issues.

The prompt needs:
1. A prominent prohibition block for negative parallelism patterns, placed BEFORE the general rules
2. Register-specific guidance — the current register guidance ("Casual-register rules DO NOT apply to professional writing") is a single line that gets lost
3. Explicit before/after examples for the worst violations, not just for long sentences

This is a simplification + targeting approach: instead of trying to cover everything with the Sentence Craft Protocol (which failed in run 24), focus on the specific patterns killing pass rate.

Expected improvement: +8-12pp pass rate, -8-10 mechanical issues, based on the pattern analysis.
- Pass rate: 0.37 | Dim: 44.4 | Mech: 30
- Result: KEPT

### Run 027 — 2026-09-12T21:44
- Hypothesis: The last run (run 26, baseline) showed catastrophic failure: 18.5% pass rate with 49 mechanical issues. The current coaching prompt lacks any structural guardrails for the two most devastating violation types: **negative parallelism** (×8) and **repetitive structure** (×13). 

Adding an explicit prohibition block for negative parallelism patterns ("isn't X — it's Y" and "isn't X. It's Y") will eliminate these violations, which alone account for ~23% of all mechanical issues. This directly targets the specific failure pattern observed, unlike the broad "Sentence Craft Protocol" added in run 24 which didn't address these structural violations and actually worsened performance.

Expected improvement: 0pp pass rate gain from baseline (since baseline is broken), but mechanical issues should drop by ~12-16 from eliminating negative parallelism and reducing repetitive structure through explicit structural guidance.
- Pass rate: 0.296 | Dim: 44.4 | Mech: 51
- Result: REVERTED

### Run 026 — 2026-09-12T21:41
- Hypothesis: baseline
- Pass rate: 0.185 | Dim: 43.9 | Mech: 49
- Result: KEPT

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
