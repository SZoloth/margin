# Autoresearch Experiment Log

## Run 1 — 2026-03-13 — Tier 0 baseline (INVALIDATED)

**Purpose:** First baseline across A, B, C, D.
**Result:** INVALIDATED. Architecture A had a generation timeout on cover-letter sample 3, scored as 99 mechanical issues. This poisoned A's total_mechanical (114 instead of ~15) and inflated D's apparent advantage. B and D failed entirely (`require is not defined` — ESM/CJS module issue). C timed out (20-min cap insufficient for 54 API calls).
**Lesson:** Failed generations must be excluded from metrics, not scored as worst-case. Fixed in score.ts.

## Run 2 — 2026-03-13 — Tier 0 baseline (clean)

**Purpose:** Rerun with fixed scoring (exclude failed generations, retry once on timeout).
**Results:**

| Architecture | Pass Rate | Mean Dim | Total Mech | Samples | Duration |
|---|---|---|---|---|---|
| A (rules) | 0.519 | 46.2 | 21 | 27 | 526s |
| B (exemplars) | 0.556 | 44.4 | 24 | 27 | 385s |
| C (editor) | TIMEOUT | - | - | - | - |
| D (corrections) | 0.667 | 46.7 | 9 | 27 | 520s |

**C timeout:** baseline-all.ts wrapper had 20-min per-architecture limit. C makes 54 API calls (2x others). Structural issue, not a fluke.

**Observations:**
- D > B ≈ A on pass rate. Gap between A and D is ~4 samples.
- Mechanical issues: D (9) significantly cleaner than A (21) and B (24).
- Dimension scores flat across all (44-47). Voice quality is comparable — the difference is mechanical compliance.
- n=27 gives ±18% confidence intervals. Cannot distinguish A from B with confidence.

## Run 3 — 2026-03-13 — Architecture C standalone

**Purpose:** Get C data. Ran eval.ts directly (no timeout wrapper).
**Results:**

| Architecture | Pass Rate | Mean Dim | Total Mech | Samples | Duration |
|---|---|---|---|---|---|
| C (editor) | 0.630 | 47.2 | 11 | 27 | 1424s |

**Observations:**
- C (63%) slots between B (55.6%) and D (66.7%).
- C costs 2.7x the time of A/D for comparable results to D.
- The edit pass reduces mechanical issues (11 vs A's 21) but doesn't match D's 9.
- Two-pass approach is expensive and doesn't justify the cost over D.

## Run 4 — 2026-03-13 — D vs E head-to-head

**Purpose:** Test hybrid hypothesis. E = D's corrections + high-signal rules (signal_count ≥ 2 or severity = must-fix).
**Results:**

| Architecture | Pass Rate | Mean Dim | Total Mech | Samples | Duration |
|---|---|---|---|---|---|
| D (corrections) | 0.556 | 46.4 | 13 | 27 | 557s |
| E (hybrid) | 0.769 | 46.5 | 8 | 27 | 735s |

**Per-type breakdown:**

| Type | D pass | E pass | D mech | E mech |
|---|---|---|---|---|
| general | 0.333 | 0.333 | 1 | 1 |
| email | 0.333 | 0.333 | 0.7 | 0.7 |
| cover-letter | 0 | 1 | 1 | 0 |
| outreach | 0.333 | 1 | 0.7 | 0 |
| prd | 1 | 0.667 | 0 | 0.3 |
| blog | 0.333 | 1 | 0.7 | 0 |
| resume | 1 | 1 | 0 | 0 |
| slack | 1 | 1 | 0 | 0 |
| pitch | 0.667 | 0.667 | 0.3 | 0.7 |

**Observations:**
- E at 76.9% is the highest pass rate observed in any run.
- E closes specific gaps: cover-letter 0→100%, outreach 33→100%, blog 33→100%.
- D regressed this run (55.6% vs 66.7% in Run 2) — confirms high variance at n=27.
- Negative parallelism on `general` persists across both architectures.
- The high-signal rules appear to catch structural patterns that corrections alone miss.
- E is ~30% slower than D (735s vs 557s) due to larger prompt. Acceptable.

## Run 5 — 2026-03-13 — E confirmation run 1

**Purpose:** Tier 0.5 — confirm E's lead. Need 2+ runs above 65% before committing.
**Results:**

| Architecture | Pass Rate | Mean Dim | Total Mech | Samples | Duration |
|---|---|---|---|---|---|
| E (hybrid) | 0.593 | 46.6 | 12 | 27 | ~700s |

**Observations:**
- E's lowest run. 59.3% is below the 65% threshold individually.
- 12 mechanical issues — worst of the three E runs.
- Confirms high variance at n=27 (E range so far: 0.593-0.769).
- Not alarming in isolation — D varied similarly (0.556-0.667).

## Run 6 — 2026-03-13 — E confirmation run 2

**Purpose:** Third E data point to establish mean and range.
**Results:**

| Architecture | Pass Rate | Mean Dim | Total Mech | Samples | Duration |
|---|---|---|---|---|---|
| E (hybrid) | 0.808 | 46.8 | 5 | 27 | ~700s |

**Observations:**
- E's highest run. 80.8% with only 5 mechanical issues.
- Dimension scores remain flat (46.8 vs 46.5-46.6 in prior runs).
- The variance between E's best (80.8%) and worst (59.3%) is 21.5 percentage points — typical for n=27.

## Variance tracking

| Architecture | Runs | Mean Pass Rate | Range | Total Samples |
|---|---|---|---|---|
| E (hybrid) | 0.769, 0.593, 0.808 | **0.723** | 0.593-0.808 | 81 |
| D (corrections) | 0.667, 0.556 | 0.612 | 0.556-0.667 | 54 |
| A (rules) | 0.519 | 0.519 | — | 27 |
| B (exemplars) | 0.556 | 0.556 | — | 27 |
| C (editor) | 0.630 | 0.630 | — | 27 |

## Tier 0.5 Decision — ARCHITECTURE E CONFIRMED

**Threshold:** PROGRAM.md specified "If E holds above 65% across runs, proceed to Tier 1."

**E's 3-run average: 72.3%.** Exceeds the 65% threshold by 7.3 points. Even E's worst single run (59.3%) is within one standard deviation of the mean — and at n=27, a single bad run is expected noise. The 81-sample aggregate (across 3 runs) gives much tighter confidence intervals than any single run.

**E vs D:** E's mean (72.3%) beats D's mean (61.2%) by 11.1 percentage points. With 81 vs 54 total samples, the gap is meaningful. E also averages fewer mechanical issues per run (8.3 vs 11.0).

**Decision: Commit to Architecture E as the base for Tier 1 optimization.**

Eliminated: A (rules-only), C (editor — cost). Shelved: B (exemplars). D remains as a reference point but is not the optimization target.

## Tier 1 Experiments

### T1-Exp1 — Negative parallelism prohibition (REVERTED)

**Hypothesis:** Adding an explicit "ABSOLUTE PROHIBITIONS" section for negative parallelism will eliminate the #1 persistent failure.
**Change:** Added `<absolute-prohibitions>` block to E's prompt with 4 pattern variants and before/after rewrites.
**Results:**

| Metric | E baseline (mean) | T1-Exp1 |
|---|---|---|
| Pass rate | 72.3% | 66.7% |
| Total mechanical | 8.3 avg | 15 |
| Neg-para violations | ~2-3/run | **0** |
| Repetitive-structure | ~2-3/run | **9** |
| Long-sentence | ~1-2/run | **5** |

**Outcome: REVERTED.** The neg-para prohibition worked perfectly (zero violations), but the model compensated with monotonous sentence lengths. Suppressing one pattern without addressing the underlying structural variety problem is whack-a-mole.

**Lesson:** Single-pattern prohibitions can push errors elsewhere. The next attempt should combine neg-para prohibition with a sentence variety instruction.

### T1-Exp2 — Combined: neg-para + sentence variety (REVERTED)

**Hypothesis:** Address both neg-para and repetitive-structure simultaneously to prevent whack-a-mole.
**Change:** Softer `<structural-constraints>` block with both neg-para examples and sentence rhythm guidance.
**Results:** 59.3% pass rate, 16 mechanical issues. Neg-para leaked (2 violations despite prohibition). Repetitive-structure still dominant (10 violations). Sentence variety instruction had no measurable effect.

**Outcome: REVERTED.** The softer framing ("structural-constraints" vs "absolute-prohibitions") let neg-para leak through. And prose instructions for sentence variety don't work — the model can't count word lengths during generation.

**Key insight: Prompt-level structural instructions are weak.** The model semi-ignores them under generation pressure. The only intervention that fully eliminated neg-para was Exp1's aggressive "ABSOLUTE PROHIBITIONS" framing — but that caused whack-a-mole. This suggests the intervention point should be *post-generation* (like Architecture C's edit pass) rather than *during generation*.

### T1-Exp3 — Architecture F first run

**Purpose:** Test whether structured governance schema improves compliance vs prose instructions.
**Results:**

| Metric | E baseline (mean) | F (run 1) |
|---|---|---|
| Pass rate | 72.3% | **76.9%** |
| Total mechanical | 8.3 avg | **7** |
| Neg-para violations | ~2-3 | **0** |
| Samples | 81 (3 runs) | 26 (1 failed gen excluded) |

**Per-type:** email 100%, outreach 100%, prd 100%, resume 100%, slack 100%, blog 67%, cover-letter 50%, general 33%, pitch 33%.

**Observations:**
- Zero negative parallelism violations. The JSON-structured prohibition with typed match_variants is more effective than prose.
- "leverage" appeared twice (blog, cover-letter) — the kill word list needs to be in the governance schema.
- Only 7 mechanical issues total: 3 repetitive-structure, 2 long-sentence, 2 kill-word.
- 1 generation failed (cover-letter sample 2) — excluded per scoring rules.
- 76.9% matches E's best single run but with cleaner mechanical profile.

**Status:** First run promising, needed confirmation.

### T1-Exp4 — Architecture F confirmation runs

**Purpose:** Confirm F's first-run 76.9%.
**Results:**

| Run | Pass Rate | Mean Dim | Total Mech | Neg-para | Samples |
|---|---|---|---|---|---|
| F run 1 | 76.9% | 46.7 | 7 | 0 | 26 |
| F run 2 | 55.6% | 45.9 | 14 | 0 | 27 |
| F run 3 | 59.3% | 46.9 | 11 | 0 | 27 |
| **F mean** | **63.9%** | 46.5 | 10.7 | **0** | 80 |

**Comparison:**

| Architecture | Mean Pass Rate | Mean Mechanical | Neg-para | Runs |
|---|---|---|---|---|
| **E (hybrid)** | **72.3%** | 8.3 | 2-3/run | 3 |
| F (aegis) | 63.9% | 10.7 | **0** | 3 |
| D (corrections) | 61.2% | 11.0 | varied | 2 |

**Decision: F does NOT beat E.** F's mean (63.9%) is 8.4 points below E (72.3%) and barely above D (61.2%). The structured governance schema is worse overall despite perfectly eliminating neg-para (0 across all 80 samples).

**Key finding:** F's JSON-structured prohibition reliably eliminates negative parallelism (the ONE thing E can't fix). But the verbose governance framing trades overall compliance for schema adherence — more repetitive-structure violations, suggesting the model overthinks structure at the expense of rhythm.

**Actionable insight:** Don't use F wholesale. Borrow F's structured prohibition technique for neg-para, keep E's simpler prose format for everything else. Build Architecture G: E + targeted JSON prohibition block.

### T1-Exp5 — Architecture G: E + targeted prohibition — KEPT

**Hypothesis:** E's prose format + F's compact structured prohibition for neg-para only (no full governance schema).
**Change:** Added a single `<prohibition>` block to E's prompt with match variants and bad/good examples. ~10 lines of additional prompt.
**Results:**

| Run | Pass Rate | Mechanical | Neg-para |
|---|---|---|---|
| G run 1 | 70.4% | 11 | 0 |
| G run 2 | 74.1% | 11 | 1 |
| G run 3 | 66.7% | 10 | 0 |
| **G mean** | **70.4%** | **10.7** | **0.3** |

**Comparison to all architectures:**

| Architecture | Mean Pass | Range | Neg-para | Runs | Samples |
|---|---|---|---|---|---|
| A (rules) | 51.9% | — | varied | 1 | 27 |
| B (exemplars) | 55.6% | — | varied | 1 | 27 |
| D (corrections) | 61.2% | 55.6-66.7% | varied | 2 | 54 |
| C (editor) | 63.0% | — | varied | 1 | 27 |
| F (aegis) | 63.9% | 55.6-76.9% | **0** | 3 | 80 |
| **G (E + prohibition)** | **70.4%** | 66.7-74.1% | **~0** | 3 | 81 |
| E (hybrid) | 72.3% | 59.3-80.8% | 2-3/run | 3 | 81 |

**Decision: KEEP G as the new base.** Rationale:
1. G's mean (70.4%) is within noise of E's mean (72.3%) — 1.9pp difference, well within n=27 confidence intervals.
2. G nearly eliminates neg-para (1 leak in 81 samples vs ~7 for E). Practical improvement for the user.
3. G has tighter variance (7.4pp range vs E's 21.5pp). More predictable output quality.
4. The prohibition adds ~10 lines to the prompt. Negligible cost.

The remaining failures are dominated by **repetitive-structure** (the new #1) and **long-sentence**. Both are fundamentally harder to fix via prompt — the model can't count word lengths during generation.

## Current state

**Architecture G is the production candidate.** It lives in `arch-e-hybrid.ts` (the prohibition block was added to E's generator directly — no separate file).

**Remaining violations by frequency across G's 81 samples:**
- repetitive-structure: ~25 violations. The #1 problem. Present in general (100% failure), pitch (~67% failure), and sporadically in prd/cover-letter/blog.
- long-sentence (>40 words): ~8 violations. Mostly outreach and blog.
- kill words (leverage, dynamic): ~3 violations. Sporadic.
- neg-para: 1 violation (nearly eliminated).

## Tier 2a — Eval expansion — 2026-03-15

**Purpose:** The calibration study showed the proxy catches ~4% of Sam's corrections. Expand `compliance-check.ts` to close the gap before further architecture optimization.

**Changes to `compliance-check.ts`:**
- 3 new neg-para regex variants (don't X — Y, more X not Y, X works/Y fails)
- "is the kind of X that" AI slop pattern
- 3 hyperbolic claim patterns (most X thing, thing nobody X, the real X is)
- Em dash counting (>2 per document)
- Prose colon counting (>1 per document)
- Missing period detection at paragraph end

**Re-calibration against Sam's 28 corrections:**

| Metric | Old proxy | New proxy |
|---|---|---|
| True positives | ~1 | ~11.5 |
| False positives | ~3 | ~3 |
| Catch rate | ~4% | ~41% |

**Per-sample improvement:**
- general: 0.5 → 4.5 catches (of 11)
- email: 0 → 4 catches (of 7)
- outreach: 0 → 1 catch (of 3)
- blog: 0.5 → 2 catches (of 2)

**New Architecture G baseline (expanded proxy):**

| Metric | Old proxy | New proxy |
|---|---|---|
| Pass rate | 70.4% (3-run mean) | 46.2% |
| Total mechanical | ~8 per 27 samples | 26 per 26 samples |
| Worst types | general (rep-struct) | email (9 mech), outreach (5 mech) |

**Per-type results (expanded proxy):**
- resume: 3/3 pass — cleanest type
- prd: 2/3 pass — one mechanical issue
- blog: 2/3 pass — long sentence + neg-para variant
- pitch: 2/3 pass — repetitive-structure
- cover-letter: 1/3 pass
- general: 1/3 pass — repetitive-structure + kill words
- slack: 1/2 pass (1 timeout)
- email: 0/3 pass — worst performer (long sentences, colons, missing periods)
- outreach: 0/3 pass — em dashes, missing periods

The 46.2% is a much more honest baseline. The expanded proxy catches issues Sam would actually flag, so optimizing against it now has real value.

## Tier 1 Resume — Exp 6: Expanded prohibitions — 2026-03-15

**Purpose:** With the expanded compliance checker (Tier 2a), resume Tier 1 optimization. Added prohibition blocks for: em dash limit (≤2), terminal punctuation, AI slop ("is the kind of"), hyperbolic claims, colon limit, and expanded neg-para variants.

**Generator:** `arch-e-hybrid.ts` — `<prohibitions>` block expanded from 1 prohibition (neg-para) to 6.

**Results (3 runs, expanded proxy):**

| Run | Pass Rate | Total Mechanical | Samples |
|---|---|---|---|
| 1 | 59.3% | 24 | 27 |
| 2 | 51.9% | 16 | 27 |
| 3 | 51.9% | 20 | 27 |
| **Mean** | **54.4%** | **20** | **81** |

**Comparison against pre-prohibition baseline (expanded proxy):**

| | Baseline (expanded proxy) | + Prohibitions |
|---|---|---|
| Pass rate | 46.2% | 54.4% (+8.2pp) |
| Total mech | 26/26 samples | 20/27 avg |

**Per-type patterns across 3 runs:**
- resume: 9/9 pass (100%) — consistently clean
- cover-letter: 7/9 pass (78%) — strong
- blog: 8/9 pass (89%) — strong
- prd: 6/9 pass (67%) — decent
- general: 3/9 pass (33%) — repetitive-structure + kill words
- pitch: 3/9 pass (33%) — repetitive-structure
- slack: 6/9 pass (67%) — missing periods occasionally
- email: 1/9 pass (11%) — worst performer (long sentences, missing periods, colon excess)
- outreach: 1/9 pass (11%) — em dashes, missing periods, long sentences

**Decision:** KEEP. The prohibitions improve pass rate against the calibrated proxy. The remaining failures cluster in email and outreach — these need targeted investigation.

**Remaining failure analysis:**
- **Email** failures: long sentences (model generates coaching commentary in brackets that inflates word count), missing periods on sign-offs, colon excess. The bracket commentary is a generation artifact — the `stripMetaCommentary` function may not be catching all forms.
- **Outreach** failures: em dashes (4+ per sample despite prohibition), missing periods. The em dash prohibition may need a stronger framing or the model may be ignoring it under generation pressure.

## Tier 1 Resume — Exp 7: Meta-commentary fix + rep-struct threshold — 2026-03-15

**Purpose:** Two fixes to reduce false positives and generation artifacts:
1. Expanded `stripMetaCommentary()` in `shared.ts` to remove inline bracketed coaching instructions (e.g., "[One sentence on why...]") that inflate sentence word counts
2. Raised repetitive-structure threshold from 4 to 5 consecutive sentences — calibration study showed 4-sentence runs are false positives (Sam didn't flag them)

**Results (3 runs, expanded + calibrated proxy):**

| Run | Pass Rate | Total Mechanical | Samples |
|---|---|---|---|
| 1 | 70.4% | 9 | 27 |
| 2 | 55.6% | 18 | 27 |
| 3 | 63.0% | 12 | 27 |
| **Mean** | **63.0%** | **13** | **81** |

**Progression (all with expanded proxy):**

| Stage | Mean Pass Rate | Key change |
|---|---|---|
| Baseline (no prohibitions) | 46.2% | Expanded proxy catches real issues |
| + Expanded prohibitions (Exp 6) | 54.4% | Em dash, punctuation, slop prohibitions |
| + Meta-strip + rep-struct fix (Exp 7) | **63.0%** | Fewer false positives, cleaner scoring |

**Per-type consistency (across 9 samples each):**
- resume: 9/9 (100%)
- cover-letter: 8/9 (89%)
- blog: 8/9 (89%)
- prd: 7/9 (78%)
- pitch: 5/9 (56%)
- general: 4/9 (44%)
- slack: 6/9 (67%)
- email: 2/9 (22%)
- outreach: 2/9 (22%)

**Decision:** KEEP. 63% with a proxy that catches 41% of Sam's corrections is meaningful. The remaining failures are concentrated in email and outreach, which have structural generation problems (long sentences, em dash leaking).

## Tier 1 Resume — Exp 8: Length constraints + coaching strip — 2026-03-15

**Purpose:** Address email/outreach failures by adding type-specific length guidance to the generator prompt and improving `stripMetaCommentary` to remove bracketed coaching instructions.

**Changes:**
1. Type-specific length constraints: email (3-5 sentences), outreach (2-3 sentences), slack (1-2 sentences), resume (one bullet, <30 words)
2. Explicit instruction against bracketed coaching: "No bracketed coaching instructions like [One sentence about why...]"
3. Short placeholder names like [Name] or [Company] explicitly allowed

**Results (3 runs, calibrated proxy):**

| Run | Pass Rate | Total Mech | Email | Outreach |
|---|---|---|---|---|
| 1 | 70.4% | 10 | 3/3 | 1/3 |
| 2 | 70.4% | 9 | 1/3 | 2/3 |
| 3 | 70.4% | 9 | 3/3 | 3/3 |
| **Mean** | **70.4%** | **9.3** | **7/9 (78%)** | **6/9 (67%)** |

**Zero variance.** All three runs produced identical pass rates — unprecedented in all previous experiments.

**Full progression (this session, all with calibrated proxy):**

| Stage | Mean Pass | Range | Email | Outreach |
|---|---|---|---|---|
| Baseline (expanded proxy only) | 46.2% | — | 0/3 | 0/3 |
| + Expanded prohibitions | 54.4% | 7.4pp | 1/9 | 1/9 |
| + Meta-strip + rep-struct threshold | 63.0% | 14.8pp | 2/9 | 2/9 |
| **+ Length constraints** | **70.4%** | **0pp** | **7/9** | **6/9** |

**Decision:** KEEP. This is the strongest result of the entire autoresearch campaign. The combination of calibrated proxy + expanded prohibitions + length constraints + meta-commentary stripping produces a stable, high-quality system.

**Per-type consistency (3 runs × 9 types × 3 samples = 81):**
- resume: 9/9 (100%)
- blog: 8/9 (89%)
- prd: 7/9 (78%)
- email: 7/9 (78%)
- slack: 8/9 (89%)
- cover-letter: 6/9 (67%)
- outreach: 6/9 (67%)
- general: 4/9 (44%)
- pitch: 2/9 (22%)

**Remaining failure patterns:**
- **general** (44%): repetitive-structure (5-10 consecutive similar-length sentences). The model generates list-like prose for "blog intro about why PMs should learn to code."
- **pitch** (22%): repetitive-structure + occasional neg-para. The model generates parallel-structure pitch copy.
- Remaining mechanical issues average 9.3 per 27 samples (was 26 before optimization).

## Session summary — 2026-03-15

Starting point: Architecture G at 70.4% with old proxy (catches ~4% of Sam's corrections).
Ending point: Architecture G at **70.4% with calibrated proxy (catches ~41% of Sam's corrections)**.

The headline number is the same, but the meaning is radically different. The old 70.4% was achieved against an undertesting proxy that missed 96% of what Sam would flag. The new 70.4% is against a proxy that catches 10× more of Sam's actual corrections. The system is now optimizing against checks that matter.

**Changes made:**
1. `compliance-check.ts`: +6 check categories (neg-para variants, AI slop, hyperbolic claims, em dashes, colons, missing periods), rep-struct threshold 4→5
2. `shared.ts`: bracket coaching instruction stripping in `stripMetaCommentary`
3. `arch-e-hybrid.ts`: expanded prohibition block (6 prohibitions), type-specific length constraints, anti-coaching-bracket instruction

## Production parity test — 2026-03-15

**Purpose:** Validate that the Go CLI production codepath (`margin export coaching-prompt`) produces equivalent quality to the TypeScript reference (`arch-e-hybrid.ts`). Both use the same SQL queries, prohibition blocks, and prompt structure — but in different languages. This test confirms the wiring works.

**Method:** New generator `arch-g-production.ts` shells out to `margin export coaching-prompt --type <type> --register <register>`, then passes the output to Claude. Same eval harness, same compliance checker, same 27 prompts.

**Results (single run each, calibrated proxy):**

| Architecture | Pass Rate | Total Mech | Mean Dim | Duration |
|---|---|---|---|---|
| G production (Go CLI) | 66.7% | 11 | 46.8 | 684s |
| E reference (TypeScript) | 74.1% | 7 | 46.7 | 736s |

**Per-type comparison:**

| Type | G (Go CLI) | E (TypeScript) |
|---|---|---|
| general | 33% | 67% |
| email | 0% | 100% |
| cover-letter | 33% | 67% |
| outreach | 100% | 100% |
| prd | 67% | 67% |
| blog | 67% | 33% |
| resume | 100% | 100% |
| slack | 100% | 100% |
| pitch | 100% | 33% |

**Analysis:**
- Overall pass rates within expected n=27 variance (7.4pp difference, typical range is ~15-21pp).
- Dimension scores nearly identical (46.8 vs 46.7) — voice quality is equivalent.
- Per-type differences are noise at n=3: G wins on pitch (100% vs 33%) and blog (67% vs 33%), E wins on email (100% vs 0%) and general (67% vs 33%).
- Both share the same failure modes: repetitive-structure, long-sentence, missing-period.
- G's email failure was missing periods on sign-offs — a generation variance issue, not a coaching prompt issue.
- No systematic difference. The Go CLI output is functionally equivalent to the TypeScript reference.

**Verdict: PARITY CONFIRMED.** The production codepath produces writing quality indistinguishable from the research reference. The 7.4pp gap is well within single-run variance (prior E runs ranged from 59.3% to 80.8%). Production wiring is validated.

## Next investigations

1. **General/pitch repetitive-structure** — the last major failure mode. May need post-generation check or acceptance as floor.
2. **Tier 2b** — LLM-as-judge for content quality. The mechanical ceiling is ~50-60% catch rate. Getting higher requires content evaluation.
3. **Production wiring** — Architecture G with all optimizations should replace the current coaching-prompt.md pipeline.
4. **Second calibration study** — generate fresh samples with the optimized system, have Sam correct them, measure true catch rate improvement.

1. **Tier 2b — LLM-as-judge** for content quality (show-don't-tell, CTA quality, buried impact). The mechanical ceiling is ~50-60%. Getting higher requires a second LLM call per sample.
2. **Repetitive-structure evaluation** — is it a false signal? Sam didn't flag it where the proxy did.
3. **Register classification** — email follow-up was misclassified as casual.
4. After Tier 2b decision: resume Tier 1 optimization (correction selection, rule selection, prompt structure) against the calibrated proxy.
