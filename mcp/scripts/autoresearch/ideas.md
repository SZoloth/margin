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
