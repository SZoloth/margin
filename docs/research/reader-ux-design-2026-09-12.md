# Reader UX design backlog: functional → elite

Research pass (2026-09-12): annotation/reading literature + benchmark apps
(iA Writer, Readwise Reader, Matter, Kindle, Obsidian, hypothes.is) mapped to
Margin's actual surfaces. See SAM-1142 for the issue tracker view.

## Verified in code (implemented vs. decorative)

**Real:** reader dials are wired via `useSettings.ts:84-95` →
`ReadingSection.tsx`, but only inside Settings — leaving the document to tune
the reading surface. FloatingToolbar has edge-flip + selection-preserving
mousedown. HighlightThread has a real focus trap + focus restore + Esc.
Margin dots are document-anchored. Dark theme is genuinely designed
(warm #1e1c18 page, ~12:1 text contrast).

**Decorative/broken:**
- `useDesignDials.ts` is never imported — and would BREAK dark mode if wired
  (writes light-theme highlight hexes as inline styles that beat the
  `[data-theme="dark"]` overrides). Delete or repurpose.
- `ExportAnnotationsPopover` auto-exports on open with the previous
  writingType; the "Tagged as" selector mutates state that's never persisted.
- CommandPalette: ~15 hardcoded light hexes, zero dark coverage.
- No keyboard path to create a highlight (⌘O/⌘W/⌘⇧E/⌘⇧M/⌘F/⌘K/⌘S/[/] exist;
  highlighting is mouse-only).
- Shift+click deletes a highlight — undiscoverable destructive gesture.
- Three inconsistent scroll policies: FloatingToolbar floats on scroll,
  HighlightThread anchors to a stale rect, DiffControls dismisses.
- `MarginIndicators` re-runs getBoundingClientRect per mark per scroll frame
  (layout thrash) with no ResizeObserver.
- `CommandPalette.tsx:520` injects FTS `snippet` via dangerouslySetInnerHTML
  while `Sidebar.tsx:10-21` sanitizes the same data — exploitable via crafted
  markdown. Security-adjacent; fix soon.
- Fonts from Google CDN — local-first app typesetting its core surface over
  the network.
- ChromeBar reveal uses max-height as a flex child — every chrome reveal
  reflows the text (Kindle/iA overlay chrome instead).
- `--color-text-tertiary` is borderline AA at normal size (4.55:1 light,
  4.6:1 dark) but is used at --text-xs (10px) where smoothing eats it.
- `aria-modal="true"` on non-modal HighlightThread; intent radiogroup lacks
  arrow-key semantics; unsaved-changes dialog has no trap/autofocus/Esc.

## Design principles to commit to

1. **Annotation is judgment, not bookmarking.** Highlighting aids memory
   (d≈0.36) not comprehension (d≈0.20) — Ponce et al. 2021; bare highlighting
   is low-utility per Dunlosky 2013. Joshi & Vogel CHI'24 (n=127): a 150-word
   highlight budget beat unlimited by +11% on delayed comprehension.
   Implication: price note-carrying highlights as the canonical gesture.
2. **Retrieval beats re-exposure.** Distributed practice + practice testing
   are the two high-utility techniques. Readwise's product IS this (decaying
   review cadence, cloze mastery). Margin has zero resurfacing — the missing
   half of the thesis.
3. **Position is memory.** Page-location recall exists (Rothkopf 1971) and is
   worse on screens (2025 print-vs-screen study). The margin rail should be a
   stable spatial index, not popover triggers.
4. **Chrome disappears; the text doesn't move.** Overlay chrome, never
   reflow. iA focus mode dims non-active paragraphs.
5. **Motion <300ms, exits faster than entrances, transform/opacity only.**
   Tokens already encode this; the gap is application.
6. **Dark mode is a separate design.** +0.01–0.02em tracking on dark body
   text; re-weight borders/shadows (halation).

## Ranked backlog

### P0 — felt in the first 5 minutes

1. **Highlight chord** — ⇧⌘H applies default highlight to selection; chord in
   toolbar title/aria-label, palette actions, native menu. Peers all have
   one-keystroke capture (iA ⇧⌘U, Readwise h, Kindle).
2. **In-reader "Aa" control** — popover in ChromeBar/margin reusing
   `useSettings.setSetting` (font, size, spacing, width, theme). Settings →
   Reading stays the full version.
3. **CommandPalette dark mode** — swap hardcoded hexes for semantic vars.
4. **Anchor popovers to content** — scroll + ResizeObserver repositioning (or
   Floating UI autoUpdate); standardize on track-the-anchor across toolbar,
   thread, diff controls.
5. **Bundle fonts** — @fontsource-variable/newsreader, @fontsource/
   instrument-sans, @fontsource/jetbrains-mono; delete CDN links.
6. **Tertiary text contrast** — lighten/darken to ~5:1, or route --text-xs
   usage to text-secondary.
7. **Gate toolbar on selection-settle** — show on pointerup, not live
   selectionUpdate during drag (tracking a growing selection "feels wrong").
8. **Sanitize palette snippets** — apply Sidebar's sanitizeSnippet (or shared
   helper) before dangerouslySetInnerHTML in CommandPalette.

### P1 — what makes it feel considered

9. **Chrome overlay, not reflow** — absolute overlay over the scroll area
   instead of max-height flex child.
10. **Margin rail → spatial index** — drop per-frame scroll listener, add
    ResizeObserver; hover dot → excerpt card aligned to line; collision-stack
    adjacent dots; hide rail under ~40px gutter.
11. **Honest dialog semantics** — thread: drop aria-modal or go modal;
    unsaved dialog: aria-modal + autofocus + Esc; FindBar/palette restore
    focus on close.
12. **Radiogroup arrow keys** — roving tabindex in HighlightThread intent
    picker.
13. **Fix dead "Tagged as"** — pick type before export, or persist re-tag.
14. **Discoverable delete** — hover hint on marks ("Click for notes ·
    ⇧Click to remove"); surface shortcut in thread Remove button title.
15. **Dark-mode body tracking** — letter-spacing 0.012em on reader content in
    dark theme.

### P2 — delight / the learning-science gap

16. **Annotation review surface** — per-doc index of highlights+notes ordered
    by position (Sidebar has zero annotation presence today); cross-doc
    decay-based resurfacing (soon/later/someday). Margin-specific version:
    resurface corrective notes when a new doc contains the flagged pattern —
    "corrections propagating" made visible.
17. **Focus mode for annotation** — dim non-anchored content (~45% opacity)
    while a thread is open.
18. **Highlight-density signal** — ambient per-section mark count in rail/TOC
    (selectivity pressure without a hard cap).
19. **Highlight entrance animation** — ~200ms fade-in so a created mark
    visibly lands (perceptual confirmation of the DB write).
20. **Delete useDesignDials** — landmine; superseded by the P0 reader control.

## Signature interactions (what would make it elite)

1. **One-chord judgment** — ⇧⌘H paints without opening anything; N/⌘' opens
   the note thread with caret in textarea. Selection → judgment <500ms,
   keyboard-only.
2. **The margin that remembers** — one dot per annotated line in document
   position; hover → 2-line excerpt card; ⌘-click cycles collisions.
3. **Annotations that come back** — ⌘⇧R review: decay-resurfaced notes with
   "applied to rules" status; corrective notes resurface when the same
   pattern appears in a new doc.
4. **Origin-true popover physics** — thread opens from the highlight's edge,
   tracks anchor through scroll/reflow, flips to left gutter when right is
   narrow.
5. **Reading dimmer** — thread open = rest of document steps back.

## Honest flags (thin evidence)

- Popover above-vs-below is convention, not science; current flip at `top<8`
  is unusually tight (~48–60px is typical).
- Constrained-highlighting result is one CHI'24 study on short stories —
  use a density signal, not a hard cap.
- Margin-rail spatial persistence is extrapolated from page-location memory.
- Dark-mode tracking is practitioner consensus, not peer-reviewed.

## Parent-agent TODOs

- `pnpm add @fontsource-variable/newsreader @fontsource/instrument-sans
  @fontsource/jetbrains-mono` needed for item 5.
- The sanitizeSnippet inconsistency deserves its own commit.
- High-collision: App.tsx, index.html — stage hunks carefully.
- Findings are from code, not observed runtime — verify popover behavior in
  `pnpm tauri dev`.
