# Margin Repair Report — 2026-07-05

Branch: `fix/loop-repair-2026-07`

Commit/push status: blocked by sandbox `.git` permissions. `git add ...` failed with:

```text
fatal: Unable to create '/Users/samzoloth/Projects/margin/.git/index.lock': Operation not permitted
```

## Fixed

### P0-1: note intent taxonomy

- Added `margin_notes.intent` with fixed values: `correction`, `note`, `prompt`.
- Existing notes default to `correction` through migration.
- Added the three-chip selector in the note popover, defaulting to `correction`.
- Export input building now splits notes by intent.
- `correction` notes persist as correction rows and flow to rule synthesis.
- `note` notes are skipped from correction persistence.
- `prompt` notes are skipped from correction persistence and appended to `~/.margin/corrections/prompts-YYYY-MM-DD.jsonl`.
- Export popover reports the split, for example `1 correction, 1 prompt skipped`.

Failing-test-first evidence:

```text
cargo test --manifest-path src-tauri/Cargo.toml persist_corrections_filters_by_intent_and_writes_prompt_sidecar
error[E0560]: struct `models::CorrectionInput` has no field named `intent`
error[E0425]: cannot find function `persist_corrections_inner` in this scope

pnpm vitest run src/lib/__tests__/export-annotations-intent.test.ts
FAIL  src/lib/__tests__/export-annotations-intent.test.ts > buildCorrectionExportInputs > splits margin notes by intent before persistence
TypeError: buildCorrectionExportInputs is not a function
```

Passing verification:

```text
cargo test --manifest-path src-tauri/Cargo.toml persist_corrections_filters_by_intent_and_writes_prompt_sidecar
test commands::corrections::tests::persist_corrections_filters_by_intent_and_writes_prompt_sidecar ... ok

pnpm vitest run src/lib/__tests__/export-annotations-intent.test.ts
✓ src/lib/__tests__/export-annotations-intent.test.ts (1 test) 7ms
```

### P0-2: empty highlight/correction guard and note-button selection

- Backend rejects whitespace-only highlight text with `empty highlight text is not allowed`.
- Backend rejects correction inserts with whitespace-only `original_text`.
- Note toolbar action captures the selection range on `mousedown` and passes that range to the note creation path.
- Highlight creation failures now surface through the existing `ErrorToast` instead of only `console.error`.

Failing-test-first evidence:

```text
cargo test --manifest-path src-tauri/Cargo.toml insert_highlight_rejects_whitespace_text_content
test commands::annotations::tests::insert_highlight_rejects_whitespace_text_content ... FAILED
whitespace-only highlights should be rejected: ()

cargo test --manifest-path src-tauri/Cargo.toml persist_corrections_rejects_empty_original_text
test commands::corrections::tests::persist_corrections_rejects_empty_original_text ... FAILED
empty correction text should be rejected: PersistCorrectionsOutcome { ... correction_count: 1, prompt_count: 0 }

pnpm vitest run src/components/editor/__tests__/FloatingToolbar.test.tsx -t "passes the mousedown selection range"
FAIL  src/components/editor/__tests__/FloatingToolbar.test.tsx > FloatingToolbar > passes the mousedown selection range to the note action
expected "vi.fn()" to be called with arguments: [ { from: 3, to: 8 } ]
Received: SyntheticBaseEvent ...
```

Passing verification:

```text
cargo test --manifest-path src-tauri/Cargo.toml insert_highlight_rejects_whitespace_text_content
test commands::annotations::tests::insert_highlight_rejects_whitespace_text_content ... ok

cargo test --manifest-path src-tauri/Cargo.toml persist_corrections_rejects_empty_original_text
test commands::corrections::tests::persist_corrections_rejects_empty_original_text ... ok

pnpm vitest run src/components/editor/__tests__/FloatingToolbar.test.tsx -t "passes the mousedown selection range"
✓ src/components/editor/__tests__/FloatingToolbar.test.tsx (5 tests | 4 skipped) 34ms
```

### P0-3: production rules export PATH failure

- Added CLI resolver order:
  1. `$HOME/.local/bin/margin`
  2. `PATH`
  3. login-shell fallback with `command -v margin`
- `run_cli_export` now executes the resolved absolute CLI path.
- Export failures append to `~/.margin/margin-app.log`.
- Auto-export failures now show `Writing rules export failed: ...` through `ErrorToast`.

Failing-test-first evidence:

```text
cargo test --manifest-path src-tauri/Cargo.toml resolver_returns_typed_error_when_margin_cli_is_missing
error[E0425]: cannot find function `resolve_margin_cli_from_path` in this scope
```

Passing verification:

```text
cargo test --manifest-path src-tauri/Cargo.toml resolver_returns_typed_error_when_margin_cli_is_missing
test commands::writing_rules::tests::resolver_returns_typed_error_when_margin_cli_is_missing ... ok
```

## Full Quality Gates

### `cargo check --manifest-path src-tauri/Cargo.toml`

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 1m 29s
```

### `cargo test --manifest-path src-tauri/Cargo.toml`

```text
running 228 tests
test result: ok. 228 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.30s

Running unittests src/main.rs
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

Doc-tests margin_lib
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

### `pnpm tsc --noEmit`

```text
passed with no output
```

### `pnpm test`

```text
Test Files  42 passed (42)
Tests  289 passed (289)
Duration  4.56s
```

Expected test stderr/stdout during `pnpm test`:

```text
useSearch tests intentionally log mocked indexing/search failures.
front-matter tests intentionally print markdown round-trip debug output.
Node prints: ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
```

## Not Done

- P1 items were not attempted after P0 verification. The P0 diff touches schema, persistence, export, and high-collision UI surfaces; stopping here keeps the repair reviewable.
- Manual Tauri repro was not run in this session. The covered behavior is verified by Rust persistence tests, frontend export-builder tests, toolbar selection tests, `tsc`, and full frontend/Rust suites.

## Scope Check

- No files under `mcp/scripts/` were modified.
- Pre-existing untracked files remain untracked and were not staged.
- No files are staged because `.git/index.lock` creation is blocked in this environment.
