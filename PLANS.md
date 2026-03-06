# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Install the operator layer for Margin's harness workflow:

- short routing instructions in `AGENTS.md`
- canonical repo docs for architecture, invariants, evals, and troubleshooting
- a tier-aware `scripts/verify` entrypoint

### Outcome

A fresh agent should be able to enter the repo, find the right docs quickly, and run the correct verification path without reconstructing repo conventions from chat history.

### Constraints

- Preserve the existing `bd` workflow.
- Preserve the existing harness strategy in `docs/harness-engineering.md`.
- Do not overwrite unrelated uncommitted user work.
- Keep repo knowledge in files, not in `AGENTS.md`.

### Steps

1. Read the existing repo instructions, napkin, and harness docs.
2. Add the missing operational docs and verify entrypoint.
3. Update `AGENTS.md` to route to those files.
4. Run lightweight verification for the new shell/docs layer.

## Decisions

- `AGENTS.md` stays short and routes to canonical docs.
- `docs/harness-engineering.md` remains the deep harness design doc; new docs cover day-to-day operator use.
- `scripts/verify` encodes Margin's existing `standard` vs `data-layer` split instead of flattening it.

## Surprises

- Margin already had `.harness/` scaffolding and a strong architecture-level harness doc.
- The missing piece was not strategy but operator-facing entrypoints and canonical repo docs.
- The repo currently runs with two Node runtimes in practice: root shell commands on Node 25 and `mcp` package-local exec on Node 22. MCP native-module tests must use the package-local runtime.

## Verification

- `bash -n scripts/verify`
- `scripts/verify --help`
- `node .harness/scripts/audit-gaps.mjs` → `gaps.jsonl is empty — nothing to audit.`
- `bash scripts/verify standard` reproduced two harness issues and drove the fixes:
  - root verify was mixing frontend and MCP tests
  - MCP verification needed package-local `pnpm exec` to avoid Node ABI mismatch
- Final state: `bash scripts/verify standard` passes end to end.
- `bash scripts/verify data-layer`
  - passed: typecheck, frontend tests, frontend build, MCP tests, MCP build, gap audit, `cargo check`, `cargo test`
  - failed: `cargo clippy -- -D warnings` on pre-existing Rust lint issues in `src/commands/corrections.rs`, `src/commands/writing_rules.rs`, and `src/db/migrations.rs`

## Handoff

- The operator layer is now installed.
- The next useful task is to either fix the current Rust clippy backlog or decide whether `data-layer` mode should tolerate existing lint debt while the repo is in transition.
