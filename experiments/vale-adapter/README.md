# Vale Adapter Spike

This isolated experiment tests Vale as a derived mechanical evaluator for Margin rules. SQLite remains the source of truth. The adapter reads reviewed rules through immutable SQLite mode, generates temporary Vale styles, and deletes those styles after each run.

## Result

The August 12 run used Vale source revision `8fe98044d4bc90e5291372a183b4c7021490aa09`.

- All 16 live rules with detection patterns compiled and ran under Vale.
- The six synthetic Markdown cases produced three true positives, zero false positives, and zero false negatives under Vale.
- The raw-regex baseline produced the same three true positives plus two false positives from fenced and inline code.
- The database SHA-256 stayed unchanged at `e71e26e771432babbd96978d4d77d9b399143988df5bd83048019feb910248d3`.

The spike supports an optional Vale-backed evaluator. It does not support replacing Margin's rule memory, judgment-based evaluator, or current guard. The fixture set is too small to justify a shipped binary dependency.

## Real-document checkpoint

The private August 12 corpus run selected 30 distinct Markdown documents from Margin's live catalog. Six selected files had prior correction history. Correction history did not label the current alerts, so the run reports agreement and keeps precision and recall claims pending.

- Raw regex and the scope-adjusted Vale adapter each returned 25 document-rule alerts.
- Both engines agreed on all 25 alerts. Neither engine produced an alert the other missed.
- The first pass exposed a compiler bug for writing types without executable rules and a recall loss for a rule that targets Markdown syntax. Regression tests now cover both cases. Markup-targeting patterns use Vale's raw scope; prose patterns keep text scope.
- Two consecutive runs produced the same private review-packet SHA-256, `599c0ff67deb45824a3c975172c89354cf68c20157b0df8ff722fd675a950ed9`.
- Vale took 1.83 seconds for the repeated 30-document run. This isolated process timing is evidence for batch evaluation only.

The private manifest, excerpts, and judgment packet live under `~/.margin/experiments/vale-adapter/real-docs-2026-08-12/`. The repository stores only aggregate counts and hashes in `results/2026-08-12-real-corpus.json`.

## Commands

Run the isolated contract checks.

```bash
pnpm test:vale-adapter
pnpm typecheck:vale-adapter
```

Build Vale from a pinned checkout outside this repository, then run the live read-only comparison.

```bash
pnpm vale-adapter:spike -- \
  --db /Users/samzoloth/.margin/margin.db \
  --vale-bin /absolute/path/to/vale \
  --vale-revision 8fe98044d4bc90e5291372a183b4c7021490aa09
```

Run the real-document comparison. The command refuses output paths outside Margin's private experiment directory.

```bash
pnpm vale-adapter:real -- \
  --db /Users/samzoloth/.margin/margin.db \
  --vale-bin /absolute/path/to/vale \
  --vale-revision 8fe98044d4bc90e5291372a183b4c7021490aa09 \
  --out /Users/samzoloth/.margin/experiments/vale-adapter/real-docs-2026-08-12 \
  --limit 30
```

The command refuses immutable reads while a non-empty SQLite WAL exists. It reports aggregate counts and fixture scores without copying database text into the repository.

## Promotion Gate

Before Vale becomes a production dependency, adjudicate the 25 private alerts and add document-level negative labels for the 30-file corpus. Vale must preserve the current detector's recall, reduce false positives, return stable source spans, and stay within the interactive latency budget. The current result establishes deterministic agreement, not a precision gain.
