# Architecture

## System Purpose

Margin is a local-first Markdown reader and writer with a continuous feedback-learning system. The editor provides the daily reading and writing workspace. Saved editorial judgment enters SQLite immediately, synthesizes into reviewable writing rules, and exports as enforceable artifacts for future writing.

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

### Markdown Document Loop

1. User opens a portable Markdown file or local article.
2. TipTap renders it as a focused reading and writing surface.
3. Formatting and edits serialize back to Markdown without losing supported structure.
4. Saving writes the updated Markdown to its original local source.
5. File watching and snapshots protect the editor from silent external-change loss.

### Annotation To Rule

1. User annotates content or records positive or corrective feedback.
2. Saving feedback creates or updates the current unsynthesized correction in SQLite.
3. Editing or deleting feedback updates that same pending signal.
4. Synthesis turns correction events into reviewable writing rules.
5. Approved rules export to `~/.margin/writing-rules.md` and `~/.claude/hooks/writing_guard.py`.
6. Future writing uses the profile and guard, and the resulting prose returns to Margin for another review cycle.

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
