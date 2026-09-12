# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Make Margin's two product pillars explicit and ship the first missing behavior for each pillar on branch `feat/two-pillar-product`.

### Outcome

Margin treats the Markdown reading and writing experience as a core product, and feedback saved in the margin becomes local learning data without requiring an export step.

### Constraints

- Keep Markdown files portable and preserve round-trip behavior.
- Keep SQLite authoritative for feedback and rules.
- Keep automatic learning inspectable and reversible; synthesis remains reviewable.
- Preserve correction-event history after synthesis while updating the current unsynthesized signal in place.
- Write failing tests before each behavior change.
- Run `scripts/verify full`, stage only this task's files, commit, and push.

### Steps

1. Add failing tests for first-class formatting controls in the selection toolbar.
2. Add failing Rust tests for continuous feedback capture and unsynthesized-signal updates.
3. Implement both behaviors and wire visible error handling into the app.
4. Rewrite the product contract, architecture, invariants, and evals around the two pillars.
5. Run the full verification gate, commit, and push.

### Decisions

- The two pillars are peers. Reading and writing quality is not a disposable input surface for the learning system.
- A saved correction note becomes a correction row immediately. Later edits update the current unsynthesized row; feedback after synthesis creates a new event.
- Formatting controls share the selection toolbar with annotation controls so writing and feedback stay in one flow.

### Verification

- Failing-test-first evidence recorded for the formatting toolbar, continuous feedback capture, default learning preference, and export de-duplication.
- `scripts/verify full` passed with the matching Node 22 runtime: 294 frontend tests, production build, 184 MCP tests, MCP TypeScript, gap audit, cargo check, and 231 Rust tests.
- `scripts/verify standard` passed without an environment override after replacing the stale versioned Node path with Homebrew's stable `node@22` path.
- An additional `cargo clippy -- -D warnings` check remains blocked by 11 existing warnings in unchanged code. None point to the new feedback module or toolbar.

### Handoff

The two-pillar product contract, formatting controls, local learning default, continuous feedback capture, export de-duplication, and stable verification path are ready on `feat/two-pillar-product`.

P0 repair completed and verified. P1 was not attempted in this pass to keep the medium-risk data-path diff reviewable after all four P0 gates passed.

Commit/push blocker: `git add ...` failed with `fatal: Unable to create '/Users/samzoloth/Projects/margin/.git/index.lock': Operation not permitted`. No files are staged.

## 2026-09-04 Codex prompt cleanup

Sam approved a compact global writing router, preservation of the full profile,
and repair of tool/model/channel conflicts in local Codex instructions.

- Reuse `FormatProfileMarkdown` for complete accepted rules and correction examples.
- Generate a bounded Codex block with the profile path and channel/approval boundaries.
- Keep direct Codex export and both profile export routes consistent and preserve user text.
- Verify with failing-first export/budget tests, all Go tests, and the installed CLI export.

### Verification and scope

Before the fix, the bounded-router test failed and direct export did not create
the referenced profile. Four local prompt checks also failed. After the fix,
`GOMAXPROCS=2 go test -p 2 ./...` passes from `cli/`; regression coverage includes
repeat export, all three export routes, accepted rule retention, candidate
exclusion, and preservation of user instructions. `git diff --check` passes.

The CLI was built and installed at `/Users/samzoloth/.local/bin/margin`, then
`margin export codex` succeeded. The live global file shrank from 130859 to
13766 bytes after removal of a duplicate tool-map entry. Content outside the generated block survived the export unchanged
apart from blank lines. The local four-check prompt suite passes. No database
rules, model defaults, app state, active tasks, or network settings were changed.

Backups and rollback details live at
`/Users/samzoloth/.codex/backups/sol-high-cleanup-20260904.obyUQR/`.
No commit or push is authorized. Full Rust/frontend verification was not run
for this Go-only change. Static/export tests do not prove model behavior;
fresh-task instruction loading and representative writing quality remain
unverified. Existing task context was not reset.

