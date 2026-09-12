# Ideas backlog

Deferred hypotheses for future iterations. Ranked by estimated impact.
(Consolidated 2026-09-12 — this is now the single backlog; program.md's
autoresearch.ideas.md is merged in.)

## High priority — data layer (highest expected lift per research synthesis)

- **Scenario B: corrections + top-10 rules** — experiment-log's own never-run
  next step. arch-e variant with `LIMIT 10` on the rules block.
- **arch-c confirmation under repaired harness** — the 88.9% was scored on
  the ~4%-recall proxy; re-run before trusting. Variant: pass-2 edits
  against corrections (arch-d's data layer) instead of the rule dump.
- **Rule precedence line for register contradictions** — audit found direct
  conflicts (hedges-as-voice vs hedge-as-tell; no-periods-slack vs prose
  rules). Prompt-level precedence statement may fix the slack regression.
- **Self-critique pass (humanizer pattern)** — arch-c variant where pass 2
  critiques "what makes this obviously AI?" then revises, vs. editing
  against the rule list.
- **Register-specific prohibition tuning** — prohibition blocks are
  register-agnostic; email and slack have different norms for colons,
  em dashes, fragments. Add register exceptions.
- **Correction ordering by signal strength** — order corrections by
  recurrence of similar corrections, not recency.

## Medium priority

- **Post-generation compliance check** — lightweight mechanical check on
  output; regenerate once with violation flagged. Adds latency.
- **Register-specific rule scoping** — filter to `register = ? OR register
  IS NULL` to keep casual rules out of professional contexts.
- **Bump eval to n=45** — 5 samples/type tightens confidence intervals
  (27-sample runs show 59-81% variance range).
- **Prompt section ordering** — corrections-first vs rules-first vs
  prohibitions-first.
- **Correction context window** — test 15 and 50 vs current 30.
- **Correction clustering** — group by similarity, load 2-3 per cluster.

## Low / speculative

- **Eval calibration study** — compare proxy pass rate against Sam's actual
  correction rate on the same documents. Requires Sam's time; highest
  long-term value.
- **Progressive disclosure** — load fewer rules upfront, introduce advanced
  rules only after baseline constraints are met.
- **Voice scorecard** — each rule gets a ✓/✗ marker the model simulates
  before writing.
- **Consequence framing** — "violating these rules will require Sam to edit
  your output" instead of positive instruction.
- **Top-15-only** — strip all generic rules, keep only the most-frequently-
  corrected patterns.
- **Dynamic rule loading (Hallie method)** — more aggressive type filtering
  inside loadWritingRulesForType.

## Tried and discarded

- **Elevate long-sentence constraint to top of prompt** — proposed twice
  (runs 22-23, poolside), reverted both times: pass rate crashed to
  0.37-0.41 with ~30 mechanical issues. Per program.md, this is a known
  dead end at the prompt level — fix has to happen in data selection or
  the checker.
- **Chronological correction ordering (d-chrono)** — tested as arch-d-chrono,
  59.3% vs arch-d's 72.2% recency ordering.
- **Top-10 rules in arch-a** — tested as arch-a-top10 (70.4% vs full-dump
  57.5%). Top-10 alone beat volume; "corrections + top-10" remains untested
  (see Scenario B above).

- Register-specific prohibition tuning — email and slack have different norms; a blanket "no colons" or "no negative parallelism" rule may need register exceptions to avoid regressing casual types that currently pass (slack 3/3, email 1/3).
- Post-generation compliance check — a lightweight mechanical check that flags violations and triggers one regenerate could catch what the prompt misses.
- Self-critique pass (humanizer pattern) — arch-c variant where pass 2 critiques "what makes this obviously AI?" then revises against the rule list.

- Scenario B (corrections + top-10 rules) - highest priority untested hypothesis
- Register-specific prohibition tuning - critical to avoid regressing slack (currently 2/3 passing)
- Post-generation compliance check - to catch violations the prompt misses
- Self-critique pass (humanizer pattern) - arch-c variant for "what makes this obviously AI?"

### Scenario B (corrections + top-10 rules) 
The experiment-log notes this as the "own never-run next step" — arch-e variant with `LIMIT 10` on the rules block. This should still be tested if the prompt-level fix works.

### Register-specific rule scoping  
Filter to `register = ? OR register IS NULL` to keep casual rules out of professional contexts. The per-type results show slack passing (3/3) but professional types (prd, blog, resume, general) failing catastrophically — could be register leakage.

### Prompt section ordering 
The current prompt puts prohibitions at the end. A/B test corrections-first vs rules-first vs prohibitions-first to find what Claude actually reads.

- The poolside-style "Sentence Craft" section didn't work — models can't follow technique descriptions reliably. Better to state the constraint plainly.
- The hyperbolic-claim pattern "the real X is" appeared in run 28's violations and wasn't prohibited. Now explicitly blocked.
- Consider post-generation compliance check if prompt-level fixes plateau.
- The eval baseline shifted (run 26) — need to confirm we're comparing against Architecture E's harness, not a new null baseline.

- Post-generation compliance check to catch violations the prompt misses
- Register-specific prohibition tuning to avoid regressing slack/email
- Self-critique pass as arch-c variant

- The "isn't X — it's Y" prohibition is only partially working (3 violations of the "It's Y" variant remain) — likely because Claude generates the pattern without recognizing it. Consider adding a generative alternative: "state what it IS, directly" as the only accepted approach.
- Repetitive structure violations (×4) suggest the register guidance isn't providing enough structural variety — the "In practice" and "For example" connectives are being used predictably.
- Long sentences persist because the 25-word limit is a constraint, not a construction method — Claude needs a pre-generation heuristic, not just a post-hoc rule.

- Post-generation compliance check to catch violations the prompt misses
- Register-specific prohibition tuning to avoid regressing slack/email (currently passing)
- Scenario B (corrections + top-10 rules) — arch-e variant with LIMIT 10 on rules block
