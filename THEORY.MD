# Theory: Inline Accept Must Follow the Same Identity Discipline As The Ticket

## Problem

Inline Accept exists to close the correction loop immediately: apply the suggested edit to the current document and only then persist acceptance in SQLite. The original feature commit achieved the affordance, but not the identity guarantees. It could replace the first matching phrase in the editor instead of the annotated highlight, which meant the UI could appear successful while mutating the wrong text and marking the correction accepted anyway.

The takeover exposed a parallel workflow problem. `SAM-134` was already in `Merging`, and PR `#33` was open and green, but the safety rework lived only in the local worktree. Merging from that stale PR state would have repeated the same class of mistake at a process level: acting on the wrong identity.

## Operating Theory

The correct implementation and the correct workflow share the same rule: do not persist success against an ambiguous target.

For the product change, that means:

1. Find the exact TipTap range carrying the correction's `highlight_id`.
2. Apply the text replacement there.
3. Only after that succeeds, persist `accepted_at`.

For the ticket flow, that means:

1. Confirm the issue, PR, and local branch all refer to the same actual branch content.
2. Publish the safety rework onto the attached PR.
3. Revalidate the merged branch state.
4. Only then decide whether the ticket can legitimately stay in `Merging` and land.

The underlying principle is fail-closed identity. When the system is not sure it is acting on the right object, it should stop instead of writing optimistic state.

## Strategy

The strategy remains intentionally narrow.

- Keep the product fix in the frontend/TipTap boundary where the bug actually lives.
- Prove the behavior with two regressions:
  - a component-level test that acceptance is not persisted when the editor apply step fails
  - a lower-level editor test that duplicate phrases are resolved by `highlightId`, not first textual match
- Treat workflow repair as publication work, not new feature work:
  - sync the branch with `origin/main`
  - keep the active task memory intact while resolving session-file conflicts
  - push the corrected branch state to PR `#33`
  - merge only from that updated state

## Key Discoveries

The visible reviewer complaint was about the stale workpad, but the deeper bug was behavioral. Re-reviewing the already-landed feature code was what surfaced the unsafe first-match replacement.

The takeover also falsified the prior blocker model. In this session, `git fetch origin`, `gh pr view 33`, commits, and `pnpm tauri dev` all worked. The real risk is no longer environmental access. It is process drift between Linear state, PR state, and local branch state.

Syncing `origin/main` confirmed that drift cleanly. Product code merged without conflict. Only `PLANS.md` and `THEORY.MD` conflicted, because `main` now carries active working-memory for a different ticket. That reinforces their actual role: they are live local task memory, not durable cross-ticket artifacts.

## Open Questions

The current helper reconstructs the replacement span from text nodes carrying the same `highlightId`. That is correct for the current edit and wordiness cases, but richer inline formatting inside a highlight may deserve another regression if this feature expands.

The product still lacks a good UX when a correction's source highlight is not mounted in the active editor. Failing closed is correct, but there may need to be clearer UI feedback for that case.

The workflow still references `.claude/skills/land/SKILL.md`, but that path is absent from this checkout. If the landing path depends on it, the repo should either vend that file or stop depending on a missing script.
