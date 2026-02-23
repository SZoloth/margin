# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Margin is a local-first desktop reading and annotation app. Open markdown files or keep-local articles, highlight text, write margin notes, export annotations. Built with Tauri v2 + React 19 + TipTap + SQLite.

## Commands

```bash
pnpm dev              # Vite dev server (frontend only, hot reload)
pnpm tauri dev        # Full Tauri app with hot reload
pnpm build            # TypeScript compile + Vite production build
pnpm tauri build      # Full desktop app bundle
pnpm tsc --noEmit     # Type check without emitting
```

No test framework is configured.

## Architecture

**Frontend (React + TypeScript):**
- `src/App.tsx` — root component, wires together all hooks and components
- `src/hooks/` — all state lives in custom hooks, no centralized store
  - `useDocument` — file/article loading, dirty tracking, Cmd+S/Cmd+O shortcuts
  - `useAnnotations` — highlights + margin notes CRUD via Tauri commands
  - `useKeepLocal` — external keep-local API integration (localhost:8787)
  - `useSearch` — FTS5 full-text search over documents
  - `useFileWatcher` — detects external file changes, reloads without marking dirty
- `src/lib/tauri-commands.ts` — typed wrappers around `invoke()` calls
- `src/lib/text-anchoring.ts` — 4-tier fallback system for resolving highlight positions after document edits (exact pos → text+context → text alone → orphan)

**Backend (Rust/Tauri):**
- `src-tauri/src/lib.rs` — app builder, plugin registration, file-open event handler
- `src-tauri/src/commands/` — Tauri command handlers (files, documents, annotations, keep_local, search)
- `src-tauri/src/db/` — SQLite migrations and models
- `src-tauri/src/watcher.rs` — file watcher using `notify` crate (macOS FSEvents)
- Database: `~/.margin/margin.db` (WAL mode, foreign keys, cascading deletes)

**Data flow:** React hooks → `invoke()` → Rust command handlers → SQLite. No REST API for core features.

## Key patterns

- **State in hooks, not context:** Each hook owns its domain (document, annotations, search). No Redux/Zustand/Context.
- **Fresh data before export:** `handleExportAnnotations` calls Tauri directly instead of reading React state to avoid stale closures.
- **External vs user edits:** `setContent()` marks dirty; `setContentExternal()` (from file watcher) does not.
- **Path alias:** `@/*` maps to `./src/*` in TypeScript and Vite.
- **Styling:** CSS variables for theming (light/dark via `prefers-color-scheme`), Tailwind v4, custom CSS in `src/styles/`. Highlight colors defined as CSS custom properties in `globals.css`.
- **Editor:** TipTap with custom extensions in `src/components/editor/extensions/` (MultiColorHighlight, MarginNote).

## Build & Verification

This is a Tauri app (Rust backend + React/TypeScript frontend). After making Rust changes, always run `cargo check` before proceeding. After TypeScript changes, run the TypeScript compiler to catch type errors. Do not assume the first implementation compiles cleanly.

## Issue tracking

This project uses `bd` (beads) for issue tracking. See AGENTS.md for the full workflow. Key commands: `bd ready`, `bd show <id>`, `bd close <id>`, `bd sync`.
