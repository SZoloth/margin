# Motion spec

Codified from the craft-inspiration research (`research/craft-inspiration-2026-09-13.md`)
and the shipped implementations. The governing rule is Kowalski's frequency
law: **the more often a gesture happens, the smaller its animation budget.**

## Budget table

| Gesture frequency | Examples | Budget | Tokens |
|---|---|---|---|
| Constant (per keystroke, per scroll frame, per render) | caret, scroll tracking, live hover | none | — |
| Frequent (many times per session) | note save blur-bridge, dot hover, recolor | ≤ 150 ms | `--duration-fast`, `--ease-micro` |
| Occasional (a few per session) | thread open/close, rule card open/close, peek | ≤ 250 ms | `--duration-normal`, `--ease-entrance` |
| Rare (once per doc/session) | fan-in on doc open, highlight entrance | ≤ 400 ms | `--ease-entrance` |

## Rules

1. **Keyboard-initiated actions never animate.** If the user triggered it
   with a key, the result should already be there.
2. **Marginalia moves like paper, not UI.** Entrances are blur/fade/small
   translate — never bounce, never overshoot on surfaces that carry text.
3. **Mount animations are for new documents, not re-renders.** Elements
   that remount per document (margin dots, minimap ticks) get their
   entrance "for free" — an animation on the class plays exactly once on
   doc open. Never attach a mount animation to a node that remounts on
   ordinary transactions (it would flash while typing).
4. **One-shot entrance beats persistent state change.** A highlight gets a
   brief luminance swell at creation (`fresh` attr, cleared by a follow-up
   transaction) — then it is ambient. Recurring pulses on annotated text
   violate data-ink.
5. **Exits are cheap.** ~140 ms fade/shrink toward the anchor. A closing
   surface should leave attention where the reader's eye already was.
6. **`prefers-reduced-motion` stills all of it.** The media query lives in
   `annotations.css`; every animation added must be inside its scope.

## Reference implementations

- Thread open/close + rule card open/close: `thread-popover` /
  `rule-violation-popover` (entrance from hairline origin, 140 ms exit).
- Save blur-bridge: `.thread-message--fresh` (140 ms blur+fade).
- Doc-open fan-in: `.margin-indicator`, `.minimap-tick` mount animations.
- Highlight creation swell: `mark[data-fresh]` in `annotations.css`.
