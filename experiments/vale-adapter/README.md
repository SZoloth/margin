# Vale Adapter Spike

This isolated experiment tests Vale as a derived mechanical evaluator for Margin rules. SQLite remains the source of truth. The adapter reads reviewed rules through immutable SQLite mode, generates temporary Vale styles, and deletes those styles after each run.

## Result

The August 12 run used Vale source revision `8fe98044d4bc90e5291372a183b4c7021490aa09`.

- All 16 live rules with detection patterns compiled and ran under Vale.
- The six synthetic Markdown cases produced three true positives, zero false positives, and zero false negatives under Vale.
- The raw-regex baseline produced the same three true positives plus two false positives from fenced and inline code.
- The database SHA-256 stayed unchanged at `e71e26e771432babbd96978d4d77d9b399143988df5bd83048019feb910248d3`.

The spike supports an optional Vale-backed evaluator. It does not support replacing Margin's rule memory, judgment-based evaluator, or current guard. The fixture set is too small to justify a shipped binary dependency.

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

The command refuses immutable reads while a non-empty SQLite WAL exists. It reports aggregate counts and fixture scores without copying database text into the repository.

## Promotion Gate

Before Vale becomes a production dependency, run the adapter against at least 30 privately stored, human-labeled documents across Markdown structures and writing types. Vale must preserve the current detector's recall, reduce false positives, return stable source spans, and stay within the interactive latency budget. Sam preference and factual-preservation checks remain separate gates.
