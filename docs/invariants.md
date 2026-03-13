# Invariants

## Product Invariants

- Margin exists to improve AI writing quality, not just to provide a pleasant reading UI.
- The writing loop must remain intact: read, annotate, correct, synthesize rules, export artifacts, enforce on future writing.
- High-friction or low-signal features are secondary to reliability of the writing-quality pipeline.

## Data Invariants

- SQLite is the source of truth for corrections and writing rules.
- Schema truth originates in Rust migrations under `src-tauri/`; other surfaces must derive from that schema.
- Generated artifacts such as `~/.margin/writing-rules.md` and `~/.claude/hooks/writing_guard.py` are derived outputs and must not become the primary source of truth.
- Rule metadata such as `writing_type`, `register`, and `signal_count` must survive round-trips across app, MCP, and exports.

## Behavioral Invariants

- Text anchoring must either preserve highlight position or surface a degraded state explicitly. Silent loss is not acceptable.
- Pipeline failures should fail visible, not silent.
- The writing guard should enforce hard constraints at the tool layer while remaining robust against malformed generated content.

## Operational Invariants

- This repo is the Tauri implementation. Do not treat the stale `Margin/` directory as an active code path.
- Verification should run through `scripts/verify` so agents follow the same entrypoint.
- Pi autoresearch must run in a dedicated `feat/autoresearch-*` worktree. Repo-wide git staging and reset commands remain forbidden there too.
- Gap tracking lives in `.harness/gaps.jsonl`; production escapes should result in a durable record and a regression test.

## Unsafe Changes

- Rust migrations and database command handlers
- `src/lib/text-anchoring.ts`
- Generated artifact format changes
- Tauri capability changes
- CI workflow changes that can weaken gates or evidence collection
