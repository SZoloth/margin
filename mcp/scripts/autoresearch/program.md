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

**Tier 1 — Optimize Architecture E — PARTIALLY COMPLETE (via DSPy/GEPA)**
Surfaces 1-3 tested via DSPy MIPROv2 (all 9 types). MIPROv2 kept defaults — the WriteInVoice signature is already well-structured. Surface 4 (rule quality) addressed by GEPA: 14 repeat corrections detected, 13 diagnosed, 13 fixes applied (7 vague→actionable rewrites, 6 near-miss variants). Architecture H ≈ Architecture E functionally (~68-70%, within noise at n=27).
Key insight: **the data layer (corrections + rules) matters more than the presentation layer (prompt structure)**.

**Tier 1.5 — DSPy + GEPA infrastructure — COMPLETE (2026-03-16)**
- `mcp/scripts/dspy/` — Python DSPy pipeline wrapping `claude -p` (no API key, subscription-based)
- `ClaudeCLI(dspy.BaseLM)` — custom LM provider for DSPy via Claude Code CLI
- `margin_gepa/` — repeat correction detection, LLM diagnosis, fix proposals
- `arch-h-dspy.ts` — Architecture H generator (E's data pipeline + DSPy-optimized instruction)
- `repeat_corrections` + `optimization_runs` SQLite tables (Rust migration)
- Weekly launchd agent (`com.margin.gepa-pipeline`) runs GEPA every Sunday 3am (review mode)
- Compliance check: prd/pitch exempt from repetitive-structure (2026-03-16)

**Tier 2 — Audit the foundation**
8. Eval confidence — bump to n=45 (5 samples/type) or run 3× at n=27
9. Eval calibration — does the proxy score correlate with Sam's real corrections?
10. ~~Rule/signal quality~~ — DONE via GEPA (Tier 1.5)

**Tier 3 — Wire into production — COMPLETE**
11. ~~Replace the current coaching-prompt.md approach with E's hybrid prompt in the actual writing pipeline~~ **DONE.** `margin export coaching-prompt --type <type>` implements Architecture G (production variant of E). Skills updated. See `feat/coaching-prompt` branch.
12. Hook enforcement — update writing_guard.py to reflect the new architecture (deferred — hook still works with existing patterns)
13. Synthesis pipeline — corrections already auto-synthesize into rules. No changes needed.

## Experimentation protocol

- Each surface has its own `program.md` with surface-specific strategy and constraints
- The eval harness (`eval.ts`) is shared across all surfaces
- One surface at a time. Run to plateau, then move to the next surface.
- After optimizing a surface, re-run earlier surfaces — improvements compound and interact
- All experiments run in git worktrees. Main never sees a failed experiment.
- Results accumulate in `results.tsv` with a `surface` column

### The experiment loop

**LOOP FOREVER. Never ask "should I continue?" — the user expects autonomous work.**

1. **Read state** — check `experiment-log.md`, `results.tsv`, and `git log --oneline` for context.
2. **Hypothesize** — before touching any code, write down what you expect to happen and why. Be specific: "I expect pass rate to increase by ~5pp because removing the redundant prohibition will reduce prompt confusion."
3. **Modify** — a single, focused change to the generator or coaching prompt under test. Classify this experiment as one of: `architecture` (structural changes to generators/pipeline), `parameter` (tuning thresholds, counts, weights), `simplification` (removing code/prompt content), `algorithmic` (different approach to the same problem), `infrastructure` (build/tooling/eval changes), `other`.
4. **Run eval** — `npx tsx eval.ts --arch <letter> > last_run.log 2>&1` — produces 27 samples scored by the compliance checker. Full output saved to `last_run.log` for analysis.
5. **Record** — append result to `results.tsv` and update `experiment-log.md`.
6. **Decide:**
   - **Improved** (higher pass rate or equal rate with fewer tokens) → **keep**. Commit.
   - **Equal or worse** → **discard**. Revert the change.
   - **Crashed** → log as crash. If trivial (typo, missing import), fix and retry. Otherwise revert and move on.
7. **Root-cause analysis** — this is NOT optional. For every result, trace the *causal mechanism*:
   - **Bad:** "Pass rate dropped. Reverting." (no learning captured)
   - **Good:** "Pass rate dropped 8pp. The new prohibition block triggered false negatives on 3 email samples — the model interpreted 'avoid colons' as 'avoid all punctuation after greetings', which caused it to drop periods too. Root cause: prohibition wording is ambiguous for email register. Learning: prohibition blocks need register-specific exceptions."
   - Write the root cause and learning in `experiment-log.md`.
8. **Update ideas backlog** — re-prioritize `autoresearch.ideas.md` based on new insights. Add new ideas sparked by the analysis. Deprioritize approaches that the root-cause analysis suggests won't work.
9. **Repeat** — go to step 2. Never stop.

### Simplicity criterion

All else being equal, simpler is better:
- Removing prompt content for equal or better pass rate → **keep** (simplification win)
- Tiny improvement that adds ugly complexity to the generator → probably **discard**
- Same pass rate but shorter coaching prompt → **keep** (fewer tokens = less noise)

### When stuck

Don't thrash on the same approach. If you've reverted the same idea twice, try something structurally different. Re-read the compliance checker output. Study which *specific samples* fail and why. The best improvements come from deep understanding of failure modes, not random prompt tweaks.

### Strategic checkpoints

Every **5 experiments**, pause the loop to analyze your optimization trajectory. Compute these metrics across your last 5 runs:

| Metric | How to compute |
|--------|---------------|
| **Hit rate** | % of experiments that were kept (improved the metric) |
| **Velocity** | Average pass rate delta per experiment |
| **Diversity** | How many distinct approaches were tried (vs variations of one idea) |
| **Crash rate** | % of experiments that crashed or produced invalid output |

Based on these, select a strategy for the next batch:

| Strategy | When | What to do |
|----------|------|------------|
| **Exploit** | High hit rate, metric improving | Keep refining the current approach |
| **Explore** | Low hit rate, metric flat | Try something structurally different |
| **Ablate** | Consecutive wins but slowing | Remove components to find what's actually needed |
| **Combine** | Multiple individual wins in history | Merge previously successful changes |
| **Stabilize** | High crash rate | Simplify, fix foundations before continuing |
| **Specialize** | One experiment type has high hit rate | Focus on productive types (e.g., if `parameter` wins 60% but `architecture` wins 10%, do more parameter tuning) |
| **Branch** | Two competing hypotheses, unclear winner | Test each on a sub-branch (see branch protocol below) |

Write the checkpoint analysis in `experiment-log.md` as a "Strategic review" section. Include a "Current theory" — a running model of what affects pass rate and what doesn't. This compounds intelligence across experiments instead of treating each one independently.

#### Meta-optimization review

After every **3rd strategic checkpoint** (i.e., every 15 experiments), run this additional review:

1. **Audit instruction effectiveness** — which rules from this program.md correlated with successful experiments? Which did you never reference or that led you astray?
2. **Identify dead weight** — any instruction you haven't applied in the last 15 experiments is a candidate for removal.
3. **Per-type success rates** — compute hit rate per experiment type (architecture/parameter/simplification/algorithmic/infrastructure). Use this to inform Specialize strategy decisions.
4. **Propose improvements** — write a `## Meta-optimization review` section in `experiment-log.md`:
   - Rules that helped (with evidence from experiment results)
   - Rules that are dead weight (with reasoning)
   - Proposed additions based on patterns discovered during experiments
5. **Do NOT modify program.md** — it is read-only. Record proposals in `experiment-log.md` for the human to review.

#### Branch strategy protocol

When a checkpoint selects **Branch**:

1. Note the current commit hash as your branch point.
2. Pick 2-3 competing approaches from your ideas backlog.
3. For each approach, create a sub-branch:
   ```bash
   git checkout -b autoresearch/branch-<approach> <branch-point-hash>
   ```
4. Run 3-5 experiments on each sub-branch following the normal loop.
5. Compare the best metric from each sub-branch.
6. Merge the winner back to the main session branch:
   ```bash
   git checkout <original-branch>
   git merge autoresearch/branch-<winner>
   ```
7. Delete losing sub-branches: `git branch -D autoresearch/branch-<loser>`
8. Log the comparison and decision in `experiment-log.md`.
9. Resume the normal experiment loop from the merged state.

### Session resume protocol

If you are starting a new session (context was reset, or you're a new agent instance):

1. Read `experiment-log.md` — understand what's been tried and what worked.
2. Read `results.tsv` — see the quantitative trajectory.
3. Read `autoresearch.ideas.md` — see the current backlog.
4. Read `git log --oneline` — see recent commits.
5. Run a **strategic review** (see checkpoints above) before your first experiment.
6. Write a "Session resume analysis" section in `experiment-log.md` with your findings and chosen strategy.

Then start the loop.

### Session files

| File | Purpose |
|------|---------|
| `program.md` | These instructions (read-only) |
| `experiment-log.md` | Detailed experiment log with root-cause analysis |
| `results.tsv` | Tab-separated results: `arch\|pass_rate\|mechanical_issues\|status\|type\|description` |
| `last_run.log` | Full eval output from the last run — redirect with `npx tsx eval.ts --arch e > last_run.log 2>&1` |
| `autoresearch.ideas.md` | Ideas backlog — save promising deferred ideas, re-prioritize after each experiment |
| `eval.ts` | Eval harness (read-only unless optimizing the eval itself) |
| `generators/arch-*.ts` | Architecture generators (modify when optimizing a specific architecture) |

## Interaction effects

Surfaces are not independent. Changing one affects others:
- Better **rule selection** makes **coaching prompt** optimization more effective (less noise to coach around)
- Better **rule formatting** may obsolete some **coaching prompt** strategies (if rules are self-explanatory, less coaching needed)
- **Rule quality** improvements propagate through every downstream surface
- **Eval fidelity** changes may invalidate previous experiment results — re-baseline after eval changes

## Falsification Protocol

This section encodes the "disprove the thesis" requirement. The hypothesis behind Margin is that the correction→rule→enforcement pipeline produces measurably better output than simpler approaches. We must test this empirically.

### The falsification test

After establishing architecture baselines, run a head-to-head comparison:

| Competitor | Architecture | Rationale |
|------------|--------------|-----------|
| **Null hypothesis** | `arch-null` | Zero-shot Claude with no coaching. If this scores within 5pp of arch-e, the entire pipeline adds no measurable value. |
| **Klaassen minimal** | `arch-a` with top-10 rules | "10 rules beat 100" — maybe a curated short list outperforms a full dump. |
| **Corrections only** | `arch-d` | Raw diffs without rules. If this matches arch-e, the rule synthesis step is unnecessary overhead. |
| **Full pipeline** | `arch-e` | The current leader (72.3% mean). Baseline to beat. |

### Threshold

If any simpler architecture scores within **5 percentage points** of arch-e's mean pass rate:
- Log "**thesis challenged**" in `experiment-log.md`
- Document which simpler approach and the pass rate delta
- Flag for Sam's judgment — do not make an architectural decision autonomously
- Note: a single eval round is not conclusive (27-sample variance is real). Flag requires 2+ consistent runs.

If all simpler approaches are >5pp below arch-e:
- Log "**thesis confirmed**" with the specific deltas
- Continue optimizing arch-e

### When to run

Run the falsification comparison:
1. After the initial architecture baselines are established (before loop.ts optimization)
2. After every major pipeline change that might shift the relative advantage

### Commands

```bash
# Run all falsification architectures
npx tsx eval.ts --arch null > /tmp/result-null.json
npx tsx eval.ts --arch a   > /tmp/result-a.json
npx tsx eval.ts --arch d   > /tmp/result-d.json
npx tsx eval.ts --arch e   > /tmp/result-e.json
```

Log results in `experiment-log.md` under a `## Falsification checkpoint` section with explicit "thesis confirmed/challenged" conclusion.

## Lessons from previous sessions

If `~/.autoresearch/skills.md` exists, read it before starting. It contains patterns extracted from past autoresearch sessions (via `autoresearch learn`). Use them as starting context — they may or may not apply to this specific optimization target.

After completing a session or reaching a significant milestone, run `autoresearch learn` from the Margin autoresearch directory to extract and persist what worked.

## Standing research questions

- ~~Is the rule-based loop the right architecture at all?~~ **ANSWERED: No.** Rules alone (A) is the worst performer. Corrections + high-signal rules (E) is the best. The system should pivot from rules-first to corrections-first with rules as structural backstop.
- ~~Is voice capturable by a single mechanism?~~ **PARTIALLY ANSWERED: No.** Corrections handle mechanical compliance; rules handle structural patterns. Neither alone matches the hybrid.
- ~~Does E's 76.9% hold up across runs?~~ **ANSWERED: Yes.** 3-run average: 72.3% (range 59.3-80.8%). Exceeds 65% threshold. Architecture confirmed.
- **What's E's ceiling?** Correction selection, rule threshold, and prompt structure are all untuned.
- **Why does negative parallelism persist across all architectures?** It's the one pattern that beats everything. May need a dedicated intervention (explicit prohibition in the prompt, or a post-generation check).
- **Is 27 samples enough?** Variance between runs suggests no. Bumping to 45 or running 3× would tighten confidence.
- **Does the proxy score correlate with Sam's real corrections?** Untested. Critical before heavy optimization.
- Can we build a tighter feedback loop (Sam corrects → system adapts → same session, not next session)?
