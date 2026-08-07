# Troubleshooting

## Wrong Codebase

### Symptom

You are editing files under `Margin/` or following old Swift instructions and the changes do not affect the Tauri app.

### Likely Cause

`MarginOS-Swift` was split into a separate repo. The `Margin/` directory in this repo is stale.

### Fix

Work from `src/`, `src-tauri/`, `mcp/`, and `docs/` in this repo. If the task is actually for the Swift app, switch repos.

## Wrong App Under Test

### Symptom

Behavior does not match current source changes, or you are testing the production app by accident.

### Likely Cause

You launched `/Applications/Margin.app` instead of the development app.

### Fix

Use `pnpm tauri dev` and confirm you are testing the dev build, not the installed production app.

## Browser Automation Mismatch

### Symptom

Playwright, Chrome DevTools, or browser automation assumptions fail against the main UI.

### Likely Cause

The main app is a Tauri webview, not a browser tab.

### Fix

Test with `pnpm tauri dev`, frontend unit tests, or backend tests. Do not assume browser automation tools can attach to the Tauri window.

## Missing Dependencies In Worktrees

### Symptom

TypeScript or test commands fail unexpectedly in a fresh worktree.

### Likely Cause

Dependencies were not installed for that worktree.

### Fix

Run `pnpm install` before trusting the failures. For direct typechecks, prefer `./node_modules/.bin/tsc --noEmit`.

## Export Or Rule Changes Drift

### Symptom

Rules appear updated in one surface but generated artifacts or MCP output do not match.

### Likely Cause

Cross-surface parity drift between Rust, MCP, and generated artifacts.

### Fix

Run the appropriate verify tier, inspect generated outputs under `~/.margin/`, and treat Rust migrations plus generated artifact paths as the source-of-truth chain that must stay aligned.

## MCP Native Module ABI Mismatch

### Symptom

`mcp` tests fail with `better-sqlite3` errors mentioning `NODE_MODULE_VERSION` mismatch.

### Likely Cause

The outer shell is using a different Node runtime than the package-local runtime used by the `mcp` workspace. In practice, the current working directory affects which runtime `pnpm` picks.

### Fix

Run `bash scripts/verify standard`. The verifier resolves the active Node runtime and the workspace-local MCP test and TypeScript entrypoints.

If needed, confirm the local runtime with:

- `pnpm --dir mcp exec node -p "process.version + ' modules=' + process.versions.modules"`

## Database Integrity Failure

### Symptom

Margin refuses to start and reports a SQLite integrity check failure.

### Likely Cause

The primary database at `~/.margin/margin.db` is damaged. Margin checks the database before migrations and creates an online backup on each successful startup. It retains the five newest copies under `~/.margin/backups/`.

### Fix

1. Quit Margin and preserve `~/.margin/margin.db`, plus its `-wal` and `-shm` files when present.
2. Run `sqlite3 ~/.margin/backups/<backup-file>.db 'PRAGMA quick_check;'` on the newest backup. Use a backup only when the result is `ok`.
3. Move the damaged database files into a dated recovery folder outside `~/.margin/`.
4. Copy the verified backup to `~/.margin/margin.db` and restart Margin.
5. Keep the recovery folder until documents, annotations, corrections, and writing rules have been checked in the app.

## Gap Audit Fails

### Symptom

`.harness/scripts/audit-gaps.mjs` exits non-zero.

### Likely Cause

Malformed JSONL, duplicate gap IDs, missing referenced tests, or a closed gap without `commit_fixed` or `test_added`.

### Fix

Correct the entry in `.harness/gaps.jsonl`, make sure the referenced test file exists, then rerun the audit.
