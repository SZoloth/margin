# Design rules

Shared craft rules for Sam's UI repos, confirmed by Sam on 2026-11-12. Read them before UI or motion work. Where they disagree with this repo's own specs, the repo wins: `docs/motion-spec.md` for motion, and the tokens in `src/styles/globals.css` for colour, type and radius.

## How to work

1. Read the design system and the existing screens before designing new ones. Design inside the system; don't invent a new one.
2. Use real component and motion names (combobox, popover, sheet, scrub, stagger, spring) in plans and code. Sam often describes things loosely ("the little menu"). Translate his words into the real name and say it back once ("that's a popover") so the shared vocabulary grows.
3. When the direction is open (a new screen, a new look, a problem with no clear answer), make three or more options and say which variables they differ on. When you're matching a pattern the repo already has, build one.
4. Review with a separate critic pass that compares the work against references or Gestalt principles. Don't grade your own build in the same pass.
5. Break it on purpose: worst realistic data (long titles, empty documents, hundreds of highlights), every state rendered, and a written walkthrough of the whole UX to catch inconsistencies.
6. Test at narrow and wide window sizes and with slow I/O. Fix stuck hovers and accidental text selection.
7. Study reference motion frame by frame (ffmpeg frames or a written description) before rebuilding it.
8. Turn a reference image into a written style spec (colour, type, spacing, composition) and build from the spec.

## What it should look like

9. No taglines, helper text or eyebrow labels. If a screen needs a label to make sense, fix the layout.
10. No slop tells: emoji as icons, italic accent words, trendy serif with tight negative tracking, or tag pills everywhere.
11. Tint neutrals with the palette's hue. No pure white or pure black.
12. Size skeletons and placeholders from the measured loaded UI so nothing jumps.
13. Hover on the parent, animate the child. Prefer proximity-based effects to on/off hover.
14. Respect the numbers: 100 ms / 300 ms / 1 s response thresholds, 44 pt minimum hit targets, 4.5:1 text contrast, and 45 to 90 characters per line of body text.
15. Give uppercase and small text extra letter-spacing, and tighten large display type.

## Constraints

This repo's constraints live in code, not here: `src/styles/globals.css` (palette, fonts, radii) and `docs/motion-spec.md` (motion budget). If a change needs a value that isn't there, ask Sam before adding one.
