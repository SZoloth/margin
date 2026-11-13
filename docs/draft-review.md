# Draft review: getting Claude's drafts into Margin

Status: step 1 of a two-week experiment (12 Nov 2026).

## The problem

Margin learns from corrections, and the corrections stopped on 22 March 2026. The drafts Sam fixes most are probably job-search outreach and cover letters (cover letters have the largest rules file). Claude writes those in a chat, Sam edits them in Gmail, and Margin never sees them. Margin can't learn from an edit it never sees.

## What this adds

A way for Claude to hand a draft to Margin and get the edited version back, plus one number per draft.

1. Claude finishes a draft and calls `margin_review_draft` with the text, a writing type and a short title.
2. Margin's MCP server writes the draft to `~/.margin/drafts/<id>.md`, keeps an untouched copy of Claude's version, and opens the draft in the Margin app.
3. Sam edits it in Margin and saves with ⌘S. Highlights and notes work as they do on any document.
4. Sam tells Claude he's done. Claude calls `margin_get_draft_review`, which returns the final text (for Sam to paste into Gmail), the share of the final text that is still Claude's, and each change as a before/after pair.
5. `margin_draft_review_stats` reports, for each writing type, how many drafts were reviewed and how much of each was still Claude's, earliest half against latest half.

The app needs no change for step 1. It already opens Markdown files handed to it by macOS and saves edits back to the file.

## The number

**Still Claude's** is the share of the final text's words that came unchanged, in order, from Claude's draft (the longest common subsequence over word tokens, with Markdown punctuation and case ignored). 100% means Sam sent it untouched. A second number, **kept of the draft**, is the share of Claude's words that survived, which catches cuts that the first number misses.

If Margin's rules work, *still Claude's* rises over time within a writing type. It only compares drafts of the same type, and it says little before about ten drafts of a type. It also rises if Sam just gets lazier, so read it alongside the before/after pairs.

## Data shape

Files, not a new SQLite table, because this is a two-week experiment and the schema belongs to the Rust migrations. If the experiment earns its keep, the pairs move into `corrections` as `suggested_edit` rows and the manifests become a table.

```
~/.margin/drafts/
  <id>.md                 the draft Sam edits (opened in Margin)
  .claude/<id>.md         Claude's untouched draft
  .claude/<id>.json       manifest
```

Manifest:

```json
{
  "id": "2026-11-12-acme-intro-3f9a",
  "title": "Acme intro",
  "writing_type": "outreach",
  "created_at": 1763000000000,
  "review": {
    "checked_at": 1763003600000,
    "words_draft": 182,
    "words_final": 141,
    "still_claude": 0.71,
    "kept_of_draft": 0.55,
    "changes": [{ "before": "…", "after": "…" }]
  }
}
```

`review` is null until the first `margin_get_draft_review` call, and each call recomputes it from the files, so calling it again is safe.

## Decision after two weeks

- Sam reviewed most of his outreach drafts in Margin: build the dimmed-text editor (Claude's words shown faded until Sam rewrites them) and rebuild the profile around these before/after pairs.
- He didn't: Margin is a portfolio piece. Polish the demo and write the case study.

## Not in step 1

- No in-app display of the number.
- The pairs don't feed rule synthesis yet.
- No `margin` CLI command; the MCP tools only.
- Only macOS opens the draft automatically; elsewhere the tool returns the path.
