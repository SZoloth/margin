# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Margin is a writing quality system disguised as a reading app. The surface is a desktop app where you read, highlight, and annotate — but the actual product is underneath: it captures editorial judgment from reading, synthesizes corrections into enforceable writing rules, and mechanically prevents Claude from writing patterns you've flagged.

**The loop:** Read → Annotate → Correct → Synthesize rules → Enforce on AI writing → Read AI output → Annotate again. Each iteration makes the system more precisely yours.

**Key artifacts the system produces:**
- `~/.margin/writing-rules.md` — voice profile consumed by Claude via MCP or clipboard
- `~/.claude/hooks/writing_guard.py` — pre-tool hook that intercepts Write/Edit on prose files, auto-rejecting kill-words and AI slop patterns

**The product thesis:** Every correction you give should immediately improve the current document, propagate to all future documents of the same type, and never need to be given again.

Built with Tauri v2 + React 19 + TipTap + SQLite. See `docs/strat/product-strategy.md` and `docs/strat/technical-strategy.md` for full strategy.

## Commands

```bash
pnpm dev              # Vite dev server (frontend only, hot reload)
pnpm tauri dev        # Full Tauri app with hot reload
pnpm build            # TypeScript compile + Vite production build
pnpm tauri build      # Full desktop app bundle
pnpm tsc --noEmit     # Type check without emitting
```

**This is a Tauri desktop app, not a browser app.** `pnpm dev` starts the Vite dev server at localhost:1420 but only serves the frontend — no Rust backend, no SQLite, no Tauri commands. Always use `pnpm tauri dev` to run the actual app.

**Frontend tests** use Vitest: `pnpm test` (single run), `pnpm test:watch` (watch mode). Test files live alongside source in `__tests__/` directories.

**Backend tests** use Rust's built-in test framework: `cargo test` (from repo root or `src-tauri/`). Tests use in-memory SQLite — inner functions accept `&Connection` so they can be tested without the Tauri runtime. Covers annotations, documents, tabs, search, corrections, and migrations.

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

**Writing quality pipeline:**
- `src-tauri/src/commands/corrections.rs` — correction persistence, export, synthesis marking
- `src-tauri/src/commands/writing_rules.rs` — rule CRUD, profile generation, guard hook generation
- `mcp/src/tools/corrections.ts` — MCP tools for corrections (create, get, export, set polarity)
- `mcp/src/tools/writing-rules.ts` — MCP tools for rules (create, update, get, export as markdown)
- `mcp/scripts/adversarial-test.ts` — 27-prompt adversarial testing (9 writing types x 3)
- `mcp/scripts/compliance-check.ts` — mechanical + LLM compliance scoring against rule set
- Database: `~/.margin/margin.db` — SQLite is the coordination layer between Rust, MCP (Node.js), and generated artifacts

**Data flow:** React hooks → `invoke()` → Rust command handlers → SQLite. No REST API for core features.

## Key patterns

- **State in hooks, not context:** Each hook owns its domain (document, annotations, search). No Redux/Zustand/Context.
- **Fresh data before export:** `handleExportAnnotations` calls Tauri directly instead of reading React state to avoid stale closures.
- **External vs user edits:** `setContent()` marks dirty; `setContentExternal()` (from file watcher) does not.
- **Path alias:** `@/*` maps to `./src/*` in TypeScript and Vite.
- **Styling:** CSS variables for theming (light/dark via `prefers-color-scheme`), Tailwind v4, custom CSS in `src/styles/`. Highlight colors defined as CSS custom properties in `globals.css`.
- **Editor:** TipTap with custom extensions in `src/components/editor/extensions/` (MultiColorHighlight, MarginNote).
- **SQLite as coordination layer:** The database is the protocol between Rust (desktop app), MCP (Node.js), and generated artifacts. Schema truth lives in Rust migrations. All consumers derive from it.
- **Enforce at tool level, not prompt level:** The writing guard hook mechanically prevents violations — Claude can't choose to ignore it. This is the core technical advantage over prompt-based approaches.
- **Idempotent rule synthesis:** `UNIQUE(writing_type, category, rule_text)` means duplicate rule creation merges (increments `signal_count`, takes max severity).
- **Single-writer artifact generation:** The Go CLI (`margin export profile`) is the sole writer of `~/.margin/writing-rules.md` and `~/.claude/hooks/writing_guard.py`. Both Rust (`run_cli_export()`) and MCP (`autoExportWritingProfile()`) delegate to the CLI. Rust and MCP retain `#[cfg(test)]`/display-only formatters for test coverage but never write files directly.

## Testing & Verification

After Rust changes, run `cargo check`. After TypeScript changes, run `pnpm tsc --noEmit`. Don't assume the first implementation compiles.

**No browser automation.** This is a Tauri webview, not a browser tab. Chrome DevTools MCP, Puppeteer, Playwright cannot connect. Write tests or ask user to verify manually.

**Dev only.** Use `pnpm tauri dev` (hot reload, orange "dev" badge). Launching production `Margin.app` is blocked by hook (`no_prod_app.py`).

## Issue tracking

This project uses `bd` (beads) for issue tracking. See AGENTS.md for the full workflow. Key commands: `bd ready`, `bd show <id>`, `bd close <id>`, `bd sync`.

## Branch Coordination

Multiple Claude Code sessions may work on this repo simultaneously. Follow these rules to prevent conflicts:

- **Never commit directly to main** — always use a feature branch (`feat/`, `fix/`).
- **Never `git add .` or `git add -A`** — only stage files you created or modified for your task.
- **Quality gates before push:** `cargo check`, `pnpm tsc --noEmit`, `cargo test`, `pnpm test` — all must pass.
- **High-collision files** (coordinate carefully, check for conflicts before pushing):
  - `src-tauri/src/lib.rs` — command registrations
  - `src-tauri/src/commands/mod.rs` — module declarations
  - `src/lib/tauri-commands.ts` — TypeScript command wrappers
  - `src/App.tsx` — root component wiring
  - `src/styles/globals.css` — CSS variables and global styles

## Connected Projects

- **personal-site** (`~/Projects/personal-site/`) — Margin features become case study content. When making architecture decisions, consider: "how does this look in the DreamWorks-style case study?"
- **job-search-pipeline** (`~/Projects/job-search-pipeline/`) — Margin is portfolio evidence. Shipping visible features directly supports the job search.
