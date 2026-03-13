---
name: margin-autoresearch
description: Set up and run a safe autonomous experiment loop for Margin. Use when you want pi to optimize a specific Margin workload with minimal input while respecting dedicated worktrees, scoped commits, and Margin's git guardrails.
---

# Margin autoresearch

Run this only inside a dedicated Margin autoresearch worktree created with `/autoresearch` or `/autoresearch-worktree`.

## Safety rules

- The current branch must start with `feat/autoresearch-`.
- Stay inside the declared files in scope.
- Never use `git add -A`, `git add .`, `git checkout -- .`, or repo-wide cleanup commands.
- Use `log_experiment` for every keep/discard/crash decision. It owns scoped commit and scoped restore.
- If setup fails because the worktree is dirty or the branch is wrong, stop and tell the user to run `/autoresearch-worktree` first.

## Tools

- `setup_autoresearch_session` writes `autoresearch.config.json`, `autoresearch.md`, `autoresearch.sh`, and optional `autoresearch.checks.sh`.
- `init_experiment` starts or re-starts the current result segment in `autoresearch.jsonl`.
- `run_experiment` runs `./autoresearch.sh` by default and optional checks from `./autoresearch.checks.sh`.
- `log_experiment` safely stages scoped files for keep runs and safely restores scoped tracked files for non-keep runs.

## Workflow

1. Confirm the branch is `feat/autoresearch-*` and the worktree is dedicated to this experiment.
2. Ask only for the missing information:
   - Goal
   - Benchmark command
   - Primary metric and direction
   - Secondary metrics worth tracking, if any
   - Files in scope
   - Off-limits files
   - Hard constraints
   - Whether backpressure checks are required
3. Read the relevant source files in scope before writing anything.
4. Call `setup_autoresearch_session` with a tight scope and concrete constraints.
5. Call `init_experiment`.
6. Run the baseline with `run_experiment`.
7. Call `log_experiment` for the baseline. Baseline is usually `keep` unless the benchmark or checks are broken.
8. Continue the loop autonomously:
   - Edit only in-scope files.
   - `run_experiment`
   - `log_experiment`
   - Keep improvements, discard regressions, log crashes, continue.
9. Keep `autoresearch.md` current, especially `What's Been Tried`.
10. Put deferred ideas in `autoresearch.ideas.md` so a later session can resume cleanly.

## Benchmark and checks guidance

- Prefer `./autoresearch.sh` unless there is a strong reason to override the command.
- Keep the benchmark script fast and deterministic.
- Only create `autoresearch.checks.sh` when correctness checks are part of the user's constraints.
- Checks should be targeted, not full-repo by default. For Margin, prefer focused `vitest`, `tsc`, or `cargo check` commands over full `scripts/verify` on every loop iteration.

## Margin-specific reminders

Before the first setup call, read:

- `.claude/napkin.md`
- `docs/product-vision.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/evals.md`
- `docs/troubleshooting.md`

Treat these files as off-limits unless the experiment explicitly targets them.

## Stop conditions

Do not stop to ask "should I continue?".

Only stop when:

- the user interrupts
- the benchmark is fundamentally broken and cannot produce a trustworthy baseline
- repo hooks or scoped auto-commit fail repeatedly and need a tool-level fix
- all credible experiment paths are exhausted and you can summarize the best result plus dead ends
