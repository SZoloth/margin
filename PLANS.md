# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Make the eval harness produce real evidence on branch `fix/eval-harness`:
`adversarial-test.ts` and `compliance-check.ts` run end-to-end against a
pluggable generation provider.

### Outcome

The product thesis ("rules mechanically improve AI output") is measured, not
asserted. First real run (poolside, email+blog): coached output scores +5.3
dimension points/sample vs uncoached, rhythm +4.8, mechanical issues flat.

### Constraints

- Generation goes through `evalGenerate()` in `mcp/scripts/shared.ts`;
  `MARGIN_EVAL_CMD` overrides the command (default `claude --print --model
  sonnet`). `poolside` is the known-working free local provider.
- `claude` CLI auth is broken on this machine (org disabled subscription
  access + stale API key); `codex exec` fails on a config parse error;
  `devin -p` needs `devin auth login`. See docs/troubleshooting.md.
- An all-failed or zero-issue eval run is invalid evidence, not a pass.
- Stage only this task's files; Linear is the tracker (SAM-161).

### Steps

1. Fix compliance-check arg parsing and kill-word inflection matching. DONE.
2. Add `evalGenerate()` provider abstraction; route both scripts through it. DONE.
3. Verify: mcp tests + tsc pass; real comparison run produces non-empty data. DONE.
4. Document provider config in docs/evals.md + docs/troubleshooting.md. DONE.
5. `scripts/verify standard`, then merge to main.

### Next

- SAM-958: label the 25 Vale alerts from the 30-doc validation.
- SAM-161: derive narrow evaluators from correction history (this harness
  is the substrate for that).
- Restore `claude`/`codex`/`devin` CLI auth so evals can compare providers.

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

