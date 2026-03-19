# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Research what Margin can learn from Every's AI-assisted writing workflow and preserve the results in repo-local documentation for `SAM-158`.

### Outcome

A future agent or human can open one research note and quickly understand which parts of Every's workflow are worth adapting for Margin's feedback loop, especially from the exact ticket-linked transcript, which parts are off-thesis, and which ideas deserve separate follow-up tickets.

### Constraints

- Keep the scope to research synthesis, not product implementation.
- Treat inaccessible external sources as explicit blockers rather than guessing what they contained.
- Use the exact ticket-linked Every transcript as the primary source now that it is confirmed public; keep the Readwise gap explicit.

### Steps

1. Reconcile the earlier research against the exact ticket-linked Every transcript and the still-inaccessible Readwise item.
2. Extract the high-signal operational patterns rather than generic AI-writing advice.
3. Map those patterns onto Margin's product thesis and workflow.
4. Land the corrected synthesis in `docs/research/` and refresh `THEORY.MD` / `PLANS.md`.
5. Preserve backlog follow-up issues for any concrete out-of-scope product ideas discovered during the research.

## Decisions

- Use `docs/research/` as the durable home for the writeup, matching prior research tickets.
- Favor specific product implications over broad commentary on AI and writing.
- Explicitly document source-access gaps so later work can revisit them without re-investigating.
- Treat the exact Every transcript as the anchor source and use adjacent Every materials only as supporting context.

## Surprises

- The earlier assumption that the ticket-linked Every transcript was inaccessible was wrong; the page is public and materially sharpens the research.
- The Readwise saved-page URL still appears auth-bound or otherwise opaque from this environment, so it cannot be treated as an accessible citation.
- The earlier `.git` write blocker was environment-specific and does not reproduce in this continuation workspace.

## Verification

- Confirm the research note is grounded in the exact Every transcript plus any supporting public sources and ties each takeaway back to Margin.
- Refresh `THEORY.MD` so the repo's current operating theory matches the corrected research.
- Record the still-open Readwise source gap and the corrected git-state findings explicitly in the Linear workpad.

## Handoff

- The durable deliverable is the research note plus the already-filed backlog tickets created from it.
- The only remaining source blocker is external access to the underlying Readwise article.
