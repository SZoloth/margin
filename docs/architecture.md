# Architecture

## System Purpose

Margin is a local-first writing quality system. It captures editorial judgment from reading, stores that signal in SQLite, synthesizes it into writing rules, and exports enforceable artifacts that keep Claude from repeating patterns the user has flagged.

Related docs:

- `docs/product-vision.md`
- `docs/strat/technical-strategy.md`
- `docs/harness-engineering.md`

## Main Components

- `src/`
  Frontend Tauri webview built with React and TipTap. Handles reading, annotation, Style Memory, settings, diff review, and export UX.
- `src-tauri/`
  Rust backend for persistence, commands, migrations, filesystem access, and artifact generation.
- `mcp/`
  MCP server exposing Margin's data and exports to Claude and other agent surfaces.
- `~/.margin/`
  Stable local data surface. Holds `margin.db`, generated writing profile artifacts, correction exports, and runtime coordination files.
- `.harness/`
  Local review, gap tracking, and evidence scaffolding for higher-risk changes.

## Critical Flows

### Annotation To Rule

1. User annotates content in the Tauri app.
2. Annotation data persists as corrections in SQLite.
3. Corrections synthesize into writing rules.
4. Rules export to `~/.margin/writing-rules.md` and `~/.claude/hooks/writing_guard.py`.
5. Future AI writing is guided by the profile and constrained by the guard.

### Agent Access

1. Agent reads rules or corrections through MCP tools or exported artifacts.
2. Agent writes or updates rules via MCP or Rust-backed commands.
3. Artifacts regenerate from the database, not from hand-edited files.

### Review And Recovery

1. Higher-risk changes are classified using the conventions in `docs/harness-engineering.md`.
2. Verification runs through `scripts/verify`.
3. Escaped bugs are tracked in `.harness/gaps.jsonl`.

## Boundaries

- This repo is the Tauri app and its MCP/server surfaces.
- `MarginOS-Swift` is a separate repo now; the `Margin/` directory here is stale and should not drive implementation decisions.
- Browser automation assumptions do not apply to the main app because the UI runs in a Tauri webview, not a normal browser tab.
