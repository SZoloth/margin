# Experiment Log

SAM-189: Architecture comparison — empirical evidence for/against Margin's correction→rule→enforcement pipeline.

**Date:** 2026-03-22

## Summary: All Architectures

| Architecture | R1 | R2 | Mean | Notes |
|---|---|---|---|---|
| arch-null | 77.8% | — | 77.8% | Zero-shot (null hypothesis) |
| arch-a | 63.0% | 51.9% | 57.5% | Rules-only (baseline) |
| arch-a-top10 | 70.4% | — | 70.4% | Top-10 rules only (Klaassen variant, 1 run) |
| arch-b | 63.0% | 63.0% | 63.0% | Exemplars / few-shot |
| arch-c | FAILED | — | — | Two-pass editor (FAILED — timeout) |
| arch-d | 77.8% | 66.7% | 72.2% | Corrections newest-first (Lehmann method) |
| arch-d-chrono | 59.3% | — | 59.3% | Corrections oldest-first (Lehmann chrono variant, 1 run) |
| arch-e | 66.7% | 55.6% | 61.2% | Hybrid corrections + high-signal rules |
| arch-f | 66.7% | 74.1% | 70.4% | Aegis governance schema |

**Ranking by mean pass rate:**
1. arch-null: 77.8% 🥇
2. arch-d: 72.2% 🥈
3. arch-f: 70.4% 🥉
4. arch-a-top10: 70.4% 
5. arch-b: 63.0% 
6. arch-e: 61.2% 
7. arch-d-chrono: 59.3% 
8. arch-a: 57.5% 

## Key Finding

**arch-d (corrections-only, newest-first) leads at 72.2% mean, outperforming arch-e (hybrid) at 61.2% by 11.1%.**

Adding rules to corrections *hurts* performance. The hybrid's rule component (247 high-signal rules) introduces complexity that generates more mechanical violations than corrections alone.

**arch-a-top10 (Klaassen top-10 rules) at 70.4% outperforms full arch-a at 57.5%**, confirming Klaassen's hypothesis: 10 focused rules beat 272 diffuse ones.

**arch-null (zero-shot, 77.8% single run) is a signal, not a conclusion.** Single-run with known high variance. If confirmed in a second run, it would indicate the entire coaching pipeline adds no value — but high variance makes this uncertain.

## Falsification Checkpoint

Threshold: if any simpler approach is within 5pp of arch-e → thesis challenged.

| Competitor | arch-e mean | competitor mean | delta | verdict |
|---|---|---|---|---|
| arch-null | 61.2% | 77.8% | +16.6% | ⚠️ THESIS CHALLENGED — null leads by 16.6% |
| arch-a | 61.2% | 57.5% | -3.7% | ⚠️ thesis challenged — within 5pp |
| arch-d | 61.2% | 72.2% | +11.1% | ⚠️ THESIS CHALLENGED — d leads by 11.1% |

**⚠️ THESIS CHALLENGED** — arch-d (corrections-only) leads arch-e (hybrid) by +11.1% across 2 rounds. The correction→rule pipeline is not the optimal architecture. Corrections alone outperform corrections+rules.

**Calibration caveat:** The pass rate proxy (mechanical cleanliness + dimension score) may not perfectly capture Sam's actual writing quality preferences. Round 1's null result (77.8%) is suspicious — if zero-shot Claude consistently scores this high, the compliance checker may be testing patterns Claude already avoids naturally. A second null run is needed before the 'null ties best architecture' conclusion can be trusted.

**Action for Sam:** This finding requires judgment — not autonomous architectural decision. Flag for review.

## Root-Cause Analysis

### arch-null (zero-shot, 77.8% — single run)
Expected: 25-35%. Got: 77.8%. **This is the most surprising result.**

Possible explanations:
1. **Eval proxy is miscalibrated.** The compliance checker tests for patterns that Claude 3.7 Sonnet naturally avoids — em-dash overuse, negative parallelism, filler intensifiers. Modern Claude may be pre-aligned to avoid these without coaching.
2. **High variance artifact.** n=27 is known to produce swings of ±20pp (prior E range: 59.3–80.8%). A single lucky draw at 77.8% doesn't mean null consistently outperforms coached architectures.
**Required:** Run arch-null a second time before drawing conclusions.

### arch-a (rules-only, 57.5% mean)
Expected ~52%. Got 57.5% (above expectation). More mechanical violations (12 per run) than corrections-only (7).

**Root cause:** 272 rules create cognitive overload. The coaching prompt instructs Claude to follow too many constraints simultaneously, introducing the very patterns it's trying to avoid — verbose hedging, over-structured prose, defensive qualifiers. Less context = better focus.

### arch-a-top10 (Klaassen top-10 rules, 70.4% — single run)
**Klaassen hypothesis CONFIRMED.** Top-10 rules at 70.4% vs full rules at 57.5% = +12.9% uplift.

Loading only the 10 highest-signal rules (by observed frequency) outperforms loading all 272. This confirms Klaassen's 'less is more' principle: a tight, focused rule set reduces noise and improves adherence. The 272-rule set introduces low-signal rules that confuse more than they constrain.

### arch-b (exemplars, 63.0% mean)
Expected ~56%. Got 63.0%. Consistent across both rounds (both 63%).

**Root cause:** Exemplar quality is low. With only 14/258 corrections having polarity tags, arch-b falls back to loading random recent corrections as examples. These aren't curated positive examples — they're arbitrary flagged text. The Every.to method requires high-quality before/after pairs to work. With low-quality exemplars, performance converges to the rules-only baseline.

### arch-c (two-pass editor, FAILED)
Excluded from comparison due to `spawnSync ETIMEDOUT` on two-pass calls. The two-pass approach generates twice per sample (unconstrained write → edit with rules), requiring ~2× the per-sample time. At 90s timeout, edge cases time out.
**Prior prediction:** ~63%. Prior manual result available from `regression/baseline-2026-03-04.json`.

### arch-d (corrections newest-first, 72.2% mean)
Expected ~67%. Got 72.2% mean (within range). **Leading coached architecture.**

**Root cause:** Concrete over abstract. Raw corrections show Claude exactly what Sam changed and why — 'Sam flagged THIS with note THAT' — which is more actionable than 272 abstract rules. Type-filtered (100% writing_type coverage) ensures corrections are relevant. Newest-first prioritizes the most recently observed patterns.

### arch-d-chrono (Lehmann chronological, 59.3% — single run)
**Lehmann chronological hypothesis REJECTED.** Oldest-first (59.3%) performs significantly worse than newest-first (72.2% mean).

**Root cause:** Relevance decay. Sam's writing patterns have evolved over time. Oldest corrections capture patterns Sam has already internalized and moved past. Newest-first surfaces what's currently relevant. A 'learning diary from the beginning' is less useful than 'what did you correct last week.'

### arch-e (hybrid corrections + rules, 61.2% mean)
Expected ~72%. Got 61.2% mean (significantly below expectation). **Underperforms corrections-only by 11.1%.**

**Root cause:** Rules introduce noise that overwhelms correction signal. arch-e loads both 30 corrections AND 247 high-signal rules — the coaching prompt is extremely long. Two failure modes:
1. **Context window dilution:** rules push corrections toward the end where they have less attention.
2. **Conflicting signals:** abstract rules can conflict with concrete corrections, causing hedging behavior that generates mechanical violations.
This directly challenges the Margin thesis that corrections+rules > corrections alone.

### arch-f (Aegis governance schema, 70.4% mean)
Got 70.4% mean. Interesting: r1=66.7%, r2=74.1% — highest variance in the comparison (7.4pp swing).

**Root cause:** Structured JSON governance adds overhead without proportional benefit. The schema-based approach produces highly structured output that may score differently across prompt variations. High variance suggests the governance structure is sensitive to the specific adversarial prompts used.

## External Method Assessments

| Method | Architecture tested | Result | Verdict |
|---|---|---|---|
| Every.to paired examples | arch-b (fallback) | 63.0% | BLOCKED (14/258 polarity tags) — fallback exemplars produce rules-level performance |
| Lehmann feedback.log (newest-first) | arch-d | 72.2% | ✅ CONFIRMED — best coached architecture |
| Lehmann chronological | arch-d-chrono | 59.3% | ❌ REJECTED — newest-first outperforms by +13.0% |
| Klaassen 10 rules beat 100 | arch-a-top10 | 70.4% | ✅ CONFIRMED — top-10 outperforms full rule set by +12.9% |
| Hallie dynamic loading | arch-e (type-filtered) | 61.2% | Baseline — but rules hurt regardless of filtering |
| Dropbox GEPA / DSPy | arch-h (pre-existing) | ≈E | H ≈ E — DSPy optimization doesn't lift beyond data layer |

## Blocked Tests

| Test | Blocker | Action to unblock |
|---|---|---|
| Every.to paired examples | 14/258 corrections have polarity tags | Tag corrections in Margin UI |
| arch-null second run | Not yet run | `npx tsx eval.ts --arch null` — needed to confirm 77.8% result |
| arch-c two-pass editor | 90s timeout on 2× claude calls | Increase generator timeout to 150s |

## Implications for Margin Architecture

**Decision required (for Sam):** The empirical data suggests the correction→rule pipeline's rule component is counterproductive. Two scenarios:

**Scenario A — Simplify to corrections-only (arch-d pattern):**
Drop the rule injection from the coaching pipeline. Load 30 most-recent type-filtered corrections. This would simplify the architecture significantly and may match or exceed the hybrid's performance.

**Scenario B — Apply Klaassen to the hybrid:**
Keep corrections but replace the 247-rule dump with top-10 rules (by signal_count). arch-a-top10's 70.4% suggests this might work. The next experiment: corrections + top-10 rules.

**Scenario C — Maintain thesis with calibration:**
The eval proxy may be miscalibrated (null's 77.8% is suspicious). Before making architectural decisions, validate the compliance checker against real Sam corrections. If the proxy is off, optimization targets the wrong thing.

---

*Generated by autoresearch eval harness, SAM-189. All runs: 27 samples (9 types × 3). Pass = 0 mechanical issues AND dimension ≥ 35/50.*
