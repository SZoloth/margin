# Craft & motion inspiration → Margin backlog

Mining pass (2026-09-13): three sources — Sam's mymind saves, the tufte-viz
skill references, and the design-motion-principles skill (Emil Kowalski /
Rauno Freiberg canon) — filtered for what applies to Margin's actual
surfaces: the reader, the highlight thread, the margin rail, and rule
resurfacing underlines.

## What Sam already saved (mymind)

The signal-rich saves for this product:

- **Devouring Details** (devouringdetails.com — Rauno Freiberg, tagged
  inspo ×2). An interactive manual of interaction craft. Relevant
  prototypes: *Line Minimap* (a sparse document minimap as navigation),
  *Scroll Strip*, *Morph Surface*, *Blur Reveal*. Relevant principles:
  inferring intent, ergonomic/contained gestures, motion choreography.
- **Hold My Notes** (holdmynotes.app — sticky notes docked to the screen
  edge). The closest structural analog to Margin's rail: a deck that rests
  as a thin stripe, fans out on approach (notes shingle down 45 ms apart),
  and opens in place. Autosaves 250 ms after typing stops. ⇧⌘⌫ deletes with
  a ten-second undo. ⌘. cycles a note's colour in place. Archive, not
  delete.
- **Butterick's Practical Typography** (practicaltypography.com) — the
  reader-typography authority.
- **Dia** (in-line writing assistant), **@@ for Mac** (AI agent in any text
  field), **Patina**, **Nodes** (markdown notes for macOS), **Copper** —
  adjacent-product references for AI-in-the-reading-surface.
- **"The Correct Aesthetic of Software"** (X thread), **Personal Software
  Wooden Bookshelf** (mymind's own post) — ambient aesthetic direction:
  software as a shelf of objects, not a dashboard.

## Kowalski motion principles — what binds Margin

From `design-motion-principles/references/emil-kowalski.md`:

1. **The frequency rule is the load-bearing one.** Animation budget scales
   inversely with interaction frequency: rare → delight welcome; daily →
   subtle and fast; hundreds/day → none; keyboard-initiated → never.
   Highlighting and thread-opening are the product's *core loop* — hundreds
   per session. They get the smallest budget, not the biggest.
2. **<300 ms, prefer ~150–180 ms.** Speed is perceived performance.
3. **Never `scale(0)`** — entrances start at ≥0.9.
4. **Custom easing is the difference** — `ease`/`ease-in-out` read cheap;
   ship real Bézier curves. `--ease-entrance` already exists in tokens.
5. **Origin-aware** — popovers grow from their logical source (the
   hairline/anchor edge), not centre.
6. **Blur bridges state swaps** — `filter: blur(2px)` masks the
   composer→saved-note transition.

## Tufte — what binds Margin

1. **Data-ink ratio / the eraser test** — the thread popover already went
   through this (excerpt, radios, polarity, formatting all erased). Same
   test applies to every future element: if erasing it loses no
   information, erase it.
2. **Micro/macro readability** — annotations should read at two levels:
   macro (the rail — where in the document is judgment concentrated) and
   micro (the note itself). Today's dots carry only *presence*, not
   *content* or *position*.
3. **Small multiples** — the corrections/rules review queue should be
   repeated identical cards; same structure, varying data.
4. **Chartjunk audit on resurfacing underlines** — the dotted underline
   earns its ink (it carries "a rule fires here"); a heavier treatment
   (icon, glow, badge) would not.

## Concrete backlog items

### P0 — small, aligned, mostly built-on shipped machinery

1. **Origin-aware thread entrance.** Popover mounts instantly today. Give
   it ~150 ms `scale(0.96→1) + fade`, `transform-origin` at the hairline
   junction (top edge nearest the anchor). Skip the animation entirely
   when the open was keyboard-initiated (⌘⇧H) — frequency rule.
   `useAnimatedPresence` and the `fresh`-attr precedent exist.
2. **Undo on destructive gestures.** The delete path already snapshots
   notes into a toast (55b10cb); add an Undo action with a ~10 s window —
   Hold My Notes' exact pattern. Covers mark delete and ⇧⌘H bulk-remove.
3. **In-place colour cycling.** ⌘. (or repeat-press) cycles the
   highlight's colour without opening the swatch row; swatches remain for
   explicit choice. Hold My Notes uses exactly this.
4. **Butterick audit → ReaderControls preset.** Run the reader against the
   Practical Typography checklist (measure 45–90 chars, leading
   120–145 %, paragraph spacing vs. first-line indents, hyphenation off in
   annotated text, real small caps). Ship the fixes as defaults and expose
   a named preset in the Aa popover.

### P1 — real features, medium effort

5. **Margin rail as sparse minimap.** Today's dots float beside marks in
   view. Rauno's Line Minimap pattern: the rail becomes a fixed-position
   strip showing a tick per annotation at its document-relative position,
   so the whole document's annotation density is visible at a glance and
   ticks are jump targets. Macro level of the micro/macro pair.
6. **Inline marginalia.** A collapsed annotation shows the first ~3 words
   of its note as a faint label in the margin next to the dot — the margin
   carries meaning, not just presence. Hover/click opens the full thread.
   This is the feature that makes Margin *look like* a margin.
7. **Fan-in on document open.** Rail indicators stagger in ~30–45 ms apart
   (Hold My Notes deck fan) — a rare, once-per-document gesture, so the
   frequency rule permits the delight.
8. **Blur-bridge the save transition.** Composer → saved-note swaps with a
   ~120 ms blur+fade instead of an instant DOM swap.

### P2 — speculative, needs prototyping or a decision

9. **Archive-not-delete for rules/corrections.** Soft-delete with restore,
   matching Hold My Notes. Supports the north star (a correction "never
   needs to be given again" ⇒ deleting one shouldn't be able to lose it
   permanently). Data-model change; review-gate interaction needs thought.
10. **Codify a motion spec.** One table in docs mapping interaction
    frequency → budget (frequent: instant/≤150 ms; occasional: ≤250 ms;
    rare: ≤400 ms delight allowed; keyboard: none). Enforced by the
    existing `--duration-*` tokens. Prevents the slow accretion of
    animation everywhere.
11. **Library as shelf.** Docs as objects on a shelf (the Wooden
    Bookshelf save) rather than a flat list. Genuinely uncertain — flag as
    prototype-before-commit.

## What this argues *against*

- **No animation on the highlight mark itself beyond the shipped
  one-shot.** Highlighting will be the highest-frequency gesture in the
  product; the `fresh`-attr entrance is already at the budget ceiling.
- **No badges/icons on resurfacing underlines.** The dotted line is the
  correct terminal state per data-ink.
- **No per-note chrome.** Every element that survived the thread redesign
  passed the eraser test; additions should have to argue their way in.

## Sources

- mymind library via `~/mymind-cli` (queries: annotation, reader, margin,
  writing, editor, typography, interface, UI, notes, macOS, motion)
- `~/.agents/skills/design-motion-principles/references/emil-kowalski.md`
- `~/.claude/skills/tufte-viz/references/tufte-principles.md`
- devouringdetails.com, holdmynotes.app (fetched 2026-09-13)
