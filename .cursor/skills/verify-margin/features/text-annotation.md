# Text Annotation (Highlights and Margin Notes)

Margin lets readers select text and apply color-coded highlights, then attach margin notes to any
highlight. Highlights and notes persist to SQLite via Tauri commands (or the in-memory browser
stub in dev mode). Text anchoring re-resolves highlight positions using a 4-tier fallback after
document edits. Clicking a mark opens the HighlightThread popover anchored to the mark's bounding
rect.

## Sub-features

- Select text and apply one of five highlight colors (yellow, green, blue, pink, orange)
- Apply the default highlight color (keyboard-accessible quick-highlight)
- Open the margin note thread for a highlight (click the mark)
- Add, edit, delete margin notes in the thread
- Delete a highlight with undo support
- Text anchoring: 4-tier fallback (exact position → text+context → text alone → orphan)
- Export annotations: `Ctrl+Shift+E` opens export popover
- Polarity tagging: each highlight can be marked corrective or positive (see correction-capture.md)

## How to get to it

From a document open in the editor:
1. Click-drag to select text
2. The FloatingToolbar appears above the selection
3. Click a color swatch to highlight, or the note icon to highlight-and-open the thread
4. Click a `<mark>` element in the editor to open the HighlightThread popover

## Driving it with Vitest + RTL

**Preconditions:**
- Import `HighlightThread` from `@/components/editor/HighlightThread`
- HighlightThread renders into a portal on `document.body` — query from `document.body`
- Use `vi.useFakeTimers()` in `beforeEach` to prevent the close-on-click-outside `setTimeout(0)` from bleeding into subsequent test files

- **Action: render HighlightThread with a blue highlight** → `render(<HighlightThread highlight={{ color: "blue", ... }} notes={[]} onAddNote={vi.fn()} ... anchorRect={new DOMRect(100,100,200,20)} isVisible={true} />)` → **Observable result:** `document.body.querySelector(".thread-excerpt")` has `style.borderLeftColor === "var(--color-highlight-blue)"`

- **Action: verify note textarea is present** → after render → **Observable result:** `document.body.querySelector(".thread-textarea")` is truthy

- **Action: type a note and reveal Save button** → `fireEvent.change(textarea, { target: { value: "test note" } })` → **Observable result:** `document.body.querySelector(".note-action-btn--primary")` appears with text `"Save"`

- **Action: verify thread header label** → after render → **Observable result:** `document.body.querySelector(".thread-header-label")?.textContent === "Notes"`

- **Action: render FloatingToolbar with a text selection** → provide a mock Editor with `selection.empty = false`, `selection.from = 0`, `selection.to = 10` and `isFocused = true`, register `selectionUpdate` listener → trigger `selectionUpdate` event → **Observable result:** element with `role="toolbar"` and `aria-label="Formatting and feedback"` becomes visible in the DOM

- **Action: verify highlight color buttons** → after toolbar visible → **Observable result:** `getByRole("button", { name: "Highlight yellow" })` present; similarly for green, blue, pink, orange

- **Action: verify note button** → after toolbar visible → **Observable result:** `getByRole("button", { name: "Add note" })` present

**Run the annotation tests:**
```bash
cd /workspace && pnpm test:frontend -- --reporter=verbose \
  src/components/editor/__tests__/HighlightThread.test.tsx \
  src/components/editor/__tests__/FloatingToolbar.test.tsx \
  src/hooks/__tests__/useAnnotations.test.ts
```

**Expected output:**
```
✓ applies highlight color to excerpt border
✓ uses yellow color for yellow highlights
✓ thread header label has thread-header-label class for 11px/0.08em styling
✓ save button has note-action-btn--primary class
```

## Gotchas

- HighlightThread renders into a **portal** (`document.body`), not inside the `container` returned by `render()`. Always query `document.body.querySelector(...)`.
- The close-on-click-outside handler in HighlightThread uses `setTimeout(..., 0)`. With Vitest's `vmThreads` + `fileParallelism: false`, this timer bleeds into the next test file's first `act()`. Always call `vi.useFakeTimers()` in `beforeEach` in any test that renders HighlightThread.
- The FloatingToolbar has a debounced position update. It does not appear immediately — trigger the `selectionUpdate` editor event and then use `waitFor` to find the toolbar.
- The `highlight.data-color` attribute on `<mark>` elements is the CSS color hook. The `data-highlight-id` attribute is the DB record ID. Both are set by the TipTap highlight extension at `src/components/editor/extensions/highlight.ts`.
- In browser stub mode: `createHighlight` writes to the in-memory `highlights` array (not SQLite). The stub resets between hard reloads but NOT between test runs that use the stub via `invoke()` mock — the module-level arrays persist in `vmThreads` mode.
- The text anchoring library (`src/lib/text-anchoring.ts`) is a data-layer invariant. Changes to it require the `data-layer` verify mode: `scripts/verify data-layer`.
