# Highlight, recolor, margin note

The core reading action: mark a passage, pick a color, write what should change.

## Sub-features

- Note on the selection toolbar highlights and opens the note card.
- Recolor from the swatch radio group (`Highlight color`).
- Margin note typed in the thread and saved with Cmd+Enter (Ctrl+Enter off macOS).

## How to get to it (user POV)

Drag across any phrase in an open document and choose Note on the toolbar. The thread opens beside it. Click a swatch, type in "What should change here?", press Cmd+Enter.

## Driving it with drive.mjs

`node .claude/skills/verify-margin/scripts/drive.mjs highlight-and-note`

Drags across "real-time insight", clicks Note on the `Selection` toolbar, picks the `Highlight green` radio, fills the note, saves. Proof: `create_highlight`, `update_highlight` with `green`, `create_margin_note` with the note text, plus the `noted` screenshot showing the saved note above the input.

## Gotchas

- Stub data is in memory and resets on reload, so persistence across restarts is a lane 3 or lane 4 check.
