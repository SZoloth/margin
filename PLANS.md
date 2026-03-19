# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Finish `SAM-134` from takeover state now that the anchor-safe rework is committed locally:

- keep the Linear workpad aligned with the real PR/branch state
- publish the highlight-anchored Accept fix and regression tests to PR `#33`
- sync the branch with `origin/main` without losing the active task memory
- only merge if the updated PR state is still legitimately ready

### Outcome

PR `#33` contains both the original inline Accept feature and the follow-up safety fix, the workpad reflects that updated branch state, and the issue ends in the correct final workflow state.

### Constraints

- Continue from the existing feature branch and attached PR.
- Do not discard the committed safety rework (`a2349e7`) while resolving the `origin/main` sync.
- Keep session-memory files accurate to the current task even though `origin/main` brought unrelated active-work context for another ticket.
- Do not overwrite unrelated uncommitted user work.

### Steps

1. Resolve the `origin/main` merge conflict in `PLANS.md` and `THEORY.MD` in favor of the live `SAM-134` task context.
2. Complete the merge from `origin/main` and rerun the required validation on the merged branch state.
3. Push the updated branch to PR `#33`.
4. Re-check PR checks/review state and choose the safe final ticket outcome:
   - merge if the updated branch is still legitimately merge-ready
   - otherwise move the issue out of `Merging` with explicit evidence

## Decisions

- The editor mutation remains centralized in `src/lib/apply-accepted-correction.ts`.
- Accept only persists to the database after the targeted editor mutation succeeds.
- Session-memory files should describe the active ticket, not whichever unrelated task most recently landed on `main`.

## Surprises

- The branch sync conflict was limited to `PLANS.md` and `THEORY.MD`; product code merged cleanly.
- `origin/main` now includes unrelated research-task working-memory updates, which is why these files conflicted.
- The earlier environment blockers were stale: GitHub access, commits, and `pnpm tauri dev` all work in this session.

## Verification

- `pnpm exec vitest run src/components/style-memory/__tests__/CorrectionsTab.test.tsx src/lib/__tests__/apply-accepted-correction.test.tsx`
- `pnpm tsc --noEmit`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm test`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `pnpm tauri dev` launched successfully through Vite and `target/debug/margin`, then was stopped cleanly after startup verification

## Handoff

- The local rework is already committed as `a2349e7`.
- Remaining work is purely branch/PR/ticket synchronization.
