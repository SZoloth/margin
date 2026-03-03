# Margin

A local-first desktop app for reading, annotating, and learning from your own writing.

[![CI](https://github.com/SZoloth/margin/actions/workflows/ci.yml/badge.svg)](https://github.com/SZoloth/margin/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/SZoloth/margin)](https://github.com/SZoloth/margin/releases/latest)
![macOS](https://img.shields.io/badge/macOS-10.15+-black)

<!-- screenshot -->

## Features

### Reading and editing

- Open and edit local markdown files (`.md`, `.markdown`, `.mdown`, `.mkd`)
- Multi-tab document management with persistent tab state
- Customizable typography — font size, line spacing, reader width
- Light and dark themes (follows system preference)
- Table of contents generated from document headings

### Annotation

- Multi-color text highlighting (yellow, green, blue, pink, orange, purple)
- Margin notes attached to any highlight
- 4-tier text anchoring — highlights survive document edits through exact position, text+context, text-only, and orphan fallback
- Floating toolbar appears on text selection

### Style memory

- **Corrections** — mark problematic text with notes and a writing type
- **Voice signals** — tag corrections as positive (writing to emulate) or corrective (patterns to avoid)
- **Writing rules** — synthesized rules with severity, examples, and category
- **Unified profile export** — generates `~/.margin/writing-rules.md` with voice calibration, corrections, and synthesized rules in one file
- **Writing guard** — auto-generates a Claude Code hook that enforces your rules on prose edits
- **Auto-export** — writing rules automatically re-export after correction or rule changes
- 9 writing types: general, email, PRD, blog, cover letter, resume, Slack, pitch, outreach

### Search

- Full-text search across all documents (SQLite FTS5 with BM25 + frecency scoring)
- Spotlight integration via `mdfind` for broader file discovery

### Diff review

- Detects external file changes via macOS FSEvents
- Minor edits (<5% of document) auto-accepted silently
- Larger changes surface a diff banner with inline accept/reject per change
- Powered by `diff-match-patch` with semantic grouping

### Export

- **Clipboard** — formatted markdown with highlight colors, line ranges, and polarity tags
- **MCP** — push annotations directly to Claude via the export bridge
- **JSONL** — corrections exported to `~/.margin/corrections-export.json` for offline synthesis

### Claude integration (MCP server)

- Bundled MCP server exposes documents, annotations, corrections, and writing rules to Claude
- `margin_wait_for_export` — blocking tool that receives annotations pushed from the app
- `margin_highlight_by_text` — Claude can highlight text by content, no position math needed
- Auto-configures Claude Desktop with one click
- Prompts for annotation review, writing feedback, and reading summaries

### Keep-local

- Integrates with a local keep-local service (`localhost:8787`)
- Browse and search saved articles in the sidebar
- Open articles as Margin documents for annotation

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+
- [Rust](https://rustup.rs/) (stable)
- Tauri v2 system dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install and run

```bash
pnpm install
pnpm tauri dev
```

> `pnpm dev` starts the Vite frontend only (localhost:1420). Use `pnpm tauri dev` to run the full app with the Rust backend and SQLite.

## Testing

```bash
# Frontend (Vitest)
pnpm test
pnpm test:watch

# Backend (Rust)
cargo test

# MCP server
pnpm --filter mcp test

# Type check
pnpm tsc --noEmit
```

## Building

```bash
pnpm tauri build
```

Produces a `.app` bundle and `.dmg` installer in `src-tauri/target/release/bundle/`.

## Architecture

```
src/                        React 19 + TypeScript frontend
  components/
    editor/                 TipTap reader + custom extensions (highlight, margin-note, diff-mark)
    layout/                 AppShell, Sidebar, TabBar, SettingsModal
    style-memory/           StyleMemoryView, CorrectionsTab, RulesTab
  hooks/                    All state lives in custom hooks — no centralized store
    useAnnotations          Highlight + margin note CRUD
    useDocument             File loading, dirty tracking, Cmd+S / Cmd+O
    useDiffReview           External edit detection state machine
    useFileWatcher          FSEvents watcher integration
    useKeepLocal            Keep-local API polling
    useSearch               FTS5 full-text search
    useSettings             Theme, typography, highlight color preferences
    useTabs                 Multi-tab persistence
    useUpdater              Auto-update check and install
  lib/
    browser-stubs/          Tauri API stubs for Vitest (no runtime needed)
    diff-engine             Semantic diff grouping
    export-annotations      Markdown + style memory export formatting
    mcp-bridge              Claude Desktop config management
    text-anchoring          4-tier highlight position resolution
src-tauri/                  Rust backend (Tauri v2)
  src/commands/             annotations, corrections, documents, files, keep_local, search, tabs, writing_rules
  src/db/                   SQLite migrations and models
  src/watcher.rs            File watcher (notify crate, macOS FSEvents)
mcp/                        MCP server (separate workspace package)
  src/tools/                annotations, corrections, documents, writing-rules
  src/export-bridge.ts      HTTP bridge for streaming export (port 24784)
```

Data flows from React hooks through Tauri `invoke()` calls to Rust command handlers backed by SQLite. The database lives at `~/.margin/margin.db` (WAL mode, foreign keys, cascading deletes).

## MCP server

The bundled MCP server (`@margin/mcp-server`) runs via stdio and gives Claude read/write access to your Margin data.

**Setup:** Open Settings in Margin and click "Connect to Claude Desktop". This writes the server config to `~/Library/Application Support/Claude/claude_desktop_config.json`.

**Export bridge:** When you click "Send to Claude" in the export popover, Margin POSTs annotations to `127.0.0.1:24784/export`. Claude receives them through the `margin_wait_for_export` tool — no copy-paste needed.

## Auto-updates

Margin checks GitHub Releases on launch. When an update is available, a prompt appears in the app. Updates are code-signed and notarized for macOS.
