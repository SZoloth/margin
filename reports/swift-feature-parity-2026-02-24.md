# Daily Report - 2026-02-24: Swift Feature Parity

## Key Metrics
- Swift LOC: ~3,700 (75% of Tauri's ~6,700)
- Critical bugs: 6 fixed (previous compound run)
- Feature gap: 9 features, ~5-7 days estimated effort
- Dead code: ~900 LOC (CorrectionStore unused, document_tags schema-only, TextAnchoring unwired)

## Issues

### Critical
1. **Users cannot create highlights at all** — FloatingToolbarView renders EmptyView. No UI path from text selection to AppState.createHighlight(). This is the core value proposition of a reading/annotation app.
2. **TextAnchoring is dead code** — TextAnchoring.swift has a complete 4-tier fallback (exact pos, text+context, fuzzy, orphan) but zero callers. Highlights use naive position matching only, so any document edit can orphan all highlights.
3. **Highlight click hit-testing missing** — onHighlightClick callback exists but nothing in the Coordinator detects clicks on highlighted ranges. Users can't open note threads from the editor.

### High
4. **No undo toast for destructive actions** — Deleting a highlight is permanent with no undo path.
5. **Tab drag reorder has no gesture** — AppState.reorderTabs(from:to:) is implemented but TabBarView has no drag gesture attached.
6. **No table of contents** — No heading extraction, no TOC sidebar, no scroll-to-heading.

### Medium
7. **Search has no debouncing** — Every keystroke fires a Spotlight query immediately.
8. **CorrectionStore never called** — Full implementation exists but AppState.exportAnnotations() always passes correctionsSaved: false.
9. **FTS5 search not used** — searchDocuments() is implemented but AppState.search() only calls Spotlight.

### Low
10. **~900 LOC dead code** — CorrectionStore (never invoked from AppState), document_tags table (no model/store/UI), FileService.listMarkdownFiles (no caller), AnnotationStore.updateHighlightColor (no caller).
11. **Keyboard accessibility gaps** — No ARIA-equivalent patterns on tab bar, sidebar search, floating toolbar, or modals.
12. **File watcher has no debouncing** — External writes trigger immediate reload without coalescing rapid changes.

## Recommendations
1. Wire TextAnchoring + build floating toolbar (unblocks all highlight creation — the app's core feature)
2. Add highlight click hit-testing (completes the annotation loop)
3. Debouncing, TOC, tab drag, undo toast (independent quality-of-life features)
4. Corrections wiring + dead code cleanup + accessibility (polish)
