# Eval Calibration Study — 2026-03-13

## Purpose

The compliance scoring (mechanical checks + dimension heuristics) is a proxy for "would Sam correct this?" If the proxy doesn't correlate with Sam's actual editorial judgment, optimizing against it is wasted work.

## Method

1. Generated 9 samples (1 per writing type) using Architecture G (the production candidate)
2. Scored each with the compliance checker — results hidden from Sam
3. Sam reads each sample blind and marks what he'd correct
4. Compare: proxy flags vs Sam's corrections

## Key questions

- **True positives:** Does the proxy flag things Sam would also flag?
- **False positives:** Does the proxy flag things Sam wouldn't care about?
- **False negatives:** Does Sam flag things the proxy misses entirely?
- **Severity alignment:** Are the proxy's "mechanical issues" the same things Sam considers must-fix?

## Implications

- If correlation is high → continue optimizing against the proxy with confidence
- If false negatives dominate → the proxy is too lenient, needs new checks
- If false positives dominate → the proxy is too strict, wasting optimization effort on non-issues
- If correlation is low across the board → the proxy needs fundamental redesign before further optimization

## Sample 1 — General (casual)

**Proxy verdict:** FAIL (2 mechanical issues, dim=46)
**Proxy violations:** 2× repetitive-structure (consecutive similar-length sentences)

**Sam's corrections (11 annotations):**

| # | Sam's correction | Proxy caught? | Category |
|---|---|---|---|
| 1 | Hyperbolic opener ("most useful thing") | No | Voice/tone — overpromise |
| 2 | Tense error ("I learned" → "I had learned") | No | Grammar |
| 3 | "That's it" → "That's all" | No | Word choice |
| 4 | Em dash flagged | Partially (rule exists, didn't trigger) | Punctuation |
| 5 | Staccato rhythm + "landed differently" is tell-not-show | Partial overlap (repetitive-structure) | Voice/rhythm + show-don't-tell |
| 6 | Missing concrete examples for "the right question" | No | Content gap |
| 7 | Colon + "actually" | No ("actually" should be kill word) | Kill word gap |
| 8 | Missing transition ("But, they do become...") | No | Flow/transitions |
| 9 | Hyperbolic claim ("thing nobody mentions") | No | Voice/tone — overpromise |
| 10 | Misrepresents PM operating processes | No (unflaggable — domain accuracy) | Factual |
| 11 | Neg-para: "You don't need to ship — you need to understand" | **No — regex gap!** | Neg-para variant |

**Analysis:**
- **True positives:** ~0.5 (repetitive-structure partially overlaps with Sam's staccato complaint, but for wrong reason)
- **False positives:** 1.5 (the other repetitive-structure flag doesn't map to any of Sam's corrections)
- **False negatives:** 9-10 (Sam flagged 11 things, proxy caught ~1 partially)
- **Critical gap:** "don't X — you need to Y" is a neg-para variant not covered by any of the 3 compliance regexes

**Preliminary conclusion from Sample 1:** The proxy is dramatically undertesting. Sam found 11 issues; the proxy found 2, and those 2 only partially overlap with Sam's concerns. The proxy focuses on mechanical patterns (sentence length, punctuation) while Sam's editorial judgment spans grammar, tone, content quality, transitions, and show-don't-tell. The proxy is measuring a narrow slice of what matters.

## Sample 2 — Email (casual)

**Proxy verdict:** PASS (0 mechanical issues, dim=43)

**Sam's corrections (7 annotations):**

| # | Sam's correction | Proxy caught? | Category |
|---|---|---|---|
| 1 | Missing introduction/context — register misclassified as casual, should be professional | No | Register/framing |
| 2 | "The part that stuck with me" → needs note-taking framing + specific concept | No | Content depth |
| 3 | Em dash — remove | No (em dash count didn't hit threshold) | Punctuation |
| 4 | "reframed" needs concrete example of how | No | Show-don't-tell |
| 5 | "walked away more interested, not less" — neg-para + why would less be on the table? | **No — neg-para regex gap** | Neg-para variant + logic |
| 6 | "is the kind of X that" — AI tell/slop + too generic + should show why they'd want me | No | Slop pattern + content |
| 7 | Bad CTA (too vague, puts work on reader) + missing period | No (missing period not checked) | Content quality + punctuation |

**Analysis:** Proxy said PASS. Sam found 7 issues, some severe (neg-para, AI slop pattern, bad CTA). **Complete false negative.**

## Sample 3 — Outreach (casual)

**Proxy verdict:** PASS (0 mechanical issues, dim=47)

**Sam's corrections (3 annotations):**

| # | Sam's correction | Proxy caught? | Category |
|---|---|---|---|
| 1 | "Been following" → "I've been following" + needs to describe WHY the trigger moment mattered | No | Grammar + content depth |
| 2 | Factual error ("I'm a PM wrapping up a stretch at DreamWorks") — wrong title, wrong framing. "What's next" needs to be shaped to the recipient | No (unflaggable — factual) | Factual accuracy |
| 3 | Missing period + bad CTA (no value prop, no specific hook) | No | Punctuation + content quality |

**Analysis:** Proxy said PASS. Sam found 3 issues. The factual error is unflaggable by a mechanical checker, but the grammar and CTA quality are checkable. **False negative.**

## Sample 4 — PRD (professional)

**Proxy verdict:** PASS (0 mechanical issues, dim=48)

**Sam's correction (1 annotation):**

| # | Sam's correction | Proxy caught? | Category |
|---|---|---|---|
| 1 | "This sample is pretty good!" | N/A — positive signal | Positive |

**Analysis:** Proxy and Sam agree. **True negative** (correctly passed). The one sample both agree is solid.

## Sample 5 — Blog (professional)

**Proxy verdict:** FAIL (1 mechanical issue — long sentence 51 words, dim=50)

**Sam's corrections (2 annotations):**

| # | Sam's correction | Proxy caught? | Category |
|---|---|---|---|
| 1 | "No one on the team believes the Q3 column" — hard to follow, needs more reader empathy | Partially (flagged as long-sentence, Sam flags as unclear) | Readability |
| 2 | "Theater works for that audience. It fails everyone else." — negative parallelism | **No — neg-para variant!** | Neg-para |

**Analysis:** Proxy caught the long sentence but missed the neg-para ("X works for Y. It fails Z" — a variant the regex doesn't cover). Sam also flagged the long sentence but for different reasons (clarity, not length). **Partial overlap but different reasoning.**

## Sample 6 — Resume (professional)

**Proxy verdict:** PASS (0 mechanical issues, dim=47)

**Sam's correction (1 annotation):**

| # | Sam's correction | Proxy caught? | Category |
|---|---|---|---|
| 1 | Way too long, em dash, buried impact. Should lead with outcome: "Lifted 30-day retention..." | No | Structure + em dash + impact ordering |

**Analysis:** Proxy said PASS. Sam found a significant structural issue (buried lede) plus an em dash. **False negative.** The em dash rule exists but didn't trigger — resume bullets may be treated differently.

## Sample 7 — Slack (casual)

**Proxy verdict:** PASS (0 mechanical issues, dim=47)

**Sam's correction (1 annotation):**

| # | Sam's correction | Proxy caught? | Category |
|---|---|---|---|
| 1 | "Hey everyone" → "Howdy all!" | No | Voice/personality |

**Analysis:** Minor voice preference. Proxy correctly passed this as mechanically clean. Sam's correction is a personal voice choice, not an error. **Mostly true negative** — this is the kind of correction that's hard for any proxy to catch (it's about personality, not pattern avoidance).

## Sample 8 — Pitch (professional)

**Proxy verdict:** FAIL (2 mechanical issues, dim=48)
**Proxy violations:** 2× repetitive-structure

**Sam's corrections:** 0 annotations (no corrections given for pitch).

**Analysis:** Proxy said FAIL on repetitive-structure, but Sam didn't flag anything. **False positive** — the proxy is flagging something the user doesn't care about in this context.

---

## Calibration Summary

### By sample

| Sample | Type | Proxy | Sam's issues | Agreement |
|---|---|---|---|---|
| 1 | general | FAIL (2 mech) | 11 corrections | Weak partial overlap — proxy caught rhythm, missed everything else |
| 2 | email | PASS | 7 corrections | **Complete false negative** — proxy missed neg-para, slop, CTA quality |
| 3 | outreach | PASS | 3 corrections | **False negative** — grammar, CTA quality, factual error |
| 4 | prd | PASS | "pretty good!" | **True negative** — both agree it's clean |
| 5 | blog | FAIL (1 mech) | 2 corrections | Partial overlap — proxy caught length, missed neg-para |
| 6 | resume | PASS | 1 correction | **False negative** — buried impact, em dash |
| 7 | slack | PASS | 1 minor correction | **Mostly true negative** — voice preference only |
| 8 | pitch | FAIL (2 mech) | 0 corrections | **False positive** — proxy flagged what Sam doesn't care about |

### Aggregate numbers

- **Sam's total corrections:** 28 across 8 samples (avg 3.5 per sample)
- **Proxy's total violations:** 5 across 8 samples (avg 0.6 per sample)
- **True positives (proxy caught what Sam cares about):** ~1 (partial, in blog/general)
- **False positives (proxy flags Sam doesn't care about):** ~3 (pitch repetitive-structure, general repetitive-structure partially)
- **False negatives (Sam flags proxy missed):** ~24
- **True negatives (both agree it's clean):** 1 (prd)

### The proxy's blind spots

1. **Negative parallelism variants** — the 3 regexes only catch "isn't X — it's Y" forms. Sam flagged 3 neg-para instances the proxy missed:
   - "You don't need to ship — you need to understand" (don't X — you need Y)
   - "I walked away more interested, not less" (X, not Y)
   - "Theater works for that audience. It fails everyone else." (X works for A. It fails B.)

2. **"Is the kind of X that" slop pattern** — Sam explicitly called this an AI tell. Not in the slop checker.

3. **Content quality** — missing concrete examples, bad CTAs, buried impact, vague claims. The proxy can't assess whether content is *good*, only whether it violates mechanical patterns.

4. **Show-don't-tell** — "landed differently", "reframed how I was thinking" — Sam wants specifics, not abstractions.

5. **Hyperbolic claims** — "most useful thing", "thing nobody mentions" — overpromises the writer can't pay off.

6. **Em dash consistency** — the em dash limit rule exists but fires inconsistently. Sam flags em dashes the proxy passes.

7. **Register misclassification** — email follow-up after an interview is professional, not casual. The system's register assignment affects which rules fire.

### What the proxy gets right

Almost nothing. Its only area of partial overlap is sentence length/rhythm, and even there it flags things Sam doesn't care about (pitch) while missing things he does (blog clarity).

### Verdict (Pre-expansion)

**The proxy is not measuring what matters.** It catches ~4% of Sam's corrections (1 of 28) and generates false positives on issues Sam doesn't flag. Optimizing against this metric would primarily improve performance on patterns Sam doesn't care about while ignoring the patterns he does.

---

## Tier 2a Expansion — 2026-03-15

### Changes implemented in `compliance-check.ts`

1. **3 new neg-para regex variants:**
   - "don't/doesn't X — Y" (catches "You don't need to ship — you need to understand")
   - "more X, not Y" (catches "walked away more interested, not less")
   - "X works. It fails Y" (catches "Theater works for that audience. It fails everyone else.")

2. **"is the kind of X that" slop pattern** — hardcoded structural tell

3. **Hyperbolic claim detection** — 3 patterns:
   - "the most [adj] thing/part/piece" (catches "The most useful thing I did")
   - "thing nobody [verb]" (catches "thing nobody mentions")
   - "the real X is" (catches "the real challenge is...")

4. **Em dash counting** — flags >2 em dashes per document (was completely missing)

5. **Prose colon counting** — flags >1 mid-sentence colon per document

6. **Missing period detection** — flags paragraphs that don't end with punctuation (skips headers, signatures, subject lines)

### Re-calibration results

| Sample | Sam's issues | Old proxy violations | New proxy violations | Old catches | New catches |
|---|---|---|---|---|---|
| general | 11 | 2 | 6 | ~0.5 | ~4.5 |
| email | 7 | 0 | 4 | 0 | 4 |
| outreach | 3 | 0 | 1 | 0 | 1 |
| prd | 0 | 0 | 0 | N/A | N/A |
| blog | 2 | 1 | 2 | 0.5 | 2 |
| resume | 1 | 0 | 0 | 0 | 0 |
| slack | 1 minor | 0 | 1 (FP) | 0 | 0 |
| pitch | 0 | 2 (FP) | 2 (FP) | 0 | 0 |

**Old proxy:** ~1 true positive / 28 corrections = **~4% catch rate**, ~3 false positives
**New proxy:** ~11.5 true positives / 28 corrections = **~41% catch rate**, ~3 false positives

### What the expanded proxy now catches

- Negative parallelism (all 3 variants Sam flagged)
- "Is the kind of X that" AI slop
- Hyperbolic claims ("most useful thing", "thing nobody mentions")
- Em dash overuse
- Missing terminal punctuation
- CTA quality (partially, via missing period on vague sign-offs)

### What it still misses (~17 of 28 corrections)

- **Grammar** (tense errors, dropped subjects) — not regex-feasible
- **Content quality** (show-don't-tell, missing concrete examples, buried impact) — needs LLM judge
- **Factual accuracy** (wrong job title, misrepresented processes) — unflaggable
- **Register misclassification** (email treated as casual when it's professional) — needs upstream fix
- **Word choice** ("That's it" → "That's all", "Hey everyone" → "Howdy all!") — personal voice, not patternable
- **Flow/transitions** (missing logical connectors) — needs LLM judge

### Remaining false positives

- pitch: 2× repetitive-structure (Sam didn't flag)
- slack: 1× missing-period (Slack register doesn't require periods)

### Implications

1. **The proxy went from 4% to 41% catch rate** — a 10× improvement on the mechanical checks alone.
2. **False positive rate held steady** (~3 in both old and new) — the new checks are well-targeted.
3. **The remaining 59% of Sam's corrections require either LLM-as-judge or are inherently unflaggable** (factual errors, personal voice preferences). The mechanical ceiling is roughly 50-60% — to get higher, Tier 2b (LLM judge) is needed.
4. **Architecture pass rates will drop significantly** with the expanded checker — this is expected and correct. The old pass rates were inflated by an undertesting proxy.
