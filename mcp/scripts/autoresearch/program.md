# Autoresearch: Margin writing quality optimization

You are an autonomous research system whose job is to make AI write in Sam's voice with zero corrections needed. The current system uses a specific architecture (the rule-based loop described below), but **the architecture itself is a hypothesis, not a given.** Autoresearch should optimize within the current architecture AND test whether alternative architectures perform better.

## System-level goal

**Every correction Sam gives should never need to be given again.** The system is working when corrections-per-document trends toward zero over time.

Proxy metric (measurable now): **pass rate** — % of adversarial test samples with zero mechanical issues AND dimension score ≥ 35/50. This proxy is useful but imperfect. Eval calibration (comparing proxy scores to Sam's actual corrections) is a standing research priority.

## Competing architectures

The current rule-based loop is **Architecture A**. It may not be the best approach. The following architectures should be tested against the same eval:

### Architecture A: Rule-based loop (current)
Corrections → explicit rules → text instructions → Claude follows rules.
**Strengths:** Transparent, debuggable, incrementally improvable.
**Weaknesses:** Rules are lossy abstractions of voice. 240 rules may overwhelm the model. Generalization from specific corrections loses context.

### Architecture B: Few-shot exemplars
Skip rules entirely. Show Claude 10-20 paragraphs of Sam's best writing and say "write like this."
**Strengths:** Voice is demonstrated, not described. Models are good at pattern matching from examples.
**Weaknesses:** Hard to target specific violations. Needs a curated corpus. May capture surface style without editorial judgment.
**Test:** Generate the same 27 samples with exemplars instead of rules. Compare pass rates.

### Architecture C: Editor model (two-pass)
Let Claude write freely (no rules, no coaching). Then run a second pass: "Here are Sam's rules. Edit this draft to comply." The correction IS the product.
**Strengths:** Separates creativity from compliance. Editing is easier than constrained generation. The second pass can be more aggressive because it's not fighting the generation.
**Weaknesses:** Two LLM calls per generation. May produce unnatural prose if the edit pass is heavy-handed.
**Test:** Generate 27 samples unconstrained, then edit each with rules. Compare pass rates and naturalness.

### Architecture D: Diff-based preference learning
Don't extract rules from corrections. Feed Claude the raw correction diffs: "Sam changed THIS to THAT in documents like THESE." Let the model learn the pattern without an explicit rule intermediary.
**Strengths:** Preserves full context of corrections. No lossy generalization step. More corrections = better signal without rule bloat.
**Weaknesses:** Requires enough correction history to be useful. May not generalize beyond seen patterns.
**Test:** Build a corrections-as-context prompt. Generate 27 samples. Compare.

### Architecture E: Hybrid (rules + exemplars + corrections)
Combine the best elements: high-signal rules for mechanical issues (kill words, structure), exemplars for voice/tone, raw corrections for edge cases.
**Strengths:** Each mechanism covers what the others miss.
**Weaknesses:** Complexity. Harder to attribute improvements. More tokens per generation.
**Test:** Build a combined prompt. Generate 27 samples. Compare.

### Architecture E: Hybrid (corrections + high-signal rules) — LEADING
Combine corrections (Architecture D) for concrete mechanical signal with high-signal rules (signal_count ≥ 2 or severity = must-fix) for structural patterns that no correction has captured.
**Strengths:** Each mechanism covers what the other misses. Corrections prevent known violations; rules prevent structural patterns (negative parallelism, sentence length) that may not appear in correction history.
**Weaknesses:** Larger prompt (corrections + rules). Slightly slower than D alone.
**Results:** 76.9% pass rate, 8 mechanical issues — highest of any architecture tested. See `experiment-log.md` for full data.

### Architecture F: Aegis-structured governance schema
Same underlying data as Architecture E (corrections + high-signal rules), but represented as a machine-readable governance specification instead of prose instructions. Inspired by [aegis-spec](https://github.com/cleburn/aegis-spec).
**Hypothesis:** Claude complies better with deterministic, schema-structured rule definitions (typed JSON with severity tiers, pattern match definitions, violation records) than with prose/markdown descriptions — because structured specs reduce interpretation ambiguity.
**Key differences from E:**
- Rules organized into governance tiers: conservative (BLOCK), advisory (strong preference), delegated (use judgment)
- Corrections formatted as structured violation records with typed fields, not narrative
- Explicit `COMPLIANCE PROTOCOL` section that instructs the model to process tiers in priority order
- JSON-like constitution defining voice identity and absolute prohibitions with match variants
**Test:** Same eval (27 adversarial samples). Compare F vs E head-to-head. `npx tsx eval.ts --arch f`
**Status:** Generator built (`arch-f-aegis.ts`), wired into eval. Awaiting first run.

### How to compare architectures
All architectures run through the same eval (27 adversarial samples, compliance scoring). The eval doesn't care HOW the prose was produced — it measures the output. This lets us do apples-to-apples comparison across fundamentally different approaches.

## The current loop (Architecture A)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │  Rules    │───▶│ Artifacts│───▶│ Claude writes│  │
│  │ (SQLite)  │    │ (md/py)  │    │  (coached)   │  │
│  └──────────┘    └──────────┘    └──────┬───────┘  │
│       ▲                                  │          │
│       │                                  ▼          │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │ Synthesis│◀───│Corrections│◀───│ Sam reads in │  │
│  │          │    │           │    │   Margin     │  │
│  └──────────┘    └──────────┘    └──────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Each node in this loop is an optimization surface. Improving any one node tightens the whole loop.

## Optimization surfaces

### Surface 1: Coaching prompt
**Artifact:** `coaching-prompt.md`
**Program:** `program.md` (surface-specific)
**Question:** How should rules be presented to Claude when asking it to write?
**Levers:** Framing, emphasis, structure, negative examples, meta-instructions
**Status:** Built, ready to run

### Surface 2: Rule selection
**Artifact:** Selection/filtering logic (new)
**Program:** TBD
**Question:** Should Claude see all 240 rules for every task, or a scoped subset?
**Levers:** Filter by writing type, register, severity, signal_count. Prioritize high-signal rules. Cap total rules shown.
**Hypothesis:** Scoped loading (only rules relevant to the current writing type + register) dramatically improves signal-to-noise and compliance.
**Status:** Not built

### Surface 3: Rule formatting
**Artifact:** Export template / formatting logic
**Program:** TBD
**Question:** What format should rules take when presented to Claude?
**Levers:** Flat markdown vs XML vs structured YAML. Grouping (by category, by severity, by signal_count). Kill-word rules as explicit lists vs prose descriptions. Example pairs (before/after).
**Hypothesis:** Structure and grouping matter more than raw rule count.
**Status:** Not built

### Surface 4: Rule quality
**Artifact:** Individual rules in SQLite
**Program:** TBD
**Question:** Are the existing 240 rules high-quality, non-contradictory, and well-specified?
**Levers:** Conflict detection, overlap deduplication, vagueness scoring, signal_count analysis (low-signal rules may be noise).
**Constraints:** Sam is the final arbiter. Automated analysis flags candidates; humans decide.
**Status:** Not built

### Surface 5: Hook enforcement
**Artifact:** `~/.claude/hooks/writing_guard.py`
**Program:** TBD
**Question:** Is blocking the write the right response to a violation? What about warn-and-annotate, or rewrite?
**Levers:** Block vs warn vs rewrite. Pattern matching (substring vs regex vs LLM-checked). Scope (which file types, which tools).
**Constraints:** Behavioral — requires using the system to feel the difference. Hard to eval with automated tests alone.
**Status:** Not built

### Surface 6: Synthesis pipeline
**Artifact:** Synthesis logic in `corrections.ts` and `corrections.rs`
**Program:** TBD
**Question:** How should corrections become rules? Direct copy, LLM generalization, clustering, batched review?
**Levers:** Immediate vs batched. Literal vs generalized. Single correction → rule vs cluster → rule.
**Hypothesis:** LLM-assisted generalization from specific corrections to general patterns produces more durable rules.
**Status:** Not built

### Surface 7: Eval fidelity
**Artifact:** `eval.ts`, adversarial prompts, compliance scoring
**Program:** TBD
**Question:** Does the eval measure what matters? Does improving the proxy score actually reduce Sam's corrections?
**Levers:** Expand prompt set (beyond 9 types × 3). Add real-world writing tasks. Calibrate against Sam's actual corrections. Weight types by frequency of real use.
**Status:** Not built — this is foundational and should be validated early

## Priority order

**Tier 0 — Establish baselines across architectures — COMPLETE**
Results: A=51.9%, B=55.6%, C=63.0%, D=66.7%, E=76.9%. See `experiment-log.md`.
Decision: Architecture E (hybrid) is the leading candidate. A (rules-only) eliminated. C (editor) eliminated on cost. B shelved.

**Tier 0.5 — Confirm E's lead — COMPLETE**
E across 3 runs: 0.769, 0.593, 0.808. Mean: 72.3%. Exceeds the 65% threshold. 81 total samples. Decision: Architecture E confirmed as base for optimization. See `experiment-log.md` Run 5-6.

**Tier 1 — Optimize Architecture E (CURRENT)**
E is confirmed but untuned. Four optimization surfaces, to be attacked one at a time:

Surfaces (attack sequentially, one hypothesis per experiment):
1. **Negative parallelism intervention** — the one failure that persists across ALL architectures. Highest-leverage single fix. Add explicit prohibition + before/after example to E's prompt.
2. **Correction selection** — which corrections, how many, ordered how. Currently: 30 most recent. Test: filter by writing type, order by recency, by signal strength.
3. **Rule selection threshold** — currently signal_count ≥ 2 OR severity = must-fix, limit 30. Test: tighter thresholds, category filtering.
4. **Prompt structure** — framing, section ordering, emphasis. The prompt in arch-e-hybrid.ts is a first draft.

**Tier 2 — Audit the foundation**
8. Eval confidence — bump to n=45 (5 samples/type) or run 3× at n=27
9. Eval calibration — does the proxy score correlate with Sam's real corrections?
10. Rule/signal quality — clean the inputs regardless of architecture

**Tier 3 — Wire into production**
11. Replace the current coaching-prompt.md approach with E's hybrid prompt in the actual writing pipeline
12. Hook enforcement — update writing_guard.py to reflect the new architecture
13. Synthesis pipeline — ensure new corrections feed back into E's correction pool

## Experimentation protocol

- Each surface has its own `program.md` with surface-specific strategy and constraints
- The eval harness (`eval.ts`) is shared across all surfaces
- One surface at a time. Run to plateau, then move to the next surface.
- After optimizing a surface, re-run earlier surfaces — improvements compound and interact
- All experiments run in git worktrees. Main never sees a failed experiment.
- Results accumulate in `results.tsv` with a `surface` column

## Interaction effects

Surfaces are not independent. Changing one affects others:
- Better **rule selection** makes **coaching prompt** optimization more effective (less noise to coach around)
- Better **rule formatting** may obsolete some **coaching prompt** strategies (if rules are self-explanatory, less coaching needed)
- **Rule quality** improvements propagate through every downstream surface
- **Eval fidelity** changes may invalidate previous experiment results — re-baseline after eval changes

## Standing research questions

- ~~Is the rule-based loop the right architecture at all?~~ **ANSWERED: No.** Rules alone (A) is the worst performer. Corrections + high-signal rules (E) is the best. The system should pivot from rules-first to corrections-first with rules as structural backstop.
- ~~Is voice capturable by a single mechanism?~~ **PARTIALLY ANSWERED: No.** Corrections handle mechanical compliance; rules handle structural patterns. Neither alone matches the hybrid.
- ~~Does E's 76.9% hold up across runs?~~ **ANSWERED: Yes.** 3-run average: 72.3% (range 59.3-80.8%). Exceeds 65% threshold. Architecture confirmed.
- **What's E's ceiling?** Correction selection, rule threshold, and prompt structure are all untuned.
- **Why does negative parallelism persist across all architectures?** It's the one pattern that beats everything. May need a dedicated intervention (explicit prohibition in the prompt, or a post-generation check).
- **Is 27 samples enough?** Variance between runs suggests no. Bumping to 45 or running 3× would tighten confidence.
- **Does the proxy score correlate with Sam's real corrections?** Untested. Critical before heavy optimization.
- Can we build a tighter feedback loop (Sam corrects → system adapts → same session, not next session)?
