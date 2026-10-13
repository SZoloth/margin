# Rewrite eval: Margin rules vs. a generic humanizer

Design, metrics and decision rules: `docs/humanizer-baseline-eval.md`. This folder is
the runner. Private writing stays OUTSIDE the repo (default
`~/.margin/eval-corpus/humanizer-pilot/`).

All commands run from `mcp/`.

```bash
# 1. Freeze the corpus (read-only on ~/.margin/margin.db). Prints skipped documents and why.
pnpm exec tsx scripts/regression/rewrite-eval/build-draft-corpus.ts

# 2. Start llama-server for the humanizer (see the design doc), then generate.
#    a2 samples at temperature 1.0, so run it three times.
export MARGIN_EVAL_CMD="claude --print --model sonnet"     # editor model for a1, a3, a4, judges
for r in 1 2 3; do pnpm exec tsx scripts/regression/rewrite-eval/run-rewrite-eval.ts --run $r --arms a0,a1,a2,a3,a4; done

# 3. Blind A/B for Sam (no arm names in the sheet; key is a separate file)
pnpm exec tsx scripts/regression/rewrite-eval/blind-sheet.ts --a a3 --b a2
#    edit blind-a3-vs-a2.md: replace each `Pick: ?` with A, B or tie

# 4. Score. --judge adds V1 and F2 (LLM calls through MARGIN_EVAL_CMD).
pnpm exec tsx scripts/regression/rewrite-eval/score-rewrite-eval.ts --judge \
  --blind-picks ~/.margin/eval-corpus/humanizer-pilot/blind-a3-vs-a2.md
```

Optional metric V2: put Sam's final text for a draft at `<corpus>/finals/<document id>.txt`
before step 4 (and before step 1 so the manifest records it).

## Behaviors worth knowing

- Resumable: `run-rewrite-eval.ts` skips drafts already generated and records failures
  as errors instead of output; scoring excludes failed generations and lists them.
- Leakage: A3 and A4 see only rules last updated before the earliest held-out
  correction (ADR-003 in DECISIONS.md).
- Fewer than 30 held-out drafts: the verdict is labelled PILOT and is direction only.
- F1 limits: number words ("three") are not extracted, units are ignored, names at the
  start of a sentence are skipped, and a mid-sentence capitalized heading counts as a name.
- A1's prompt matches the humanizer's intent but not its verbatim text.
- The writing type for a draft is the most common `corrections.writing_type` among its rows.
