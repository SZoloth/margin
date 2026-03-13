# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Set up a safe, Margin-specific pi autoresearch workflow that works with dedicated git worktrees and requires minimal user input.

### Outcome

A Margin user can:

- say `/autoresearch` from any Margin checkout
- or just type a natural request like `let's run autoresearch on search speed`
- get a dedicated `feat/autoresearch-*` worktree automatically
- have pi launch the dedicated autoresearch session automatically in a new Terminal window when running interactively
- fall back to the manual worktree + skill flow if Terminal launch is blocked
- run the experiment loop with safe scoped commits and scoped restores instead of `git add -A` / `git checkout -- .`

### Constraints

- Do not touch unrelated dirty files in the original worktree.
- Keep the workflow compatible with Margin's git/worktree rules.
- Prefer project-local pi resources (`.pi/extensions`, `.pi/skills`) over global setup.
- Optimize for minimal user input, but keep the final experiment execution in a dedicated worktree.

### Steps

1. Create a dedicated implementation worktree so repo changes stay isolated.
2. Add a project-local pi extension with safe worktree setup and safe autoresearch tools.
3. Add a project-local pi skill that uses those tools to scaffold and run an experiment session.
4. Add a one-command `/autoresearch` entrypoint that creates the worktree and launches pi into it.
5. Add natural-language routing so plain requests containing "autoresearch" trigger the same entrypoint.
6. Document the intended flow and fallback path.
7. Verify the extension loads, the commands are discoverable, and the scoped commit/restore flow still works.

## Decisions

- Use project-local `.pi/` resources so the setup travels with the repo.
- Replace unsafe global staging/reset behavior with config-driven scoped staging and scoped restore.
- Keep worktree creation interactive via an extension command, but allow an optional command argument for non-interactive smoke tests.
- Add `/autoresearch` as the default entrypoint. It launches Terminal via `osascript` when running interactively and falls back cleanly when that fails.
- Natural-language routing uses the `input` event and directly invokes the same helper as `/autoresearch`; transforming to a slash command was the wrong mechanism because extension commands are resolved before `input` transforms.
- Keep the upstream-style experiment loop, but make the setup templated via a dedicated tool.
- Require `feat/autoresearch-*` branches so the loop cannot run in an ordinary feature worktree.
- If the source worktree is dirty, `/autoresearch` warns that the new worktree starts from committed HEAD only.

## Open Questions

- Whether to add richer dashboard UI later or keep the current minimal widget.
- Whether to add automatic cleanup for untracked benchmark artifacts beyond reporting them.
- Whether to support other terminal apps besides Terminal.app.

## Verification

- `cd ../margin-pi-autoresearch && pnpm install`
- `cd ../margin-pi-autoresearch && bash scripts/verify standard` ✅
- `cd ../margin-pi-autoresearch && pi -p --no-session --tools read,find,ls "Reply with the names of any custom commands or skills in this project related to autoresearch and nothing else."` → `/autoresearch`, `/autoresearch-worktree`, `margin-autoresearch`
- `cd ../margin-pi-autoresearch && pi -p --no-session "Reply only with the names of any custom tools in this project related to autoresearch."` → `setup_autoresearch_session`, `init_experiment`, `run_experiment`, `log_experiment`
- `cd ../margin-pi-autoresearch && pi -p --no-session "/autoresearch smoke-auto"` created a dedicated `feat/autoresearch-smoke-auto` worktree via the one-command path
- `cd ../margin-pi-autoresearch && pi -p --no-session "let's run autoresearch on smoke-natural"` also created a dedicated `feat/autoresearch-smoke-natural` worktree via natural-language routing
- In smoke worktrees:
  - pi still discovered `/autoresearch`, `/autoresearch-worktree`, and `/skill:margin-autoresearch`
  - `setup_autoresearch_session` successfully scaffolded `autoresearch.config.json`, `autoresearch.md`, `autoresearch.sh`, and `autoresearch.checks.sh`
- Earlier smoke verification of the safe tools in dedicated worktrees also passed:
  - `init_experiment` initialized `autoresearch.jsonl`
  - `run_experiment` executed the benchmark and checks successfully
  - `log_experiment status=keep` created a conventional-commit baseline commit
  - modifying `docs/architecture.md` and then `log_experiment status=discard` restored the scoped tracked file cleanly
- Clean up temporary smoke worktrees and branches before handoff

## Handoff

- Project-local pi autoresearch now lives in `.pi/extensions/margin-autoresearch/index.ts` and `.pi/skills/margin-autoresearch/SKILL.md`.
- The operator doc is `docs/pi-autoresearch.md`.
- `/autoresearch` is now the default user-facing entrypoint.
- Natural-language prompts that clearly request autoresearch now route to the same entrypoint.
- The current branch is `feat/pi-margin-autoresearch`.
- Main remaining improvement would be richer dashboard UI or alternate terminal support, but the safe one-command worktree flow is now in place.
