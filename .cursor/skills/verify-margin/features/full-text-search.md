# Full-Text Search

Margin's search uses SQLite FTS5 (full-text search) to query across all indexed documents. The
search bar is in the sidebar. Results show document-level matches (with highlighted snippets) and
file-on-disk matches. Selecting a result opens the document.

## Sub-features

- Search input in the sidebar (`role="combobox"` + `aria-label="Open file"`)
- FTS5 full-text search over all indexed documents
- Disk file search (scans filesystem for `.md` files matching the query)
- Results dropdown: document hits with snippets, file hits
- Keyboard navigation through results (arrow keys, Enter to open)
- Index a document: called when a document opens (`indexDocument`)
- Remove from index: called when a document closes or is deleted (`removeDocumentIndex`)

## How to get to it

1. The sidebar is always visible on the left side of the app
2. The search input is at the top of the sidebar, labeled `role="combobox"` with `aria-label="Open file"`
3. Type any text to search; after a short debounce, results appear in a `role="listbox"` dropdown
4. Each result has `role="option"` — click or press Enter to open
5. Press Escape to dismiss the dropdown

## Driving it with Vitest + RTL

**Preconditions:**
- `useSearch` hook uses `invoke("search_documents", ...)` and `invoke("search_files_on_disk", ...)`
- In tests, mock `@tauri-apps/api/core` to control what `invoke` returns

- **Action: render search bar and type query** → render a component that uses `useSearch`; find `getByRole("combobox", { name: "Open file" })`; `fireEvent.change(input, { target: { value: "hello" } })` → **Observable result:** `invoke("search_documents", { query: "hello" })` called

- **Action: results appear in dropdown** → mock `invoke("search_documents")` to return `[{ documentId: "1", title: "Test", snippet: "...hello...", score: 1.0 }]` → after debounce → **Observable result:** `getByRole("listbox", { name: "Search results" })` is visible; `getAllByRole("option")` returns result items

- **Action: select a result** → `fireEvent.click(getByRole("option"))` → **Observable result:** `onSelectRecentDoc` or `onOpenFilePath` callback called with the document/path

- **Action: keyboard navigation** → `fireEvent.keyDown(input, { key: "ArrowDown" })` → **Observable result:** first option receives `aria-selected` or visual focus; `fireEvent.keyDown(input, { key: "Enter" })` opens the result

- **Action: verify index is called on document open** → `useSearch.indexDocument(docId, title, content)` → **Observable result:** `invoke("index_document", { documentId, title, content })` called

**Run search tests:**
```bash
cd /workspace && pnpm test:frontend -- --reporter=verbose \
  src/components/editor/__tests__/search.test.tsx \
  src/hooks/__tests__/useSearch.test.ts
```

**Expected output:**
```
✓  (search-related assertions in search.test.tsx)
```

## Gotchas

- The search input has `role="combobox"` + `aria-label="Open file"` — it doubles as both the search bar and the "open file" command palette trigger. Don't confuse it with the command palette dialog (`role="dialog"` + `aria-label="Command palette"`).
- FTS5 snippets come back with `<mark>` tags. The `sanitizeSnippet` function in `Sidebar.tsx` escapes all HTML except `<mark>` and `</mark>`. Test this path separately if modifying snippet rendering.
- In browser stub mode, `invoke("search_documents")` always returns `[]` and `invoke("search_files_on_disk")` always returns `[]`. To test the search UI, mock the `invoke` response.
- The search has a short debounce before firing the Tauri command. If testing with fake timers, advance timers by the debounce interval (check `useSearch.ts` for the value; at time of writing it uses `useMemo` over a debounced callback).
- Disk file search (`search_files_on_disk`) requires actual filesystem access — only works in the full Tauri app, not in browser stub mode. In RTL tests, mock it to return `[]` or a fake list.
- The FTS5 index is populated via `indexDocument` which is called from `App.tsx` whenever a document loads. Search results are only as current as the last index call. In RTL tests, you must call `indexDocument` before searching, or mock the `search_documents` command directly.
