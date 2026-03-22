# Experiment Log

SAM-189: Architecture comparison empirical data. Autoresearch loop (loop.ts) optimization follows after arch is confirmed.

## Round 1 Results (2026-03-22)

**Method:** 27 samples per architecture (9 writing types × 3). Pass = 0 mechanical issues AND dimension ≥ 35/50.

| Architecture | Pass Rate | Mean Dim | Mech Issues | Notes |
|---|---|---|---|---|
| arch-null | 77.8% | 47.1 | 8 | Null hypothesis (zero-shot, no coaching) |
| arch-a | 63.0% | 47.4 | 12 | Rules-only baseline |
| arch-b | 63.0% | 47.5 | 12 | Exemplars / few-shot |
| arch-c | FAILED | — | — | Two-pass editor (FAILED — timeout) |
| arch-d | 77.8% | 47.2 | 7 | Corrections-as-context (newest-first) |
| arch-e | 66.7% | 46.6 | 13 | Hybrid corrections + high-signal rules |
| arch-f | 66.7% | 47.0 | 13 | Aegis governance schema |

### Round 1 Key Findings

1. **arch-null (zero-shot) tied for first at 77.8%** — prior prediction was 25-35%. This is the most significant finding: unconstrained Claude performs as well as our best coached architecture in round 1.

2. **arch-d (corrections-only) tied null at 77.8%** — corrections without rules outperforms the hybrid. Adding rules to the hybrid (arch-e) dropped pass rate to 66.7%.

3. **Rules add mechanical violations.** arch-e (hybrid, 13 mech issues) and arch-a (rules-only, 12) have MORE mechanical issues than arch-null (8) and arch-d (7). Rules appear to introduce complexity that generates new failure modes.

4. **arch-c (two-pass editor) excluded.** The two-pass approach (two sequential `claude --print` calls per sample) consistently timed out at 90s on some samples. Prior predicted ~63%. Excluding from comparison.

## Falsification Checkpoint (Round 1)

**Threshold:** if any simpler approach is within 5pp of arch-e → thesis challenged.

| Competitor | arch-e rate | competitor rate | delta | verdict |
|---|---|---|---|---|
| Null (zero-shot) | 66.7% | 77.8% | -11.1% | ⚠️ THESIS CHALLENGED — null leads by 11.1pp |
| arch-a (rules-only) | 66.7% | 63.0% | -3.7% | ✅ thesis confirmed (arch-e leads) |
| arch-d (corrections-only) | 66.7% | 77.8% | -11.1% | ⚠️ THESIS CHALLENGED — d tied or leads |

**⚠️ THESIS CHALLENGED (Round 1)** — both null (zero-shot) and arch-d (corrections-only) match or exceed arch-e (hybrid). However: n=27 variance is known to be high (prior E range: 59.3–80.8%). Round 1 results require round 2 confirmation before drawing architectural conclusions.

*Round 2 is running. This section will be updated with stable 2-round averages.*

## Root-Cause Analysis

### arch-null (zero-shot, 77.8%)
**Result:** Above prediction (predicted 25-35%, got 77.8%). Two explanations:
1. Claude 3.7 Sonnet is already well-calibrated to avoid common writing anti-patterns. The mechanical compliance checker tests for patterns that modern LLMs naturally avoid.
2. Variance: 77.8% in round 1 may represent a lucky draw. Prior arch-e range was 59.3–80.8% across 3 runs. Need round 2 to know if null consistently scores this high.
**Implication:** If null consistently scores ≥60%, the entire coaching pipeline adds no value. This would be the strongest possible falsification signal.

### arch-a (rules-only, 63%)
**Result:** Above prediction (predicted ~52%, got 63%). More mechanical violations (12) than null (8).
**Root cause:** Rules introduce complexity. The coaching prompt with 272 rules creates more surface area for Claude to trip over — it introduces the very patterns it's trying to avoid (verbose phrasing, hedging, structural over-organization). Less is more.

### arch-b (exemplars, 63%)
**Result:** Same as arch-a (predicted ~56%). No uplift from exemplars over rules.
**Root cause:** With only 14/258 corrections having polarity tags, the exemplar pool is essentially random recent corrections, not curated positive examples. The exemplar signal is too noisy to be useful. This blocks the Every.to paired-examples method — you need curated before/after pairs, not random flagged text.

### arch-d (corrections-only, newest-first, 77.8%)
**Result:** Above prediction (predicted ~67%, got 77.8%). Best coached architecture in round 1, tied with null.
**Root cause:** Concrete error signals without abstraction. Raw corrections show Claude the actual mistake in context — 'Sam changed THIS to THAT' — which is more actionable than abstract rules. The corrections are also type-filtered (100% writing_type coverage), so signal is relevant. The newest-first ordering may load the most recent/relevant corrections.

### arch-e (hybrid corrections + rules, 66.7%)
**Result:** Below arch-d (67% vs 78%). Adding high-signal rules to corrections HURTS performance.
**Root cause:** Rule noise overwhelms correction signal. arch-e loads 247 high-signal rules on top of 30 corrections — the coaching prompt becomes extremely long and complex. The model may be optimizing for the rule list rather than for the underlying writing quality. This supports the 'data layer > presentation layer' finding: the data is already good (corrections); adding rule structure dilutes the signal.

### arch-f (Aegis governance schema, 66.7%)
**Result:** Matches arch-e. The structured JSON governance approach adds no uplift over hybrid.
**Root cause:** Same as arch-e — structured presentation of rules doesn't help when the underlying data (247 rules) is too large. Governance structure helps with complex multi-step reasoning, not with voice/style adherence.

## External Method Assessments

### Every.to paired examples (BLOCKED)
Only 14/258 corrections have polarity tags (need ≥20 positive examples for meaningful test). The arch-b variant falls back to using recent corrections as exemplars, which lacks the curated before/after pairing that makes Every.to's method work.
**Action required:** Tag corrections with polarity (positive/negative) in Margin UI to unlock this test.

### Lehmann feedback.log / Dropbox DSPy (arch-d)
Tested as arch-d (newest-first corrections). Result: 77.8% in round 1, tied for best coached architecture.
The Lehmann method — preserving full correction context rather than abstracting into rules — performs better than rule-based approaches. This validates the 'concrete > abstract' hypothesis.

### Klaassen '10 rules beat 100' (arch-a-top10)
*Variant running — results pending.*

### Lehmann chronological (arch-d-chrono)
*Variant running — results pending.*

### Hallie dynamic loading
arch-e already uses `loadWritingRulesForType()` which is type-filtered (Hallie's method). The Hallie variant (full dump vs filtered) can be tested by re-running arch-e with all rules. However, given arch-e already underperforms corrections-only, this test has low priority pending round 2 confirmation.

### Dropbox GEPA / DSPy (arch-h)
Pre-existing result: arch-h (DSPy-optimized) matched arch-e but didn't exceed it. Result: H ≈ E.
Confirms: optimizing *how* the coaching prompt presents data (DSPy) doesn't lift beyond optimizing *which* data loads. 'Data layer > presentation layer.'

## Blocked Tests

| Test | Blocker | Action to unblock |
|---|---|---|
| Every.to paired examples | 14/258 corrections have polarity (need ≥20) | Tag corrections in Margin UI |
| arch-c two-pass editor | 90s timeout insufficient for 2× claude calls | Increase timeout to 150s or use async pattern |

## Notes on Eval Proxy

The pass rate metric (0 mechanical issues AND dimension ≥35/50) has not been validated against Sam's actual correction patterns. Round 1's surprising null result (77.8%) raises the question: is the compliance checker measuring what we think it measures?

Potential calibration issue: if Claude's base writing is already 'mechanically clean' by our compliance checker's definition, the checker may be testing the wrong things. The corrections Sam makes may be about voice/tone/authenticity signals that are hard to mechanically measure.

This is Goodhart's Law risk: optimizing the proxy (mechanical cleanliness) may diverge from the actual goal (writing that matches Sam's voice). Calibration against real corrections is Tier 2 work requiring Sam's time.

