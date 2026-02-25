# PRD: Swift Feature Parity

## Overview
Close the 25% feature gap between the Swift rebuild and the Tauri reference implementation, making the Swift version a viable production replacement. The shared SQLite database means users can switch between implementations without data migration.

## Problem
The Swift rebuild has a solid foundation (models, database, services, basic UI) but is missing the core annotation creation loop — users literally cannot create highlights. Additionally, 8 quality-of-life features present in Tauri are absent. Until these gaps close, the Swift version cannot replace Tauri as the primary app.

## Goals
1. Enable highlight creation via floating toolbar on text selection
2. Wire TextAnchoring for resilient highlight positioning across document edits
3. Complete the annotation interaction loop (create, click-to-view, undo-delete)
4. Port remaining UI features: tab drag reorder, table of contents, undo toast
5. Add debouncing to search and file watcher
6. Wire CorrectionStore to export flow
7. Remove dead code
8. Add keyboard accessibility patterns

## Non-Goals
- Rich text editing (bold/italic/formatting toolbar) — NSTextView is read-focused
- Cross-platform support — Swift is Mac-only by design
- New features not in Tauri — strict parity, no scope creep

## Architecture Notes
- **Reference implementation:** All features are implemented in the Tauri codebase (src/) and should be ported to Swift equivalents
- **TextAnchoring.swift already exists** with complete 4-tier fallback — just needs to be called
- **FloatingToolbarView.swift exists** as a stub — needs selection rect integration and highlight actions
- **AppState.reorderTabs() exists** — just needs drag gesture on TabBarView
- **CorrectionStore is fully implemented** — just needs to be called from AppState.exportAnnotations()
- Quality check: `cd Margin && swift build 2>&1`

## Dependency Chain

```
Phase 1 (Foundation):
  T-001: Dead code cleanup
  T-002: Search debouncing
  T-003: File watcher debouncing

Phase 2 (Core Highlight Loop):
  T-004: Wire TextAnchoring to createHighlight
  T-005: Wire TextAnchoring resolveAnchor on document load
  T-006: Floating toolbar — selection tracking + positioning
  T-007: Floating toolbar — highlight creation + color picker
  T-008: Highlight click hit-testing for note threads

Phase 3 (UI Features):
  T-009: Tab drag reorder gesture
  T-010: Table of contents extraction + display
  T-011: Undo toast for highlight deletion

Phase 4 (Polish):
  T-012: Wire CorrectionStore to export + FTS5 to search
  T-013: Keyboard accessibility pass
```

## Tasks

### T-001: Dead code cleanup
Remove unused code to reduce noise for subsequent work:
- Remove `document_tags` table creation from Database.swift migration (or keep schema, remove if no plan to use)
- Remove `FileService.listMarkdownFiles()` (no caller)
- Remove `AnnotationStore.updateHighlightColor()` if not needed (or keep if floating toolbar will use it — KEEP)
- Clean up any other confirmed dead paths
- **Keep** CorrectionStore (will be wired in T-012), TextAnchoring (will be wired in T-004/T-005), updateHighlightColor (will be wired in T-007)

### T-002: Search debouncing (150ms)
Port from Tauri's useSearch.ts pattern:
- Add debounce to AppState.search() — cancel previous search task, wait 150ms before executing
- Use Swift structured concurrency: `Task` + `Task.sleep(nanoseconds:)` with cancellation
- Empty query should clear results immediately without debounce
- Also wire FTS5 searchDocuments() alongside Spotlight results

### T-003: File watcher debouncing
- FileWatcher DispatchSource events can fire rapidly for a single save
- Add coalescing: on event, schedule a reload after 200ms; cancel and reschedule if another event arrives within the window
- Use DispatchWorkItem for cancellable delayed execution

### T-004: Wire TextAnchoring.createAnchor at highlight creation
- When AppState.createHighlight() is called, extract the full document plain text
- Call TextAnchoring.createAnchor(text:, fullText:, from:, to:) to get prefix/suffix context
- Pass the context to AnnotationStore.createHighlight() (which already accepts prefix_context/suffix_context)
- Reference: src/lib/text-anchoring.ts createAnchor()

### T-005: Wire TextAnchoring.resolveAnchor on document load
- When loading annotations for a document (AppState.loadAnnotations or setDocument), run resolveAnchor for each highlight
- Update highlight positions if they've shifted (use AnnotationStore to update from/to in DB)
- Handle orphaned highlights gracefully (mark with confidence, still display at original position)
- Reference: src/lib/text-anchoring.ts resolveAnchor()

### T-006: Floating toolbar — selection tracking + positioning
- In MarkdownEditorView Coordinator, implement textViewDidChangeSelection to detect non-empty selections
- Compute selection rect using NSLayoutManager.boundingRect(forGlyphRange:in:)
- Convert to SwiftUI coordinate space
- Position the toolbar overlay above the selection (flip below if near top edge)
- Animate in with opacity + slight translateY, animate out on selection collapse
- Reference: src/components/editor/FloatingToolbar.tsx updatePosition()

### T-007: Floating toolbar — highlight creation + color picker
- Replace EmptyView in FloatingToolbarView with the actual HighlightToolbar content
- 5 color circles (yellow, green, blue, pink, orange) — tap creates highlight with that color
- "Add note" button — creates highlight + opens note thread
- Wire to AppState.createHighlight() (which now calls TextAnchoring via T-004)
- Ensure clicking toolbar does not collapse text selection (use mouseDown interception)
- Also wire AnnotationStore.updateHighlightColor() for changing existing highlight colors
- Reference: src/components/editor/FloatingToolbar.tsx

### T-008: Highlight click hit-testing for note threads
- In MarkdownEditorView Coordinator, override mouseDown or add click gesture
- On click, check if the clicked character position has a marginHighlight attribute
- If yes, extract the highlight ID and call onHighlightClick(highlightId)
- This should open the HighlightThreadView for that annotation
- Reference: TipTap MultiColorHighlight extension click handling

### T-009: Tab drag reorder gesture
- Add drag gesture to TabBarItem in TabBarView
- Use onDrag/onDrop with UTType.plainText transferable carrying the tab index
- On drop, call AppState.reorderTabs(from:to:) which already exists
- Add visual feedback: opacity change on dragged tab, drop indicator line
- Reference: src/components/layout/TabBar.tsx drag handlers

### T-010: Table of contents extraction + display
- Parse headings (H1, H2) from document content on load and content change (debounced 300ms)
- Store as [TOCEntry] with id, text, level, character offset
- Display in sidebar or overlay — tappable items that scroll editor to heading position
- Track active heading based on scroll position (topmost visible heading)
- Reference: src/hooks/useTableOfContents.ts, src/components/layout/TableOfContents.tsx

### T-011: Undo toast for highlight deletion
- Add @Published var pendingUndo: UndoItem? to AppState
- When deleting a highlight, delete immediately from DB but capture all data for potential re-creation
- Show toast banner with "Highlight deleted" + "Undo" button
- Auto-dismiss after 5 seconds
- Undo re-creates the highlight with original data (createHighlight with saved params)
- If new undo arrives while one is pending, commit the pending one
- Reference: src/components/ui/UndoToast.tsx

### T-012: Wire CorrectionStore to export + FTS5 to search
Two small wirings:
1. In AppState.exportAnnotations(), call CorrectionStore.persistCorrections() when AppSettings.persistCorrections is true. Return actual correctionsSaved/correctionsFile values.
2. In AppState.search(), also call SearchStore.searchDocuments() (FTS5) alongside Spotlight results. Merge/deduplicate by document path.

### T-013: Keyboard accessibility pass
Add accessibility patterns matching Tauri's ARIA implementation:
- Tab bar: accessibilityRole(.tabList/.tab), accessibilityAddTraits(.isSelected), roving focus with arrow keys
- Sidebar search: combobox-equivalent accessibility
- Floating toolbar: accessibilityLabel on color buttons and note button
- Undo toast: accessibility announcement on appear
- Note thread modal: accessibilityAddTraits(.isModal)
- Reference: TabBar.tsx role="tablist", Sidebar.tsx role="combobox", UndoToast.tsx role="status"
