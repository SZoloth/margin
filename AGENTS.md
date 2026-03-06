# Agent Instructions

## Start Here

Read these files before substantial work:

1. `.claude/napkin.md`
2. `docs/product-vision.md`
3. `docs/architecture.md`
4. `docs/invariants.md`
5. `docs/evals.md`
6. `docs/troubleshooting.md`
7. `docs/harness-engineering.md`
8. `PLANS.md` if active work is already in progress

This repo already has harness architecture in `docs/harness-engineering.md` and `.harness/`.
Use this file as a router, not a long-form context dump.

## Working Rules

- Keep `PLANS.md` updated for any non-trivial task.
- Use `scripts/verify` as the default quality gate entrypoint.
- If you learn a new failure mode, add it to `docs/troubleshooting.md`.
- If you learn a new hard constraint, add it to `docs/invariants.md`.
- If verification expectations change, update `docs/evals.md`.
- This repo is the Tauri app. `MarginOS-Swift` now lives in a separate repo; the `Margin/` directory here is stale.

## Issue Tracking

This project uses `bd` (beads) for issue tracking. Run `bd onboard` to get started.

### Quick Reference

```bash
bd ready
bd show <id>
bd update <id> --status in_progress
bd close <id>
bd sync
```

## Landing The Plane

When ending a work session, complete all steps below. Work is not complete until `git push` succeeds.

1. File issues for remaining work.
2. Run quality gates if code changed.
3. Update issue status.
4. Push to remote:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status
   ```
5. Clean up local residue.
6. Verify all changes are committed and pushed.
7. Hand off context in `PLANS.md` and the final response.

## Critical Rules

- Work is not complete until `git push` succeeds.
- Never stop before pushing.
- Never say "ready to push when you are".
- If push fails, resolve and retry until it succeeds.
