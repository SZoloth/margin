# Markdown Reading and Editing

Margin renders Markdown files as a focused reading and editing surface using TipTap. Documents
open from the local filesystem or from the keep-local API. The editor serializes back to Markdown
without losing supported structure. File watching reloads the document when it changes externally,
and the diff review surface presents changes without discarding the user's cursor.

## Sub-features

- Open a Markdown file (file dialog, recent documents, drag-and-drop)
- Render Markdown to TipTap HTML (headings, paragraphs, blockquotes, lists, code, bold, italic, strike, links, tables, task lists)
- Edit prose inline (TipTap contenteditable)
- Serialize editor content back to Markdown on save (`Ctrl+S`)
- Round-trip verification: supported Markdown structures survive edit → serialize → re-open
- External file change detection (file watcher) with diff review
- Sample document shown on first run (onboarding)
- Table of contents for headings
- Find in document (`Ctrl+F`)

## How to get to it

From a blank app state:
1. The app loads with sample Markdown content (onboarding path: "Welcome to Margin")
2. Open a real file: `Ctrl+O` (or sidebar search input) → select a `.md` file
3. The document renders in the TipTap editor at center stage
4. Click anywhere in the text to position cursor; type to edit

## Driving it with Vitest + RTL

**Preconditions:**
- No mocks needed for the editor itself; `Reader.tsx` takes a `content` prop
- TipTap renders asynchronously — always `await waitFor(() => container.querySelector("[contenteditable]"))`

- **Action: render the Reader with Markdown content** → `render(<Reader content="# Hello\n\nParagraph" onUpdate={vi.fn()} isLoading={false} />)` → **Observable result:** `container.querySelector("[contenteditable]")` is truthy after `waitFor`
- **Action: verify contenteditable attributes** → check `autocorrect="off"`, `autocapitalize="off"`, `spellcheck="false"` → **Observable result:** all three attributes present on the `[contenteditable]` element
- **Action: verify editor is not read-only** → `editable.getAttribute("contenteditable")` → **Observable result:** `"true"` (not `"false"` or `"plaintext-only"`)
- **Action: typing updates the onUpdate callback** → `editor.commands.insertContent("world")` via `onEditorReady` callback → await `waitFor(() => expect(onUpdate).toHaveBeenCalled())` → **Observable result:** `onUpdate` called with updated Markdown string
- **Action: external content set does not call onUpdate** → `rerender(<Reader content={newContent} ... />)` after editor diverges from prop → **Observable result:** `setContent` not called when content matches what editor produced (cursor stability test)

**Run the Reader tests:**
```bash
cd /workspace && pnpm test:frontend -- --reporter=verbose \
  src/components/editor/__tests__/Reader.test.tsx \
  src/components/editor/__tests__/front-matter.test.tsx
```

**Expected output:**
```
✓ renders a contenteditable element with autocorrect, autocapitalize, and spellcheck disabled
✓ does not call setContent when content prop changes from editor typing
✓ front-matter: strips YAML front matter before rendering
```

## Gotchas

- TipTap renders asynchronously into a Shadow DOM equivalent via its React wrapper. Always use `waitFor` before querying `[contenteditable]` — it is not immediately present after `render()`.
- `fireEvent.change` on the contenteditable does NOT work for typing. Use `editor.commands.insertContent(text)` obtained from the `onEditorReady` callback.
- The `Reader` component uses `useDebounce` (~250ms) before calling `onUpdate`. `waitFor` needs a 3s timeout in CI to catch the debounced emission.
- Front-matter YAML (`---` blocks) is stripped before rendering. Test `front-matter.test.tsx` verifies this explicitly. The `MarkdownFrontMatter` Vite plugin processes it at load time for `.md` files but TipTap handles it at runtime via `tiptap-markdown`.
- In browser stub mode (`pnpm dev`), all Tauri commands return in-memory data from `src/lib/browser-stubs/core.ts`. File open dialogs return `null` (no actual file picker). The sample document is hardcoded in `src/lib/sample-document.ts`.
- The diff review surface (`DiffBanner`, `DiffControls`, `DiffNavChip`) activates when a file changes externally while open. It uses a `useDiffReview` hook that computes a diff and stages changes. It cannot be driven in the browser stub mode because it depends on the Tauri file watcher.
