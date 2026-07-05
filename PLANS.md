# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Execute `plans/repair-spec-2026-07.md` on branch `fix/loop-repair-2026-07`.

### Outcome

The July repair P0s are implemented with failing-test-first evidence, verified locally, and reported in `plans/repair-report-2026-07.md`. Commit/push is blocked in this sandbox because `.git` is read-only.

### Constraints

- Work only on `fix/loop-repair-2026-07`.
- Implement P0 fixes first; P1 only after all P0s are verified.
- Write a failing test before each fix.
- Stop and write `plans/repair-bounceback.md` if a spec bounce-back trigger or discard condition is hit.
- Do not touch anything under `mcp/scripts/`.
- Run all four required quality gates before committing:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `pnpm tsc --noEmit`
  - `pnpm test`
- Stage only files changed for this repair.

### Steps

1. P0-1: add note intent taxonomy, schema migration, export filtering, prompt sidecar, summary counts, and tests.
2. P0-2: fix note-button selection capture, reject whitespace highlights, reject empty correction text, surface failures, and tests.
3. P0-3: resolve `margin` CLI robustly for GUI PATH, surface auto-export failures, log failures, and tests.
4. Run the required quality gates.
5. Write the repair report with exact outputs.
6. Commit and push the branch.

### Decisions

- The three note intents are fixed by spec: `correction`, `note`, and `prompt`.
- Only `correction` notes become correction rows.
- `prompt` notes are skipped from corrections and written to a prompt sidecar.
- Silent pipeline failures should become visible app errors and log entries.

### Surprises

- The working tree started with many untracked files, including `mcp/scripts/`; those are treated as pre-existing and must not be staged.
- Several open branches touch high-collision files. Keep high-collision edits narrow and bounce if an actual hunk conflict appears.

### Verification

- `cargo check --manifest-path src-tauri/Cargo.toml` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml` passed: 228 Rust tests, 0 failed; doc-tests passed.
- `pnpm tsc --noEmit` passed with no output.
- `pnpm test` passed: 42 files, 289 tests.
- Targeted failing-test-first evidence and passing reruns are recorded in `plans/repair-report-2026-07.md`.

### Handoff

P0 repair completed and verified. P1 was not attempted in this pass to keep the medium-risk data-path diff reviewable after all four P0 gates passed.

Commit/push blocker: `git add ...` failed with `fatal: Unable to create '/Users/samzoloth/Projects/margin/.git/index.lock': Operation not permitted`. No files are staged.
