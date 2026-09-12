# Autoresearch optimization synthesis — 2026-09-12

Fan-out of four research agents across the vault, GitHub stars (503 live, 282
since the March dump), X bookmarks, and the external literature (Deft, Every's
Compound Writing, DSPy/GEPA lineage). Ranked by expected impact on the loop,
not novelty.

## What the loop already has

- Hill-climb over `coaching-prompt.md`, keep/revert via git, `results.tsv` ledger
- Provider-pluggable generation (`MARGIN_EVAL_CMD`), provider-scoped best
- Per-run feedback channel: `last-eval.json` carries violation labels +
  per-type pass/dim back into the mutation prompt (added this session)
- 10 architecture variants (A–H + null) with prior comparison runs

## Ranked experiment backlog

### P0 — fixes to run before trusting any optimization result

1. **Repair the 43 inverted auto-synthesized rules.** `rules-quality-audit`
   found rules with `rule_text`/`example_before` swapped — corrected prose
   stored where the bad pattern belongs. They're poisoned ground truth for
   both coaching and judge calibration. Repair or exclude first.
2. **Human open-coding gate (Nurijanian finding).** Three autoresearch runs
   elsewhere optimized machine judges against "a fantasy" until a human
   open-coded ~100 outputs and hand-validated each judge on 15–20 items.
   Margin equivalent: hand-label ~30 eval outputs across types before
   treating `pass_rate` as real. This is SAM-958's job in new clothes.
3. **Cross-provider ratchet (mdflow finding).** Keep only mutations that
   improve the *minimum* score across 2+ `MARGIN_EVAL_CMD` backends —
   prevents hill-climbing into model-specific phrasing. Blocked on
   restoring a second healthy provider.

### P1 — highest-leverage mechanisms to add

4. **Pairwise keep/revert judging, both orderings.** Decide candidate vs
   incumbent on the same inputs via swapped A/B judgment instead of
   absolute-score threshold. Higher human-agreement than pointwise;
   kills position bias.
   *Test:* on a labeled preference set, compare decision accuracy of
   score-threshold vs swapped-pairwise.
5. **Per-type Pareto frontier.** Keep prompt candidates that win on *any*
   type, not just the aggregate. The slack -4 regression is exactly the
   failure this prevents.
   *Test:* track per-type scores; does the aggregate-best prompt regress
   a type a frontier member doesn't?
6. **Distribution-level eval (Deft's real contribution).** Pointwise
   compliance can't catch distributional slop — 1,000 passable outputs
   repeating identical openings. Add n-gram/opening/sentence-length
   distribution distance between coached output batches and Sam's
   human writing.
   *Test:* distribution distance before/after optimization; check whether
   pointwise gains hide distributional collapse.
7. **Correction-provenance rules (Every/Parrott).** Every's blacklist grew
   only from observed mistakes, each rule carrying its originating failure.
   Give each synthesized rule a before/after pair + the correction that
   produced it.
   *Test:* rules with failure provenance vs. pattern-only rules, same eval.
8. **Draft→sent delta as a second signal channel.** The delta between AI
   draft and what Sam actually sends is implicit correction data — higher
   precision than conversational capture. Also mine *deletion patterns*
   (what he always cuts) as a separate rule class.
   *Test:* do implicit-edit rules flag violations conversation-derived
   rules miss?
9. **Mid-draft vs. post-draft enforcement.** Every runs per-section checks
   mid-draft; post-draft editing produces "patched-over prose."
   *Test:* same rules, per-section vs. whole-draft application; measure
   slop accumulation and rework cost.

### P2 — cheap structural wins

10. **Atomic binary checks with quoted evidence.** Replace the 5-dim
    Likert rubric with TRUE/FALSE items; judge must quote the offending
    span. But cap at 3–6 checks per run — Lehmann's autoresearch on prose
    showed optimizers game checklists past ~6 items.
    *Test:* Cohen's κ vs. Sam's labels for atomic-checklist vs. rubric.
11. **VOICE/STYLE taxonomy (Compound Writing `cw-save`).** Route each
    synthesized rule: sentence-level (voice) vs. argument/structure
    (style). Rules that are both get split into atomic rules.
    *Test:* dedup/contradiction rate + compliance with flat vs. routed rules.
12. **Bootstrapped few-shot demos (MIPROv2 trick).** Inject the best-scoring
    before→after correction pairs into the coaching prompt as
    demonstrations. Accepted-with-zero-corrections outputs are positive
    exemplars.
    *Test:* 0-shot coaching vs. +3 bootstrapped demos.
13. **Adversarial rule promotion.** Model A proposes a rule from a
    correction; model B tries to produce a false-positive it would
    wrongly flag. Promote survivors only.
    *Test:* false-positive rate on Sam's human-written samples, promoted
    vs. unscreened rules.
14. **Rules-as-ratchet (Evo finding).** Once a correction-derived rule
    passes its acceptance test, all downstream generated text must satisfy
    it — inheritable constraint, not advisory.
    *Test:* regression count on previously-fixed violations across
    iterations.
15. **Bonsai-prune the rule file.** Periodic dedup/consolidation; weight by
    recency + evidence count; prune rules that never fire.
    *Test:* compliance with full vs. pruned file; watch long-tail rules.
16. **Ingest external tell-corpora as weighted signals.** Wikipedia's Signs
    of AI writing + `ai_tells_lexicon.csv` + humanizer's 29 patterns —
    but as frequency-weighted signals, not a ban list (documented
    false-positive rates on human prose, esp. non-native writers).
    *Test:* false-positive rate on Sam's samples, lexicon-as-ban vs.
    lexicon-as-signal.

### P3 — worth knowing, not worth building yet

- **TextGrad** — conceptually = GEPA's reflection step; small edge over
  what the loop already does.
- **Promptbreeder/EvoPrompt populations** — real but doubles eval cost;
  revisit if single-lineage stalls.
- **DFT/Deft fine-tuning** — wrong data shape: Margin's corrections are
  DPO/SFT pairs (rejected/chosen, before→after), not distribution-matching
  batches. Steal the metrics (P1 #6), not the method.
- **Plankton config-tamper-proofing** — matters only when the generating
  agent can edit Margin's rules; currently out of scope.

## Skeptic's appendix

- Deft's headline numbers are self-reported, self-judged, unreplicated.
- "AI tell" lists are probabilistic — hard bans misfire on human prose.
- Never let the generating model family judge its own output (10–25%
  self-preference inflation).
- Margin's public page already claims GEPA results — treat those as
  pre-repair-harness numbers until reproduced on the fixed evaluator.
