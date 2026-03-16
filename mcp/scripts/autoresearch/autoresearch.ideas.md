# Autoresearch Ideas Backlog

Ideas ranked by expected impact. Re-prioritize after each experiment based on root-cause analysis.

## High priority

- **Register-specific prohibition tuning** — prohibition blocks are register-agnostic. Email and slack have different norms for colons, em dashes, sentence fragments. Test: add register exceptions to prohibition blocks.
- **Correction selection by writing type** — currently top 30 most recent regardless of type. Test: filter corrections to match the target writing type. Hypothesis: type-relevant corrections outperform generic recency.
- **Correction ordering by signal strength** — instead of recency, order by how many times similar corrections appear. Corrections that Sam gives repeatedly are highest signal.
- **Tighter rule threshold** — currently signal_count >= 2 OR severity = must-fix. Test: signal_count >= 3 only. Hypothesis: fewer, higher-signal rules reduce noise.

## Medium priority

- **Prohibition block expansion** — currently 5 blocks (NEG_PARALLELISM, EM_DASH_LIMIT, TERMINAL_PUNCTUATION, AI_SLOP, COLON_LIMIT). Analyze failure modes across architectures to identify candidates for new blocks.
- **Prompt section ordering** — does corrections-first vs rules-first vs prohibitions-first matter? Test by reordering sections in the coaching prompt.
- **Correction context window** — currently includes prefix_context and suffix_context. Test: strip context (smaller prompt) vs expand context (more signal). Which matters more?
- **Eval expansion to n=45** — bump from 3 to 5 samples per type. Reduces variance, tightens confidence intervals.

## Low priority / speculative

- **Post-generation compliance check** — run compliance-check.ts on generated output, auto-fix violations, re-check. Two-pass but targeted.
- **Eval calibration study** — compare proxy scores to Sam's actual corrections on real documents. Critical for confidence but requires Sam's time.
- **Dynamic rule loading** — load different rule subsets based on writing type at generation time. Requires CLI changes.
- **Correction clustering** — group similar corrections and present clusters instead of individual corrections. May improve generalization.

## Tried and discarded

_Nothing yet. Failed experiments go here with root-cause so we don't repeat them._
