# Select and copy

Selecting text only selects (ADR-008), so a reader can copy without leaving a highlight behind.

## Sub-features

- The `Selection` toolbar appears when a drag ends.
- Copy puts the text on the clipboard, reads "Copied", and the toolbar closes.
- Nothing is saved: no `create_highlight`, no marks on the page.
- Selection and caret use the ink-violet tint (`--color-selection`, `--color-caret`), which no highlight color shares.

## How to get to it (user POV)

Drag across any phrase, then click Copy on the toolbar (or press Cmd+C).

## Driving it with drive.mjs

`node .claude/skills/verify-margin/scripts/drive.mjs select-and-copy --theme both`

Drags across "delve into", clicks Copy, waits for "Copied", reads the clipboard where Chromium allows it, waits for the toolbar to close, then fails if any `create_highlight` was sent or any highlight mark exists. Screenshots: `selected` (shows the tint) and `copied`.

## Gotchas

- Chromium may refuse clipboard reads; the journey then skips the clipboard check and relies on the "Copied" state. The real app uses `document.execCommand("copy")`, which is a lane 4 check in WebKit.
