# Theory: Inline Accept Must Honor the Annotation Anchor

## Problem

Inline Accept is supposed to close the correction loop immediately: click Accept on a correction with `suggested_edit`, update the current document, and mark the correction accepted in SQLite. The previous implementation achieved the UI affordance and DB fielding, but it violated the most important part of the loop: the edit was not guaranteed to apply to the annotated text.

The bug was structural. The frontend searched the entire TipTap document for the first text node containing `matchText` and replaced that substring. If the same phrase appeared twice, or if the current editor was on a different document, Accept could mutate the wrong text while still writing `accepted_at` in the database. That is worse than no Accept button because it creates false confidence in both the document and the stored feedback state.

## Operating Theory

Margin already has the correct anchor primitive for this workflow: highlights are rendered as TipTap `highlight` marks carrying `data-highlight-id`. The correction record also stores that `highlight_id`. The safe implementation is therefore not a fuzzy text search. It is a highlight-targeted range mutation.

The acceptance flow now has two gates:

1. The frontend must prove it can find the marked range for the exact `highlight_id` in the active editor and replace the intended text there.
2. Only after that succeeds should the frontend call the Rust command that records `accepted_at`.

This makes the editor state the source of truth for whether an inline accept is safe to persist. If the highlighted range is not present, the system should fail closed rather than marking the correction accepted optimistically.

## Strategy

The implementation strategy is intentionally narrow:

- Move the editor mutation into a dedicated helper so it can be tested directly against TipTap content with real highlight marks.
- Add a failing component test for the ordering bug: no DB acceptance if the editor-side apply callback reports failure.
- Add a lower-level editor test for duplicate phrases to prove the targeted highlight is mutated, not the first textual duplicate.
- Keep the Rust/database layer unchanged except for validation, because the DB schema and command path were already correct.

The broader principle is that Margin should prefer structural anchors over textual coincidence whenever the product claims it is acting on a specific annotation.

## Key Discoveries

The visible reviewer complaint was about the stale workpad, but the code review turned up a real product bug. The prior commit already added `suggested_edit`, `accepted_at`, the Accept button, and Rust tests. The rework value came from re-checking the behavior rather than assuming the issue was only process hygiene.

The key leverage point was not in Rust. The unsafe behavior lived entirely in the React/Tiptap boundary. That meant the fastest high-confidence fix was frontend-first: reorder the accept flow and target the `highlight` mark by `highlightId`.

The takeover changed the operational theory. The earlier handoff treated GitHub access, commits, and runtime launch as blocked. In this session those paths all work: `git fetch origin` succeeded, `gh pr view 33` succeeded, and `pnpm tauri dev` launched the app. The real risk is no longer environment access. It is workflow drift: the issue is in `Merging`, but the attached PR still points at the pre-rework commit while the safer implementation exists only in the local worktree.

That means the correct next action is not “merge what is already approved.” It is “publish the reviewed fix, rerun the gates on the branch state that will actually merge, then decide whether approval still holds.” The core principle is the same as the product fix itself: fail closed when identity is ambiguous. Just as Accept should not persist against the wrong highlight, the ticket should not merge against the wrong branch content.

## Open Questions

The current helper assumes the highlighted text for a correction can be reconstructed from the text nodes carrying the same `highlightId`. That is correct for the current cases under test, but more complex marked content with nested formatting may deserve an additional regression test if inline Accept expands beyond plain edit/wordiness corrections.

The product still does not have a good UX for Accept on a correction whose source document is not the active editor. The new flow fails closed, which is correct, but it may warrant a follow-up UI treatment that explains why Accept is unavailable or unsuccessful when the relevant highlight is not mounted.

The workflow also still lacks a durable in-repo landing script even though the issue automation references one. If that remains part of the process, it should either live in the repo or the instructions should stop depending on a path that is absent from the checkout.
