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

## Branch Coordination

**Multiple agents work on this repo simultaneously.** Direct commits to `main` cause regressions (see v1.13.1 — an entire feature was stripped by a stash reintegration). Follow these rules:

### Never commit directly to main

Create a feature branch for your work. Name it `feat/<name>` or `fix/<name>`.

```bash
git checkout -b feat/my-feature
# ... do work ...
git add <specific files>
git commit
git push -u origin feat/my-feature
```

The repo owner merges to main manually after review.

### Before committing, check for collisions

```bash
git status --short            # see all dirty files
git diff --name-only HEAD     # see what you've touched
```

If you see modified files **you did not edit**, another agent is working on them. Do not stage those files. Only `git add` the specific files you changed.

### High-collision files

These files are touched by multiple workstreams. Extra caution required:

| File | Why it collides |
|------|-----------------|
| `src/App.tsx` | Every UI feature wires into App |
| `src-tauri/src/lib.rs` | Every Rust command registers here |
| `src-tauri/src/commands/mod.rs` | Every command module registers here |
| `src-tauri/src/db/migrations.rs` | Every schema change goes here |
| `src/lib/tauri-commands.ts` | Every command needs a TS wrapper |

For these files: **stage only your hunks, not the whole file.** Use `git add -p <file>` to interactively select only your changes, or list your specific files with `git add file1 file2` and leave others unstaged.

### Quality gate before push

All four must pass before pushing:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
pnpm tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test
```

If they fail because of another agent's uncommitted changes in your working tree, stash or revert those files first (`git checkout -- <file>` for files you didn't touch).

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
4. Create a feature branch if you haven't already, commit, and push:
   ```bash
   git checkout -b feat/my-feature   # skip if already on a feature branch
   git add <only your files>         # NEVER git add -A or git add .
   git commit -m "feat: description"
   git push -u origin feat/my-feature
   git status                        # verify clean
   ```
5. Clean up local residue.
6. Verify all changes are committed and pushed.
7. Hand off context in `PLANS.md` and the final response.

## Critical Rules

- Work is not complete until `git push` succeeds.
- Never stop before pushing.
- Never say "ready to push when you are".
- If push fails, resolve and retry until it succeeds.
- **Never commit directly to main.** Use feature branches.
- **Never `git add -A` or `git add .`** — only stage files you changed.
