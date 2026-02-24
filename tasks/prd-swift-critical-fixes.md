# PRD: Swift Rebuild Critical Fixes

## Overview
Fix the 6 critical issues identified in the dual code audit (Claude + Codex) of the Margin Swift rebuild. All are data-loss bugs, runtime crashes, or security issues. No new features — pure correctness fixes.

## Problem
The Swift rebuild compiles and launches but has 6 critical issues that will cause data loss, crashes, or visual corruption in normal usage. These must be fixed before the app is usable.

## Solution

### T-001: Fix tab dirty flag sync
**Files:** `AppState.swift`, `TabBarView.swift`
- Sync the global `isDirty` state to the active tab's `TabItem.isDirty` whenever `isDirty` changes
- `closeTab` already checks `tab.isDirty` — it just needs to be set
- `TabBarView` dirty dot indicator will work automatically once the flag is synced

### T-002: Fix keep-local article save behavior
**Files:** `AppState.swift`
- When `filePath == nil` and content has been edited, `saveCurrentFile()` should NOT silently clear `isDirty`
- Options: (a) show a warning that articles can't be saved locally, or (b) don't clear isDirty so the unsaved-changes dialog triggers on close
- Implement option (b) — simplest, preserves the "unsaved changes" guard

### T-003: Fix JSONL export optional handling
**Files:** `CorrectionStore.swift`
- Replace `String? as Any` casts with explicit nil-coalescing or conditional inclusion
- Replace `JSONSerialization` with `JSONEncoder` (the encoder is already created but unused)
- Remove `try?` — let errors propagate so callers know export failed

### T-004: Fix mdfind query injection
**Files:** `SearchStore.swift`
- Escape single quotes and backslashes in user query before interpolating into mdfind predicate
- Or use Process arguments array instead of string interpolation

### T-005: Fix highlight background wipe
**Files:** `MarkdownEditorView.swift`
- Instead of removing ALL `.backgroundColor` attributes, only remove backgrounds that match known highlight colors
- Preserve code block formatting backgrounds

### T-006: Fix FTS5 rank query syntax
**Files:** `SearchStore.swift`
- Fix the SQL to use `ORDER BY rank` correctly for FTS5 (rank is an implicit column in FTS5 tables)
- The real issue is likely `SELECT *, rank FROM documents_fts` — rank doesn't need explicit selection, just ordering

## Non-goals
- New features
- Dead code cleanup (separate PR)
- Performance optimizations
- UI polish

## Quality checks
- `cd Margin && swift build` must pass (exit code 0)
- No new warnings introduced
