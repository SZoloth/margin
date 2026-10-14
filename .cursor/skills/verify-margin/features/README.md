# Feature Map — Margin

## Baseline Preconditions

All features require:
- `pnpm install` completed (node_modules present)
- `pnpm test:frontend` is the primary automated driver (Vitest + RTL, jsdom)
- For visual verification: `pnpm dev` running on port 1420 (Vite + browser stubs)
- No auth, no env vars, no seed data — browser stubs provide a sample document on first load
- No shared persistent state between automated test runs (in-memory stubs reset per test file)

Tauri-only behavior (SQLite persistence, file system, writing guard hooks) cannot be driven on
this VM. Tests that exercise Tauri commands use the browser stub module at
`src/lib/browser-stubs/core.ts` which provides in-memory CRUD with sample data.

## Driving Conventions

**Primary harness:** Vitest + `@testing-library/react` (RTL) with jsdom

- Import: `import { render, screen, fireEvent, waitFor } from "@testing-library/react"`
- Queries prefer `getByRole(role, { name })` → `getByLabelText` → CSS class selectors (`.thread-textarea`)
- TipTap editor events: `fireEvent.change` on `[contenteditable]` does not work; use `editor.commands.insertContent()` via an `onEditorReady` callback
- Async: use `waitFor(() => ...)` for effects that wait on promises or state updates
- Portal components (HighlightThread, ExportAnnotationsPopover, HighlightThread): query from `document.body`, not `container`

**Driving the Vite browser (manual only):**
```bash
curl -sf http://localhost:1420/ | grep -q "Margin" && echo "app is up"
```

## Proof and Skip Reporting

When running a feature scenario:
- **PASS**: test exits 0 and the expected assertions are in output
- **FAIL**: test exits non-zero or expected strings are absent; run again with `--reporter=verbose` for detail
- **SKIP**: note which assertion requires Tauri runtime (mark with `# TAURI-ONLY`) and report as not verifiable on this VM
- **BLOCKED**: primary surface is inaccessible; describe exact failure

## Feature Entry Contract

Each feature file documents:
1. The sub-features within that feature
2. Navigation path from the app's blank-slate state
3. Exact Vitest commands + RTL selectors + expected observable results
4. Known gotchas specific to that feature

## Features

| File | Feature | Primary source |
|------|---------|----------------|
| [markdown-reading.md](markdown-reading.md) | Markdown reading and editing | `src/components/editor/Reader.tsx`, `src/hooks/useDocument.ts` |
| [text-annotation.md](text-annotation.md) | Text annotation (highlights + margin notes) | `src/components/editor/FloatingToolbar.tsx`, `src/components/editor/HighlightThread.tsx`, `src/hooks/useAnnotations.ts` |
| [correction-capture.md](correction-capture.md) | Correction capture (polarity + rationale) | `src/components/editor/HighlightThread.tsx`, `src/hooks/useAnnotations.ts`, `src/lib/tauri-commands.ts:syncFeedbackSignal` |
| [style-memory.md](style-memory.md) | Style Memory (corrections + rules panel) | `src/components/settings/StyleMemorySection.tsx`, `src/components/style-memory/CorrectionsTab.tsx`, `src/components/style-memory/RulesTab.tsx` |
| [full-text-search.md](full-text-search.md) | Full-text search | `src/hooks/useSearch.ts`, `src/components/layout/Sidebar.tsx` |
