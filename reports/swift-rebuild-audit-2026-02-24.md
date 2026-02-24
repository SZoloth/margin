# Swift Rebuild Audit Report - 2026-02-24

## Source
Dual code audit: Claude Explore agent + OpenAI Codex (full-context, static analysis).
Scope: `Margin/Sources/Margin/` — the native Swift/SwiftUI rebuild.

## Key Metrics
- Total files: 26
- Compilation errors fixed: 3 (GRDB 6.29 compat)
- Critical issues found: 6
- Warnings found: 16
- Dead code items: 10

## Issues

### Critical (data loss or runtime crash)

1. **Tab dirty flag never set — unsaved edits silently dropped on tab close**
   - `AppState.swift:416` — `closeTab` checks `tab.isDirty` but only global `isDirty` is ever updated
   - `TabBarView.swift:51` — dirty indicator dot also reads the never-set `tab.isDirty`
   - Impact: Users lose work when closing tabs

2. **FTS5 rank query crashes at runtime**
   - `SearchStore.swift:42` — references `rank` as a column, but FTS5 requires `ORDER BY rank` as special syntax, not a selected column
   - `SearchResult` struct and `searchDocuments()` are broken and unused, but will crash if called

3. **Keep-local article edits silently discarded**
   - `AppState.swift:202` — when `filePath == nil` (keep-local articles), `saveCurrentFile()` clears `isDirty` and returns with zero persistence and zero warning
   - Impact: User edits an article, hits Cmd+S, thinks it saved — it didn't

4. **JSONL export silently drops correction records**
   - `CorrectionStore.swift:181-188` — optional `String?` values cast to `Any` cause `JSONSerialization` to fail
   - `try?` at line 193 swallows the error — records silently skipped (data loss)

5. **mdfind command injection via search query**
   - `SearchStore.swift:74` — user query interpolated raw into mdfind predicate string
   - Single quotes, backslashes, special chars break or inject into the command

6. **Highlight reapply wipes all background colors**
   - `MarkdownEditorView.swift:145` — `removeAttribute(.backgroundColor, range:)` destroys code block formatting, not just highlight colors
   - Every content update strips code block backgrounds

### High (functional bugs, not crashers)

7. **fatalError if DB accessed before initialize()**
   - `Database.swift:34,39` — reader/writer properties call `fatalError` if dbPool is nil
   - `Database.swift:17` — `try?` swallows `~/.margin` dir creation failure, cascading to DB init failure

8. **Async race on rapid article opens**
   - `AppState.swift:167` — rapid opens complete out-of-order, showing stale content

9. **Synchronous I/O on MainActor freezes UI**
   - `AppState.swift:79` — file watcher callback does sync disk I/O
   - `AppState.swift:525` — search runs mdfind synchronously per keystroke
   - `AppState.swift:101` — openFilePath does sync file + DB work

10. **No debouncing on file watcher**
    - `FileWatcher.swift` — rapid external edits fire multiple callbacks, thrashing UI

11. **Highlight fallback matches wrong occurrence**
    - `MarkdownEditorView.swift:164` — `range(of:)` finds first text match; repeated text highlights wrong spot

12. **KeepLocal search @Published mutation off MainActor**
    - `KeepLocalService.swift:86` — background thread warning risk

13. **FTS index never updated after open**
    - `AppState.swift:129` — document indexed on open only; edits and external changes go stale
    - `Database.swift:151` — no triggers to keep documents_fts in sync

14. **Settings changes don't reliably update NSTextView**
    - `MarkdownEditorView.swift:83` — re-render guard skips when content unchanged

## Dead Code
- `TextAnchoring.swift` — entire file unused (editor uses simpler fallback)
- `FloatingToolbarView` — returns EmptyView (feature stub)
- `import Combine` + `cancellables` in AppState — never used
- `SearchResult` struct + `searchDocuments()` — unused and broken
- `listMarkdownFiles` / `FileEntry` in FileService — unused
- `document_tags` table — created but never used
- `persistCorrections` setting — never consulted
- `encoder` (JSONEncoder) in CorrectionStore — created but unused

## Recommendations
1. Fix tab dirty flag sync (blocking data loss)
2. Fix keep-local save behavior (blocking data loss)
3. Fix JSONL export optional handling (data loss)
4. Fix mdfind injection (crash/security)
5. Fix highlight background wipe (visual corruption)
6. Fix FTS5 rank query (crash if called)
7. Remove dead code (reduce confusion)
8. Add MainActor annotations to KeepLocal (thread safety)
