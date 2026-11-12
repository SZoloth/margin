# Never write this

The first-run loop. A reader selects a phrase in the sample AI draft and turns it into a Hard rule, which Margin then underlines everywhere.

## Sub-features

- Selecting text shows the selection toolbar and saves nothing (ADR-008).
- "Never write this" on the toolbar makes a Hard rule from the selection and keeps its highlight as evidence.
- On first run a toast offers to turn on the Writing guard, echoing the phrase; later a toast says "Hard rule: never write “<phrase>”…".

## How to get to it (user POV)

Launch the app fresh. The sample draft "A draft from an AI assistant" is open. Drag across a phrase, then choose "Never write this" on the toolbar above it.

## Driving it with drive.mjs

`node .claude/skills/verify-margin/scripts/drive.mjs never-write-this --theme both`

Drags across "a quick call", waits for the `Selection` toolbar, checks that no `create_highlight` was sent yet, clicks "Never write this", then waits for the phrase in curly quotes (guard offer or toast). Proof: backend calls `create_highlight` and `create_never_write_rule` (args contain the phrase), plus the `selected` and `rule-made` screenshots.

## Gotchas

- The design-playground version picker floats over the guard toast. The script removes it before driving.
