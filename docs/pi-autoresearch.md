# Pi autoresearch for Margin

Margin now ships a project-local pi autoresearch workflow under `.pi/`.

## Goal

Run autonomous optimization loops safely in a dedicated worktree without relying on repo-wide staging or reset commands.

## Flow

### Default

1. From any Margin checkout, start pi.
2. Run `/autoresearch` — or just type a natural request like `let's run autoresearch on search speed`.
3. Give a short optimization target when prompted if you did not include one.
4. Pi creates a sibling worktree on `feat/autoresearch-<topic>` from the current checkout's committed HEAD, adds local excludes for:
   - `autoresearch.jsonl`
   - `autoresearch.ideas.md`
5. Pi opens a new Terminal window in that worktree and starts `pi "/skill:margin-autoresearch ..."` automatically.
6. Answer only the remaining setup questions.
7. Let the loop run.

### Manual fallback

1. Run `/autoresearch-worktree`.
2. `cd` into the new worktree and start pi there.
3. Run `/skill:margin-autoresearch`.

If `/autoresearch` is run from inside an existing dedicated `feat/autoresearch-*` worktree, it skips worktree creation and directly starts `/skill:margin-autoresearch` in the current pi session.

## What is different from upstream pi-autoresearch

- Requires a dedicated `feat/autoresearch-*` branch.
- Writes project-local session files with `setup_autoresearch_session`.
- Uses scoped staging on keep runs.
- Uses scoped restore on discard, crash, and `checks_failed` runs.
- Blocks `git add -A`, `git add .`, `git checkout -- .`, and repo-wide clean commands from pi's `bash` tool.

## Files

- `.pi/extensions/margin-autoresearch/index.ts`
- `.pi/skills/margin-autoresearch/SKILL.md`
- `autoresearch.config.json`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh` (optional)
- `autoresearch.jsonl`
- `autoresearch.ideas.md`

## Verification expectations

- Use targeted checks inside `autoresearch.checks.sh` during the loop.
- Run the appropriate `scripts/verify` mode before handing off the final branch.
