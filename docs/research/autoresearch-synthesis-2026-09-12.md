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

### P0 — eval-fidelity fixes (landed 2026-09-12, commit 8b83e3e)

The repo audit found the loop was scoring against a ~4%-recall proxy on a
dataset dirtier than production's. All landed:

- ✅ **Restored the six Tier-2a checks** documented in calibration-study.md
  but lost from the tree (neg-para variants, kind-of-X, hyperbolic claims,
  em-dash density, prose-colon count, missing-terminal-punctuation with
  slack exemption)
- ✅ **`detection_pattern` scoring** — slop rules use their regex column;
  `example_before` falls back to word-boundary matching, not verbatim
  substring
- ✅ **Production correction filters** in all eval generators (NOT FEEDBACK
  junk, non-feedback, backfill, and positive-polarity rows no longer render
  as "avoid" examples)
- ✅ **Suspect-rule exclusion** — auto-synthesized + unreviewed
  candidates out of eval rule loads (the category is already absent from
  the live DB; the audit's poisoned rows were dropped since July)
- ✅ **Register parity** — eval REGISTER_MAP now matches production
  registerDefaults (was divergent on 5 types)
- ✅ **`per_type` in EvalResult** — unblocks skill-loop.ts and makes
  register regressions visible
- ✅ **Provider-scoped best** — results.tsv records provider; poolside runs
  no longer judged against claude-era bests (earlier commit eead928)
- ✅ **Feedback channel** — `last-eval.json` feeds violation labels +
  per-type scores into the next mutation prompt (earlier commit 7dac0e7)

Remaining P0:

1. ~~Repair the 43 inverted auto-synthesized rules~~ — **already gone from
   the DB** (verified 2026-09-12: zero rows with category
   `auto-synthesized` or source `auto-synthesis`/`gepa-variant`; the audit's
   flagged IDs absent). The eval-side exclusion stays as defense-in-depth.
2. **Human open-coding gate (Nurijanian finding).** Three autoresearch runs
   elsewhere optimized machine judges against "a fantasy" until a human
   open-coded ~100 outputs and hand-validated each judge on 15–20 items.
   Margin equivalent: hand-label ~30 eval outputs across types before
   treating `pass_rate` as real. This is SAM-958's job in new clothes.
3. **Cross-provider ratchet (mdflow finding).** Keep only mutations that
   improve the *minimum* score across 2+ `MARGIN_EVAL_CMD` backends —
   prevents hill-climbing into model-specific phrasing. Blocked on
   restoring a second healthy provider.
4. **Re-baseline everything.** All pre-8b83e3e results were scored on the
   pre-expansion checker with unfiltered data — `experiment-log.md`
   rankings (arch-c 88.9% etc.) are suspect until re-run.

### P1 — highest-leverage mechanisms to add

0. **Scenario B — corrections + top-10 rules.** The experiment log's own
   never-run next step: keep arch-d's correction data but swap the 40-rule
   dump for top-10 by signal_count. New `arch-e-top10` generator; ~20 LOC.
1. **Confirm arch-c under the repaired harness.** The 88.9% two-pass-editor
   result is a single claude-era run scored on the 4%-recall proxy —
   re-run before trusting it. Variant worth testing: pass-2 edits against
   corrections data (arch-d's 72.2% layer) instead of the full rule dump.
2. **Port `typeConstraint` length bounds into eval generators.** Production
   emits "Slack: 1-2 sentences. Emails: 3-5." — only arch-skill has it;
   a–f/h emit nothing, so eval slack/email get prose-length output against
   prose-tuned rules. Likely partial cause of the slack -4 regression.
3. **Wire `--arch skill` into eval.ts.** The real production path
   (`writing-voice` SKILL.md + `margin export coaching-prompt`) has never
   been scored — answers the only question that matters: does what users
   run pass the eval? Also unblocks skill-loop.ts + autoresearch.ts
   enforcement category.
4. **Rule precedence for contradictions.** The audit found direct
   contradictions (hedges-as-voice vs. hedge-and-point-as-tell; "never end
   messages with periods" vs. prose rules) — probably the direct cause of
   the slack regression. Cheap test first: precedence line in the coaching
   prompt ("casual register: voice-calibration rules override ai-slop
   hedging rules"); durable fix: register-scoped rules.
5. **Consolidate the two ideas files.** `loop.ts` reads `ideas.md` while
   `program.md` points at `autoresearch.ideas.md` — the loop re-proposes
   already-falsified hypotheses (runs 22–23 repeated the same dead idea).
6. **Run the built-but-never-run recognition/creation loops.**
   `score-recognition.ts` (45 cases) + `score-creation.ts` are complete;
   zero runs logged. They optimize SKILL.md step 4 — a surface the
   enforcement loop can't see.

7. **Pairwise keep/revert judging, both orderings.** Decide candidate vs
   incumbent on the same inputs via swapped A/B judgment instead of
   absolute-score threshold. Higher human-agreement than pointwise;
   kills position bias.
   *Test:* on a labeled preference set, compare decision accuracy of
   score-threshold vs swapped-pairwise.
8. **Per-type Pareto frontier.** Keep prompt candidates that win on *any*
   type, not just the aggregate. The slack -4 regression is exactly the
   failure this prevents.
   *Test:* track per-type scores; does the aggregate-best prompt regress
   a type a frontier member doesn't?
9. **Distribution-level eval (Deft's real contribution).** Pointwise
   compliance can't catch distributional slop — 1,000 passable outputs
   repeating identical openings. Add n-gram/opening/sentence-length
   distribution distance between coached output batches and Sam's
   human writing.
   *Test:* distribution distance before/after optimization; check whether
   pointwise gains hide distributional collapse.
10. **Correction-provenance rules (Every/Parrott).** Every's blacklist grew
   only from observed mistakes, each rule carrying its originating failure.
   Give each synthesized rule a before/after pair + the correction that
   produced it.
   *Test:* rules with failure provenance vs. pattern-only rules, same eval.
11. **Draft→sent delta as a second signal channel.** The delta between AI
   draft and what Sam actually sends is implicit correction data — higher
   precision than conversational capture. Also mine *deletion patterns*
   (what he always cuts) as a separate rule class.
   *Test:* do implicit-edit rules flag violations conversation-derived
   rules miss?
12. **Mid-draft vs. post-draft enforcement.** Every runs per-section checks
   mid-draft; post-draft editing produces "patched-over prose."
   *Test:* same rules, per-section vs. whole-draft application; measure
   slop accumulation and rework cost.

### P2 — cheap structural wins

13. **Atomic binary checks with quoted evidence.** Replace the 5-dim
    Likert rubric with TRUE/FALSE items; judge must quote the offending
    span. But cap at 3–6 checks per run — Lehmann's autoresearch on prose
    showed optimizers game checklists past ~6 items.
    *Test:* Cohen's κ vs. Sam's labels for atomic-checklist vs. rubric.
14. **VOICE/STYLE taxonomy (Compound Writing `cw-save`).** Route each
    synthesized rule: sentence-level (voice) vs. argument/structure
    (style). Rules that are both get split into atomic rules.
    *Test:* dedup/contradiction rate + compliance with flat vs. routed rules.
15. **Bootstrapped few-shot demos (MIPROv2 trick).** Inject the best-scoring
    before→after correction pairs into the coaching prompt as
    demonstrations. Accepted-with-zero-corrections outputs are positive
    exemplars.
    *Test:* 0-shot coaching vs. +3 bootstrapped demos.
16. **Adversarial rule promotion.** Model A proposes a rule from a
    correction; model B tries to produce a false-positive it would
    wrongly flag. Promote survivors only.
    *Test:* false-positive rate on Sam's human-written samples, promoted
    vs. unscreened rules.
17. **Rules-as-ratchet (Evo finding).** Once a correction-derived rule
    passes its acceptance test, all downstream generated text must satisfy
    it — inheritable constraint, not advisory.
    *Test:* regression count on previously-fixed violations across
    iterations.
18. **Bonsai-prune the rule file.** Periodic dedup/consolidation; weight by
    recency + evidence count; prune rules that never fire.
    *Test:* compliance with full vs. pruned file; watch long-tail rules.
19. **Ingest external tell-corpora as weighted signals.** Wikipedia's Signs
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
