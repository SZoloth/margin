# Evals

This repo already defines a two-tier harness model in `docs/harness-engineering.md`.
This file is the operator-facing version of that policy.

## Risk Tiers

### Standard

Default tier for most frontend, MCP, config, and docs changes.

### Data-Layer

Treat these as high risk:

- `src-tauri/src/db/**`
- `src-tauri/src/commands/annotations.rs`
- `src-tauri/src/commands/corrections.rs`
- `src-tauri/src/commands/documents.rs`
- `src/lib/text-anchoring.ts`
- `src-tauri/capabilities/**`
- `.github/workflows/**`

## Verification Entry Point

Use `scripts/verify`.

Modes:

- `scripts/verify standard`
- `scripts/verify data-layer`
- `scripts/verify full`

Default is `full`.

## Required Checks

### Standard

- TypeScript typecheck
- Frontend tests
- Frontend build
- MCP tests
- MCP build
- Gap audit

### Data-Layer

- Everything in `standard`
- `cargo check`
- `cargo test`
- `cargo clippy -- -D warnings`

## Behavioral Evals

When relevant, also verify:

- Markdown formatting controls preserve selection, expose pressed state, and serialize to the expected Markdown
- reading and writing changes preserve cursor stability, save freshness, and supported Markdown round-trips
- saved feedback appears in SQLite before any export action
- disabling local learning prevents new correction rows without deleting prior learning data
- editing feedback updates the current unsynthesized signal without duplicating it
- feedback added after synthesis creates a new event
- text anchoring behavior after edits
- correction to rule to artifact chain integrity
- parity between Rust-backed and MCP-backed generated artifacts
- visible error handling instead of silent failure
- generated writing artifacts still reflect the database truth

## Generation Evals

`mcp/scripts/adversarial-test.ts` and `compliance-check.ts` are the loop's proof
instruments: the first measures coached (rules injected) vs uncoached output
quality per document type, the second scores a text file against the live
kill-word / slop / dimension rules.

```bash
cd mcp
pnpm eval:check -- <file>            # score one file
pnpm eval:check -- --type email <f>  # score against a type's rules
pnpm eval:adversarial -- --types email,blog        # coached only
pnpm eval:comparison -- --types email,blog         # coached vs uncoached, saves JSON
```

Generation runs through `evalGenerate()` in `mcp/scripts/shared.ts`, which
pipes the prompt to a command on stdin and reads the result on stdout. The
command is overridable:

- `MARGIN_EVAL_CMD` — any `stdin → stdout` generator. Default:
  `claude --print --model sonnet`. Known working: `poolside` (free local
  model shim). `codex exec`, `devin -p`, and `pi` also fit the contract when
  their auth/config is healthy.

A failed generation surfaces as an error for that sample — a zero-issue or
all-failed run is invalid evidence, not a pass. Comparison runs save to
`mcp/scripts/regression/comparison-<date>.json`.

## Autoresearch Loop

`mcp/scripts/autoresearch/` is the optimization layer on top of the eval: a
hill-climbing loop (`loop.ts --max N`) that mutates `coaching-prompt.md`,
re-evaluates all 9 types, and keeps or reverts each change with a git commit.
`program.md` defines the goal (corrections-per-document → 0) and competing
architectures (A rules, B exemplars, C two-pass editor, D
corrections-as-context, E hybrid, F governance schema, H DSPy). All
generation routes through `MARGIN_EVAL_CMD`:

```bash
cd mcp
MARGIN_EVAL_CMD=poolside pnpm exec tsx scripts/autoresearch/eval.ts --arch c
MARGIN_EVAL_CMD=poolside pnpm exec tsx scripts/autoresearch/loop.ts --max 3
```

Scores accumulate in `autoresearch/results.tsv`; `experiment-log.md` holds
the March 2026 architecture comparison (arch-c two-pass editor led at 88.9%
pass rate — unconfirmed on non-Claude providers).

## Release Confidence

Changes are ready to hand off when:

- the correct verify mode passes
- any tier-specific behavioral risks were checked explicitly
- new constraints or failure modes were documented in `docs/invariants.md` or `docs/troubleshooting.md`
- production escapes, if any, are captured in `.harness/gaps.jsonl`
- both product pillars were checked explicitly when a change touches their shared editor and feedback flow
