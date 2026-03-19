# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Complete `SAM-134` from takeover state without losing the rework that exists only in this workspace:

- keep the Linear workpad accurate during takeover
- make Accept target the annotated `highlight_id`, not the first duplicate phrase in the editor
- preserve the accepted-in-DB behavior only after the editor mutation succeeds
- publish the rework onto PR `#33` before any merge action

### Outcome

The branch and PR both contain the anchor-safe Accept flow, the workpad matches reality, and the ticket lands only from the updated branch state.

### Constraints

- Continue from the existing feature branch and PR because takeover happened mid-stream.
- Do not discard the uncommitted rework that is ahead of PR `#33`.
- Keep the issue state honest if the updated PR needs another human look after push.
- Do not overwrite unrelated uncommitted user work.

### Steps

1. Reconcile takeover state: local rework exists, PR is still on `985d990`, issue is already in `Merging`.
2. Revalidate the rework from the current worktree.
3. Update repo docs/workpad so blockers and validation notes match the current session.
4. Commit and push the rework onto the existing branch.
5. Re-check PR/issue state and only merge if the updated branch is still legitimately merge-ready.

## Decisions

- The editor mutation is now centralized in `src/lib/apply-accepted-correction.ts`.
- The Accept flow treats editor mutation as the gate: no DB acceptance if the highlighted range cannot be safely updated.
- Takeover continues on the existing feature branch instead of restarting from `origin/main`, because the necessary fix already exists locally and the PR attachment points at this branch.

## Surprises

- The attached PR and Linear issue had advanced to `Merging` even though the safety rework was still only in the local worktree.
- The earlier sandbox blockers cleared in this session: GitHub fetch/PR queries work, commits are possible, and `pnpm tauri dev` launches successfully.
- The repo-local `.claude/skills/land/SKILL.md` path referenced by the workflow does not exist in this checkout, so landing has to use a safe fallback instead of that missing script.

## Verification

- `pnpm exec vitest run src/components/style-memory/__tests__/CorrectionsTab.test.tsx src/lib/__tests__/apply-accepted-correction.test.tsx`
- `pnpm tsc --noEmit`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm test`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `pnpm tauri dev` launched successfully through Vite and `target/debug/margin`, then was stopped cleanly after startup verification

## Handoff

- The rework is validated locally and ready to publish.
- The remaining work is workflow correctness: push the rework to PR `#33`, refresh Linear, and only merge from that updated branch state.
