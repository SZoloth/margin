# Margin

A local-first desktop app for reading and annotating markdown files. Highlight text, write margin notes, and export your annotations.

Built with Tauri v2, React 19, TipTap, and SQLite.

## Features

- Open and edit local markdown files (`.md`, `.markdown`, `.mdown`, `.mkd`)
- Multi-color text highlighting
- Margin notes attached to highlights
- Full-text search across all documents (FTS5)
- Light and dark theme (follows system preference)
- File watching — detects external edits and reloads automatically
- Auto-updates via GitHub Releases
- Resilient text anchoring — highlights survive document edits through a 4-tier fallback system

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/) v10+
- [Rust](https://rustup.rs/) (stable)
- Tauri v2 system dependencies — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Getting started

```bash
# Install dependencies
pnpm install

# Run the app in development mode
pnpm tauri dev
```

> `pnpm dev` starts the Vite frontend only. Use `pnpm tauri dev` to run the full app with the Rust backend and SQLite.

## Testing

```bash
# Frontend (Vitest)
pnpm test
pnpm test:watch

# Backend (Rust)
cargo test
```

## Building

```bash
pnpm tauri build
```

Produces a `.app` bundle and `.dmg` installer in `src-tauri/target/release/bundle/`.

## Architecture

```
src/                    React frontend
  hooks/                State management via custom hooks
  components/editor/    TipTap editor + custom extensions
  lib/                  Tauri command wrappers, text anchoring
src-tauri/              Rust backend
  src/commands/         Tauri command handlers
  src/db/               SQLite migrations and models
  src/watcher.rs        File system watcher (macOS FSEvents)
```

Data flows from React hooks through Tauri `invoke()` calls to Rust command handlers backed by SQLite. The database lives at `~/.margin/margin.db`.
