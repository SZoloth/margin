# Learn mode

Type a passage over a dimmed copy of it. Matched letters brighten, a miss is an underline and does not stop you, and Escape puts the reader back at the same spot. Progress (caret, mask, characters typed, accuracy, time) stays in local storage.

## Sub-features

- Cmd+Shift+L, the Learn button in the chrome, and "Learn this text" in the command palette open the whole document. A text selection opens just that selection.
- A highlight's note card has Learn, and types the highlighted words.
- A leading heading becomes the running title instead of text you retype.
- Straight quotes, apostrophes, hyphens, and dots stand in for curly quotes, em dashes, and ellipses. That matching is covered by `src/lib/__tests__/learn-mode.test.ts`.
- Nothing is sent over the network. The journey's only backend call is the highlight created on the way into the note card.

## How to get to it (user POV)

Open a document and press Cmd+Shift+L. Or select a sentence and choose Learn. Escape returns to the reader.

## Driving it with drive.mjs

`node .claude/skills/verify-margin/scripts/drive.mjs learn-mode --theme both`

Replaces the sample with two paragraphs of Walden under a Walden heading, types into the dimmed copy including one wrong letter, checks that the mistake is saved and restored, returns to the reader at that spot, then enters again from a selection, from a highlight, and from the command palette.

## Gotchas

- The words are Thoreau's, public domain. The journey types them into the sample document, whose stored title stays "Welcome to Margin"; the heading supplies the "Walden" header.
- Progress is `localStorage["margin-learn-progress"]`, keyed by the open document's id (a UUID in the stub, not the constant `sample-doc`) and then by passage. The whole-document row is `document`. There is no Tauri command to expect for the typing itself. The mask is written on a short debounce, and a StrictMode remount can write an empty row first.
