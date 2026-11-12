# Highlight only

Highlight on the selection toolbar marks text without opening the note card, and the toolbar changes inside an existing highlight.

## Sub-features

- Highlight saves a highlight; the note card stays closed.
- Re-selecting inside that highlight shows Note and Remove highlight instead of Highlight.

## How to get to it (user POV)

Drag across a phrase and click Highlight. Then select the same words again.

## Driving it with drive.mjs

`node .claude/skills/verify-margin/scripts/drive.mjs highlight-only --theme both`

Drags across "fast-paced landscape", clicks Highlight, waits for the mark, fails if the `Highlight notes` dialog opened, collapses the selection, drags again and waits for "Remove highlight". Proof: `create_highlight` with the phrase, plus the `highlighted` and `inside-highlight` screenshots.

## Gotchas

- A drag that starts inside a live selection moves the text (ProseMirror drag and drop), so the journey collapses the selection first. Readers hit this too.
