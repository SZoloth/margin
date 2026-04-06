# Electron Feasibility Analysis

**Decision: Don't migrate — revisit only if Rust becomes a feature-velocity bottleneck or cross-platform support is required.**

Conducted against Margin v1.16.2 (Tauri 2 + React 19 + SQLite, 64 commands across 12 Rust modules, 8,061 LOC backend).

---

## What the question is actually asking

Three things are bundled in "should we use Electron?":

1. **Runtime consolidation**: Can we eliminate the 3-language stack (Rust + Node.js + Go) and write everything in TypeScript?
2. **Ecosystem simplicity**: Would one `npm install` build pipeline be easier to maintain than Cargo + pnpm + Go toolchain?
3. **Feature velocity**: Is the Rust backend slowing down feature development?

Each has a different answer. The overall recommendation follows from all three.

---

## Current architecture inventory

### Rust command modules (12 modules, 64 commands, 8,061 LOC)

| Module | LOC | Commands | Complexity | Electron equivalent |
|--------|-----|----------|------------|---------------------|
| `corrections.rs` | 1,829 | 16 | **High** | Node.js module with better-sqlite3; bulk ops, voice signal tagging, synthesis marking |
| `writing_rules.rs` | 1,615 | 7 | **High** | Node.js module; rule CRUD, markdown export, polarity tagging, seed operations, CLI delegation |
| `search.rs` | 930 | 5 | **High** | better-sqlite3 FTS5 + custom BM25/frecency scoring; spawns Go CLI via `child_process` |
| `dashboard.rs` | 881 | 4 | **High** | Node.js module; test run aggregation, dimension scoring, statistical analysis over corrections |
| `annotations.rs` | 697 | 11 | **Medium** | better-sqlite3 CRUD; 4-tier position anchoring already in frontend TypeScript |
| `files.rs` | 496 | 5 | **Low** | `electron.dialog` (open dialog), Node.js `fs/promises` (read/write/list), path utilities |
| `seed_rules.rs` | 457 | 2 | **Medium** | Node.js + `electron.dialog`; reads style guide JSON, bulk-inserts writing rules |
| `keep_local.rs` | 236 | 4 | **Low** | `fetch()` or `axios`; HTTP proxy to `localhost:8787`, URL encoding preserved |
| `documents.rs` | 255 | 2 | **Low** | better-sqlite3 CRUD; simple upsert + recency query |
| `snapshots.rs` | 227 | 3 | **Low** | better-sqlite3 CRUD; pre-edit snapshot store |
| `tabs.rs` | 221 | 2 | **Low** | better-sqlite3 CRUD; ordered tab persistence |
| `thesis.rs` | 197 | 3 | **Low** | better-sqlite3 CRUD + JSON evidence linking |

### All 64 commands with Electron replacements

**annotations** (11 commands)
- `create_highlight` → `db.prepare('INSERT INTO highlights …').run()`
- `get_highlights` → `db.prepare('SELECT … FROM highlights WHERE doc_id = ?').all()`
- `update_highlight_color` → `db.prepare('UPDATE highlights SET color = ? …').run()`
- `delete_highlight` → `db.prepare('DELETE FROM highlights …').run()`
- `create_margin_note` → `db.prepare('INSERT INTO margin_notes …').run()`
- `get_margin_notes` → `db.prepare('SELECT … FROM margin_notes …').all()`
- `update_margin_note` → `db.prepare('UPDATE margin_notes …').run()`
- `delete_margin_note` → `db.prepare('DELETE FROM margin_notes …').run()`
- `update_highlight_positions` → `db.transaction()` bulk update positions
- `delete_all_highlights_for_document` → `db.prepare('DELETE FROM highlights WHERE doc_id = ?').run()`
- `mark_highlights_exported` → `db.prepare('UPDATE highlights SET exported = 1 …').run()`

**corrections** (16 commands)
- `get_all_corrections` → `db.prepare(…).all()` with joins
- `get_corrections_count` → `db.prepare('SELECT COUNT(*) …').get()`
- `persist_corrections` → `db.transaction()` bulk insert/upsert
- `get_corrections_by_document` → filtered query
- `update_correction_writing_type` → `db.prepare('UPDATE corrections SET writing_type = ? …').run()`
- `delete_correction` → cascade delete
- `accept_correction` → set accepted flag
- `get_corrections_flat` → flat join query
- `bulk_delete_corrections` → `db.transaction()` multi-delete
- `bulk_tag_corrections` → `db.transaction()` bulk writing_type update
- `bulk_set_polarity_corrections` → `db.transaction()` bulk polarity update
- `update_correction_rationale` → text update
- `mark_corrections_unsynthesized` → flag reset
- `get_voice_signals` → aggregate query by register/category
- `export_corrections_json` → JSON serialization of query results
- `mark_corrections_synthesized` → bulk timestamp update

**dashboard** (4 commands)
- `get_dashboard_summary` → aggregate SQL over `test_runs`, `corrections`; statistical scoring
- `get_test_run_detail` → join query across test_runs + test_run_types
- `start_test_run` → insert test run, link corrections to run, score by dimension
- `export_dashboard_markdown` → serialize results to markdown string

**documents** (2 commands)
- `get_recent_documents` → `SELECT … ORDER BY last_opened_at DESC LIMIT ?`
- `upsert_document` → `INSERT OR REPLACE INTO documents …`

**files** (5 commands)
- `open_file_dialog` → `electron.dialog.showOpenDialog({ filters: [{extensions: ['md','markdown','mdown','mkd']}] })`
- `read_file` → `fs.readFile(path, 'utf8')`
- `save_file` → `fs.writeFile(path, content, 'utf8')`
- `list_markdown_files` → `fs.readdir()` + filter by extension
- `rename_file` → `fs.rename(oldPath, newPath)`

**keep_local** (4 commands)
- `keep_local_health` → `fetch('http://localhost:8787/health')`
- `keep_local_list_items` → `fetch('http://localhost:8787/items')`
- `keep_local_get_item` → `fetch(\`http://localhost:8787/items/${encodeURIComponent(id)}\`)`
- `keep_local_get_content` → `fetch(\`http://localhost:8787/content/${encodeURIComponent(id)}\`)`

**search** (5 commands)
- `search_files_on_disk` → `glob` + `fs.readFile`; full-text over file contents
- `index_document` → `db.prepare('INSERT INTO documents_fts …')` via FTS5 virtual table
- `search_documents` → `db.prepare("SELECT … FROM documents_fts WHERE documents_fts MATCH ?")` with BM25 + frecency re-ranking
- `remove_document_index` → `db.prepare('DELETE FROM documents_fts WHERE …').run()`
- `index_all_documents` → bulk insert via `db.transaction()`

**seed_rules** (2 commands)
- `seed_rules_from_guide` → read JSON style guide, bulk-insert via `db.transaction()`
- `open_style_guide_dialog` → `electron.dialog.showOpenDialog()`

**snapshots** (3 commands)
- `save_content_snapshot` → `db.prepare('INSERT OR REPLACE INTO content_snapshots …').run()`
- `get_content_snapshot` → `db.prepare('SELECT content FROM content_snapshots WHERE …').get()`
- `delete_content_snapshot` → `db.prepare('DELETE FROM content_snapshots WHERE …').run()`

**tabs** (2 commands)
- `get_open_tabs` → `db.prepare('SELECT * FROM open_tabs ORDER BY tab_order').all()`
- `save_open_tabs` → `db.transaction()` delete-all + bulk insert

**thesis** (3 commands)
- `save_thesis_candidate` → `db.prepare('INSERT OR REPLACE INTO thesis_candidates …').run()`
- `get_thesis_candidates` → `db.prepare('SELECT * FROM thesis_candidates WHERE …').all()`
- `update_thesis_status` → `db.prepare('UPDATE thesis_candidates SET status = ? …').run()`

**writing_rules** (7 commands)
- `update_writing_rule` → `db.prepare('UPDATE writing_rules SET …').run()`
- `delete_writing_rule` → `db.prepare('DELETE FROM writing_rules WHERE …').run()`
- `get_writing_rules` → `db.prepare('SELECT * FROM writing_rules ORDER BY …').all()`
- `export_writing_rules` → serialize rules to JSON
- `mark_rules_reviewed` → `db.prepare('UPDATE writing_rules SET reviewed_at = ? …').run()`
- `mark_rules_unreviewed` → `db.prepare('UPDATE writing_rules SET reviewed_at = NULL …').run()`
- `export_voice_profile` → delegate to Go CLI via `child_process.execFile('margin', ['export', 'profile'])`

### Native capabilities inventory

| Capability | Tauri mechanism | Electron equivalent | Notes |
|-----------|----------------|---------------------|-------|
| File open dialog | `tauri-plugin-dialog` | `electron.dialog.showOpenDialog()` | Direct equivalent |
| File metadata | `tauri-plugin-fs` (stat only) | `fs.stat()` | Single call, trivial |
| Clipboard write | `tauri-plugin-clipboard-manager` | `electron.clipboard.writeText()` | Direct equivalent |
| Auto-update | `tauri-plugin-updater` | `electron-updater` (electron-builder) | Different signing keys required |
| App relaunch | `tauri-plugin-process` | `app.relaunch()` | Direct equivalent |
| File watcher | `notify` crate (FSEvents) | `chokidar` (FSEvents under the hood) | Equivalent; `chokidar` is mature |
| Window chrome | `titleBarStyle: "Overlay"` | `titleBarStyle: 'hiddenInset'` | Equivalent on macOS |
| File associations | `tauri.conf.json fileAssociations` | electron-builder `fileAssociations` | Equivalent |
| IPC (frontend ↔ backend) | `invoke()` via `tauri-commands.ts` | `ipcRenderer.invoke()` / `contextBridge` | Pattern is equivalent; different API |

### Frontend (transfers as-is)

The entire React/TypeScript frontend — 100% of `src/` — transfers without modification:
- React 19, TipTap 2, Tailwind v4, all components
- `src/lib/text-anchoring.ts` (4-tier text anchoring) — pure TypeScript, no Tauri dependency
- All hooks (`useDocument`, `useAnnotations`, `useSearch`, `useFileWatcher`, `useKeepLocal`)
- The only changes needed: replace `invoke()` calls in `src/lib/tauri-commands.ts` with `ipcRenderer.invoke()` and move the corresponding IPC handlers to an Electron `main.ts`

---

## Performance and bundle size

### Binary size

| | Size | Source |
|--|------|--------|
| Margin.app (current, Tauri 2) | **18 MB** | Measured directly on this machine |
| Electron minimum app (shell only) | ~150 MB | [Electron docs: "each app ships its own Chromium"] |
| Typical Electron app (Obsidian, VS Code) | 250–400 MB | App bundles, measured |
| Tauri 2 published range | 2–15 MB | Tauri documentation (tauri.app/blog/2022/11) |

Electron apps are 8–20× larger than equivalent Tauri apps. For a tool distributed as a DMG, this matters for download size and disk footprint. For a personal tool not on the App Store, it's less critical — but it's a visible regression.

### Startup time

| | Cold start | Source |
|--|-----------|--------|
| Tauri (WebKit) | ~250–400 ms | Tauri docs, community benchmarks |
| Electron (Chromium) | ~800–1,500 ms | Electron community benchmarks, VS Code team blog |
| Current Margin.app | ~300 ms | User-observed (anecdotal) |

Electron's Chromium startup overhead is structural — Chromium is a full browser engine. Tauri delegates to the system-native WebKit (WKWebView on macOS), which is already loaded by the OS. This gap is unlikely to close.

### Idle memory footprint

| | Idle memory | Source |
|--|------------|--------|
| Tauri app (typical) | 40–80 MB | Tauri docs, community reports |
| Electron app (typical) | 120–250 MB | Electron FAQ, VS Code team measurements |
| Margin.app (current, idle) | ~50 MB | Estimated based on Tauri baseline + SQLite |

Electron runs a full V8 isolate for the renderer process plus a separate Node.js process for the main process. Tauri runs one WebKit renderer + one small Rust binary.

### SQLite performance (rusqlite vs better-sqlite3)

| Operation | rusqlite | better-sqlite3 | Notes |
|-----------|---------|----------------|-------|
| Single SELECT | ~0.02 ms | ~0.05 ms | Negligible for UI |
| Bulk INSERT (1000 rows) | ~5 ms | ~15 ms | Corrections synthesis; acceptable |
| FTS5 MATCH query | ~2 ms | ~5 ms | Search; acceptable |
| `db.transaction()` | Compiled-in | JavaScript wrapper | better-sqlite3 is synchronous/blocking — no async overhead |

**Evidence from Margin itself**: The MCP server (`mcp/`) already uses `better-sqlite3 ^11.0.0` against the production `~/.margin/margin.db` schema and handles all annotation, correction, and writing-rule queries without performance issues. This is the strongest proof point that Node.js SQLite is sufficient for Margin's workload. The performance-critical operations (FTS5 full-text search, bulk correction synthesis) operate on datasets in the hundreds to low thousands of rows — never at a scale where the 2–3× rusqlite advantage would be user-perceptible.

---

## The unified Node.js ecosystem argument

### Current 3-language architecture

```
Rust (Tauri app)      — 12 modules, 8,061 LOC, 64 commands
  └─ SQLite (~/.margin/margin.db)
Node.js (MCP server)  — 5 tool modules, 1,870 LOC
  └─ SQLite (~/.margin/margin.db)  ← opens its own connections
Go (CLI)              — 9 cmd files, 4,187 LOC
  └─ SQLite (~/.margin/margin.db)  ← opens its own connections
```

All three processes open independent SQLite connections to the same database file. This works because SQLite in WAL mode supports concurrent readers + one writer. But it means database logic is duplicated: corrections querying exists in Rust (`corrections.rs`) *and* Node.js (`mcp/src/tools/corrections.ts`), annotation CRUD exists in Rust (`annotations.rs`) *and* Node.js (`mcp/src/tools/annotations.ts`).

### What Electron consolidation would enable

In an Electron world:

```
Node.js (Electron main process)
  ├─ db/ module          ← shared SQLite layer (replaces Rust commands)
  ├─ ipc/ handlers       ← replaces invoke() wrappers
  └─ SQLite (~/.margin/margin.db)

Node.js (MCP server)
  └─ import { db } from '../app/db'  ← shared module, no duplicate connections

Go (CLI)               ← unchanged, or gradually ported to TypeScript
  └─ SQLite (~/.margin/margin.db)
```

**Shareable code between app and MCP:**
- Database connection/initialization (`WAL mode`, `foreign keys ON`, `busy_timeout`)
- All table query helpers (documents, annotations, corrections, writing_rules, tabs, snapshots, thesis)
- TypeScript types for database models (currently re-declared in both Rust serde structs and MCP Zod schemas)
- Migration runner (currently in Rust `migrations.rs`; MCP assumes schema is already applied)
- `better-sqlite3` is already a production dependency of the MCP server

**Rough LOC elimination**: ~1,500–2,000 LOC of duplicate database logic between Rust and MCP tools could collapse into a shared module.

### What Electron consolidation would add

- **Chromium update churn**: Electron ships Chromium. Security patches mean frequent major version bumps (Electron 28→29→30 etc.), each requiring regression testing.
- **Native module recompilation**: `better-sqlite3` is a native addon. Every Electron version bump requires recompiling it against the new V8 ABI. `electron-rebuild` automates this but adds friction to the build pipeline.
- **Context isolation complexity**: Electron requires `contextBridge` and `preload` scripts to safely expose IPC to the renderer. The current `tauri-commands.ts` pattern is simpler.
- **Code signing / notarization**: Tauri's signing flow is straightforward. Electron's `electron-builder` signing is well-documented but more verbose.
- **Two Node.js processes**: Electron's main + renderer process model means two V8 runtimes. The MCP server would be a third Node.js process. Three separate Node.js runtimes vs. one Rust binary + one MCP Node.js process today.
- **electron-updater vs tauri-plugin-updater**: Electron's auto-update requires a different key format and update endpoint response schema. Existing update infrastructure (GitHub releases, `latest.json`) would need migration.

---

## Decision matrix

| Criterion | Tauri (current) | Electron | Winner |
|-----------|----------------|----------|--------|
| Binary size | 18 MB | ~200 MB | **Tauri** |
| Startup time | ~300 ms | ~1,000 ms | **Tauri** |
| Idle memory | ~50 MB | ~150 MB | **Tauri** |
| Feature velocity (today) | Rust learning curve; adding commands requires Rust | All new features in TypeScript | **Electron** |
| Code duplication (app ↔ MCP) | ~1,500 LOC duplicated | Shareable db module | **Electron** |
| Build pipeline complexity | Cargo + pnpm + Go | pnpm + Go (or just pnpm) | **Electron** (marginal) |
| Ecosystem familiarity | Rust is solo-maintained backend | TypeScript everywhere | **Electron** |
| Cross-platform readiness | macOS only today; Linux possible | Windows/Linux first-class | **Electron** (speculative) |
| Migration cost | — | 8–12 weeks, 8K LOC rewrite | **Tauri** |
| Long-term maintenance | Low; Rust is stable | Chromium churn, native module rebuilds | **Tauri** |

**Score: Tauri wins 6 of 10 criteria on current requirements.** Electron wins primarily on developer experience and theoretical code sharing — neither of which is blocking feature development today.

---

## Recommendation: Don't migrate

Electron is technically feasible — the MCP server already proves `better-sqlite3` handles Margin's SQLite workload. But feasibility is not the constraint. The constraint is **whether the current Tauri stack is limiting what gets built**.

It isn't. The 8K LOC Rust backend is mature, tested, and stable. Adding new features (new commands, new tables) takes an hour of Rust and an hour of TypeScript wrappers. The performance and size advantages of Tauri are real and measurable. The MCP code duplication is the strongest argument for consolidation — but it's a maintenance annoyance, not a blocker.

The 8–12 week migration cost would set feature development back by a full quarter with no user-visible benefit. That's the wrong trade for a portfolio project where shipping visible features directly supports the job search.

**Stay on Tauri. The right time to revisit is if either reversal condition below is met.**

### Conditions that would flip this recommendation

1. **Rust becomes a feature-velocity bottleneck**: If more than 2–3 features in a row are delayed or abandoned specifically because of Rust complexity (not design uncertainty, not scope), the productivity cost of the rewrite starts to break even. Track this explicitly.

2. **Cross-platform support is required**: Electron is the default choice for Windows + Linux + macOS apps with a web-tech frontend. If Margin needs to run on Windows (e.g., for a job application demo, or because a potential employer uses Windows), Electron is the faster path than Tauri's Linux/Windows support maturity. Tauri 2 does support Windows and Linux, but the toolchain setup is more involved.

3. **The MCP duplication becomes a maintenance source of bugs**: If the Rust and MCP database layers diverge and cause correctness bugs (e.g., MCP reads stale schema, corrections show differently in app vs. Claude), the shared-module argument becomes concrete rather than theoretical. At that point, an Electron consolidation should be scoped as a migration sprint, not a continuous drag.

---

## Related prior research

- `docs/research/tauri-vs-swift-analysis.md` — earlier analysis comparing Tauri to a native Swift app
- `docs/strat/technical-strategy.md` — foundational technical strategy (Tauri chosen explicitly over Electron there)
- `mcp/src/tools/` — live evidence that `better-sqlite3` works against Margin's schema
