# Ideas backlog

Deferred hypotheses for future iterations. Ranked by estimated impact.

## High priority

- **Type-filtered corrections in arch-e**: arch-e already filters by writing_type (100% coverage), but also loads supplements from other types when <15 type-specific exist. Test: disable the cross-type supplement and see if focused signals improve or hurt pass rate. Hypothesis: cover-letter-specific coaching should dominate cover-letter eval samples.
- **Tighter rule threshold**: arch-e uses signal_count >= 2 OR must-fix (247 of 272 rules). Test: raise to signal_count >= 3 to reduce noise and focus on strongly validated patterns. Expected: fewer but higher-confidence rules.
- **Chronological correction accumulation (Lehmann method)**: arch-d loads most-recent-first. Test: load oldest-first (chronological accumulation) to see if showing the "learning arc" of corrections helps more than recency. Hypothesis: earlier corrections may encode more foundational patterns.
- **Klaassen top-10 rules**: arch-a currently loads all rules for the type/register. Test: limit to `LIMIT 10 ORDER BY signal_count DESC` to test if concentrated signal beats volume. Hypothesis: 10 high-signal rules > 247 rules for compliance rate.
- **Dedicated negative parallelism intervention**: negative parallelism persists across all architectures. Test: add an explicit, specific prohibition block at the top of arch-e's prompt (not just in hard prohibitions) with 5+ examples of the pattern and rewrites.

## Medium priority

- **Post-generation compliance check**: after arch-e generates, run a lightweight mechanical check and if it fails, regenerate once with the violation flagged. Adds latency but may push pass rate above 80%.
- **Register-specific rule scoping**: arch-e loads all high-signal rules regardless of register. Test: filter to `WHERE register = ?` or `register IS NULL` to avoid loading casual rules in professional contexts.
- **Bump eval to n=45**: current 27-sample eval has high variance (59-81% range). 5 samples/type would tighten confidence intervals and produce more reliable architecture comparisons.
- **Correction context window**: arch-e uses 30 corrections. Test 15 and 50 to find the optimal window. More context = more signal but also more noise for types with few type-specific corrections.

## Low / speculative

- **Eval calibration study**: compare proxy pass rate against Sam's actual correction rate on the same documents. This validates whether we're optimizing the right metric.
- **Clustering corrections by violation type**: group corrections by semantic similarity before loading, then load 2-3 per cluster. May reduce redundancy in the correction block.
- **Dynamic rule loading (Hallie method)**: test type-filtered rules vs full dump within arch-e by modifying `loadWritingRulesForType` to be more aggressive about type filtering.

## Tried and discarded

(none yet — first run)
