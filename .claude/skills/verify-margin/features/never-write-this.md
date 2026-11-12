# Never write this

The first-run loop. A reader selects a phrase in the sample AI draft and turns it into a Hard rule, which Margin then underlines everywhere.

## Sub-features

- Selecting text opens the highlight thread (on `main`, selecting also creates a yellow highlight).
- "Never write this" makes a Hard rule from the selection.
- The thread confirms with "Hard rule: never write “<phrase>”…", and a toast offers to turn on the Writing guard.

## How to get to it (user POV)

Launch the app fresh. The sample draft "A draft from an AI assistant" is open. Drag across a phrase, then choose "Never write this" in the thread that opens.

## Driving it with drive.mjs

`node .claude/skills/verify-margin/scripts/drive.mjs never-write-this --theme both`

Drags across "a quick call", waits for the `Highlight notes` dialog, clicks the "Never write this" button, then waits for the confirmation text. Proof: backend calls `create_highlight` and `create_never_write_rule` (args contain the phrase), plus the `rule-made` screenshot.

## Gotchas

- The selection toolbar redesign (PR #1) changes this flow: selecting no longer highlights, and the button moves to a pill. Update this journey in that PR.
- The design-playground version picker floats over the guard toast. The script removes it before driving.
