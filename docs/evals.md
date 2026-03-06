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

- text anchoring behavior after edits
- correction to rule to artifact chain integrity
- parity between Rust-backed and MCP-backed generated artifacts
- visible error handling instead of silent failure
- generated writing artifacts still reflect the database truth

## Release Confidence

Changes are ready to hand off when:

- the correct verify mode passes
- any tier-specific behavioral risks were checked explicitly
- new constraints or failure modes were documented in `docs/invariants.md` or `docs/troubleshooting.md`
- production escapes, if any, are captured in `.harness/gaps.jsonl`
