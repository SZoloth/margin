# Technical Strategy — Margin

**Last updated:** 2026-03-04

---

## What the System Does

Margin is a writing quality system. The technical architecture serves one purpose: **capture editorial judgment from reading, codify it into enforceable rules, and mechanically prevent AI from writing patterns the user has flagged.**

The pipeline:

```
User reads + annotates in Tauri app
        ↓
Annotations persisted as corrections (SQLite)
  - original_text, polarity, writing_type, before/after, context
        ↓
Corrections synthesized into writing rules (via Claude + MCP)
  - category (kill-words, ai-slop, voice-calibration, tone, structure)
  - severity (must-fix, should-fix, nice-to-fix)
  - register (casual, professional, universal)
  - signal_count (incremented on duplicate merge)
        ↓
Rules generate two artifacts:
  - ~/.margin/writing-rules.md (voice profile for prompt/MCP consumption)
  - ~/.claude/hooks/writing_guard.py (binary enforcement hook)
        ↓
Claude writes prose → guard intercepts Write/Edit on .md files
  - Kill-words: case-insensitive substring match → auto-reject
  - AI-slop: regex pattern match → auto-reject
  - All other rules: advisory via voice profile in context
        ↓
User reads AI output → annotates → corrections feed back into rules
```

Every technical decision is evaluated against: **does this make the pipeline more reliable, the enforcement stronger, or the verification more rigorous?**

---

## Technical Principles

### 1. SQLite is the coordination layer

The database isn't just storage — it's the protocol between the desktop app (Rust), MCP server (Node.js), CLI (Go), and generated artifacts. All three access paths share one file: `~/.margin/margin.db`.

**Implications:**
- Schema truth lives in Rust migrations (`src-tauri/src/db/migrations.rs`). All other consumers derive from it.
- New features add tables/columns, not new data stores.
- The `~/.margin/` directory is a stable interface — database, corrections export, voice profile, port file all live here.
- WAL mode for concurrency. Foreign keys for integrity. Cascading deletes for cleanup.

### 2. Enforce at the tool level, not the prompt level

Prompt instructions ("don't use leverage") are suggestions the AI can ignore. Tool-level enforcement (`writing_guard.py` intercepting Write/Edit) is mechanical — the AI cannot violate it. This is the system's core technical advantage over every other approach to AI writing quality.

**Implications:**
- The guard hook is the highest-value artifact. Its reliability is non-negotiable.
- Guard logic must fail-open (hook errors don't block all writes) but fail-visible (violations are reported, not swallowed).
- Data embedded in the guard (kill-words, slop patterns) is serialized as JSON, not interpolated as Python strings — prevents code injection via rule text containing `"""`.

### 3. Test the chain, not the links

Unit tests for individual functions provide false confidence when the pipeline spans Rust → SQLite → TypeScript → generated files → Claude interaction. The highest-value tests exercise the full chain:

- Pipeline integration test: create correction → set polarity → create rule → verify rule in profile markdown → verify rule in guard hook KILL_WORDS array
- Parity test: Rust and MCP generate identical artifacts for the same fixture data
- Adversarial test: 27 prose samples scored against the full rule set, regression-tracked over time

**Implications:**
- Every change touching corrections, rules, or export requires a chain-level test, not just a unit test.
- The adversarial suite is a product test (does the loop work?), not an engineering test (does the function return the right value?).
- Gap tracking (`.harness/gaps.jsonl`) ensures production escapes get permanent coverage.

### 4. Fail visible, never fail silent

When text anchoring degrades, it reports confidence (exact/fuzzy/orphaned). When corrections can't persist, annotations are retained for retry. When synthesis partially fails, it's detectable (though not yet — the transaction issue is open). When the guard encounters malformed input, it passes with a warning.

**Implications:**
- No swallowed errors in the pipeline.
- Every degraded state must surface in UI or logs.
- The diff review system exists because silent external edits destroy annotations — extend this philosophy everywhere.

---

## Architecture: What Exists and What Needs Work

### Corrections System (solid, one P1 open)

**What works:**
- `persist_corrections()` saves annotation exports to SQLite with full metadata (polarity, writing_type, context, session_id)
- `export_corrections_json()` exports unsynthesized corrections, marks them `synthesized_at = now()`
- Backfill exclusion: `session_id != '__backfilled__'` prevents re-processing of seeded data
- Durability-first clear policy: annotations retained if persistence fails
- Full test coverage in Rust and MCP

**What needs work:**
- **P1: Synthesis is not transactional.** `export_corrections_json` marks rows synthesized *before* rules are confirmed created. If synthesis fails partway, corrections are marked done but rules don't exist. Fix: wrap marking + rule creation in a SQLite transaction, or add a two-phase marker ("exported for synthesis" → "synthesis confirmed").
- **P2: `synthesized_at` semantics ignored by MCP.** MCP tools re-read full correction history every time, ignoring this field. Either enforce the semantics or remove the field.

### Writing Rules System (solid, needs loading)

**What works:**
- Full CRUD via Rust commands and MCP tools
- Idempotent synthesis: `UNIQUE(writing_type, category, rule_text)` means creating the same rule twice merges (increments `signal_count`, takes max severity)
- Register support: rules scoped to casual, professional, or universal
- Profile generation: voice calibration grouped by register, writing samples (positive polarity), corrections (corrective polarity), categorized rules with examples
- Guard generation: kill-words and ai-slop extracted to Python hook with JSON-embedded data

**What needs work:**
- **The rules table is nearly empty.** Zero kill-word rules despite `KILL_WORDS.md` having 50+ entries. The guard generates with an empty array. This is the most urgent gap.
- **Enforcement coverage is undefined.** No explicit policy about which categories auto-enforce (guard) vs. advise (profile only). Current default: only kill-words and ai-slop enforce. Everything else is advisory.

### Dual Artifact Generation (structural risk)

**The problem:** Rust (`export_writing_rules` in `writing_rules.rs`) and MCP (`autoExportWritingProfile` in `writing-rules.ts`) both generate `writing-rules.md` and `writing_guard.py`. Both intend to produce identical output. But duplicated formatting logic across languages means future divergence is structural, not accidental.

**Options:**
1. **Single writer (recommended):** MCP mutations trigger Rust export. One code path for artifact generation. MCP only reads, Rust writes.
2. **Golden parity test:** Both generate for the same fixture; test asserts identical output. Lower risk but doesn't eliminate redundancy.
3. **Template extraction:** Shared template both consumers render. Requires cross-language template engine (impractical).

### Text Anchoring (battle-tested, needs regression suite)

**What works:**
- 4-tier fallback: exact position → text + context → text alone (fuzzy scored) → explicit orphan
- Highlights stored separately from document text — the file on disk never contains markup
- Confidence levels surface to UI (the user knows when a highlight degraded)

**What needs work:**
- Dedicated regression test suite with specific edit scenarios (insertion before highlight, deletion spanning boundary, paragraph rewrite)
- Performance profiling for documents with 100+ highlights
- Swift rebuild has `TextAnchoring.swift` with complete 4-tier logic — but it's dead code (not wired to highlight creation)

### MCP Server (working, parity issues)

**What works:**
- 14 tools exposing full system to Claude
- Key tools for the writing loop: `margin_create_writing_rule`, `margin_get_corrections`, `margin_get_writing_rules_markdown`, `margin_wait_for_export`
- Export bridge: in-process HTTP server (port 24784) for push-based annotation delivery
- Retry-safe: duplicate rule creation merges via ON CONFLICT

**What needs work:**
- **Schema parity:** MCP test schema (`SCHEMA_SQL` in `db.ts`) manually maintained, already drifted once (`reviewed_at` missing). Must be mechanically derived from Rust migrations.
- **Single-writer for artifacts:** MCP should trigger Rust export, not run its own generation logic.
- **`reviewed_at` has no MCP write path.** Column exists in Rust, dead on MCP surface.

### Adversarial Testing (built, never run)

**What exists:**
- `mcp/scripts/adversarial-test.ts`: generates 27 samples via `claude --print`, with and without voice profile
- `mcp/scripts/compliance-check.ts`: mechanical layer (kill-words, slop patterns, structural tells, voice violations) + LLM layer (Claude rubric scoring)
- `mcp/scripts/regression/run-regression.ts`: diffs against stored baselines
- Register-aware: prompts mapped to casual/professional for register-specific rule checking

**What needs work:**
- **Has never been run.** No baseline exists.
- **Depends on seeded rules.** The compliance checker reads kill-words from `KILL_WORDS.md` and rules from the database. Both need population.
- **Results need storage.** `.harness/evidence/` exists but is empty. Baseline JSON should be committed for regression tracking.

---

## CI/CD

### Current: monolithic macOS job (~240s, 10x runner cost)

### Target: Linux/macOS split (from harness-engineering.md)

| Job | Runner | What | Time | Cost |
|-----|--------|------|------|------|
| `frontend` | ubuntu-latest | `pnpm tsc`, `pnpm build`, `pnpm test`, MCP tests | ~90s | 1x |
| `backend` | macos-15 | `cargo check`, `cargo clippy`, `cargo test` | ~180s | 10x |

~60% runner cost reduction by moving frontend to Linux.

**Additional CI targets to add:**
- Pipeline integration test (correction → rule → profile → artifact chain)
- Schema parity check (MCP `SCHEMA_SQL` matches Rust migrations)
- Gap audit (`.harness/scripts/audit-gaps.mjs`)
- Token lint (`pnpm lint:tokens`)

### Release pipeline

Working: GitHub Actions builds, signs, notarizes DMG on tag push. Auto-update via `tauri-plugin-updater`.

---

## Technology Radar

### Adopt (load-bearing, don't change)

| Technology | Role in the system |
|-----------|-------------------|
| SQLite WAL + FTS5 | Coordination layer, search |
| Rust `&Connection` test pattern | Backend testability without Tauri runtime |
| TipTap + custom extensions | Editor with highlight/note/diff extensions |
| MCP server (Node.js) | Claude's interface to the rule system |
| Writing guard hook (Python) | Tool-level enforcement |
| Gap tracking ratchet | Quality backstop for pipeline escapes |

### Trial (evaluate for specific need)

| Technology | When to evaluate |
|-----------|-----------------|
| **cr-sqlite** | When multi-device sync becomes relevant. CRDTs for SQLite without a cloud backend. The single-database architecture makes adoption straightforward. |
| **TipTap Content AI / tracked changes** | If Priority 1 reveals that in-editor AI features are needed for the loop. Requires Pro license. |
| **Sentry-Tauri** | After ship (Priority 5). Production crash reporting without analytics overhead. |

### Hold (do not adopt)

| Technology | Why |
|-----------|-----|
| Cloud database | Local-first is a core product value. Editorial judgment doesn't leave the machine. |
| Electron | Tauri v2 is production-grade with better resource profile. |
| Redux / Zustand (wholesale) | Hook-per-domain pattern works at current scale. Only introduce shared state for specific cross-cutting needs. |
| Custom sync protocol | Use proven solutions (cr-sqlite) if sync ever needed. |
| AI detection APIs | Margin prevents AI tells at the source. Detection after the fact is the wrong end of the problem. |

---

## Technical Debt (Ordered by Impact on the Loop)

| Debt | Impact on writing quality system | Fix effort |
|------|----------------------------------|-----------|
| **Kill-words not seeded** | Guard has zero ammunition. The enforcement layer works but catches nothing. | Low — seed from KILL_WORDS.md |
| **Synthesis not transactional** | Corrections can be marked done without rules created. Data loss in the loop. | Low — SQLite transaction wrapper |
| **Dual artifact generators** | Drift risk between Rust and MCP profile/hook output. | Medium — single-writer pattern |
| **MCP schema drift** | Test database missing production columns. Tests provide false confidence. | Medium — automate schema derivation |
| **Adversarial baseline missing** | No proof the loop works. The product hypothesis is untested. | Medium — run the scripts that already exist |
| **Enforcement policy undefined** | No documented decision about what auto-enforces vs. what advises. | Low — write the policy |
| **`synthesized_at` ignored by MCP** | Dead semantics. Field exists but one consumer ignores it. | Low — enforce or remove |
| **App.tsx at 1,526 lines** | Frontend complexity ceiling. Not urgent but limits iteration speed. | Medium — extract coordination logic |

---

## Security

**Current posture:**
- Tauri v2 fine-grained permissions (opt-in API access from webview)
- No network dependency for core features — reading, annotation, search all offline
- SQLite parameterized queries via rusqlite — no SQL injection
- MCP server on localhost only (port 24784)
- Guard hook data serialized as JSON, not interpolated as Python — prevents injection via rule text

**Specific risks:**
- **Generated guard hook:** `writing_guard.py` is written to `~/.claude/hooks/` and executed by Claude Code. The triple-quote injection defense (JSON serialization of data, not string interpolation) is correct and tested. But any change to generation logic must be audited for injection paths.
- **MCP tool input validation:** Claude-generated inputs can be malformed. Validation exists (severity enum, writing_type enum) but should be exhaustive.
- **Dependency surface:** 50+ npm deps (Tauri) vs. 2 deps (Swift). Platform decision directly affects supply chain risk.

---

## Monitoring

**Current:** None. No crash reporting, no error tracking, no usage signals.

**Minimum viable observability:**
1. Structured logging to `~/.margin/logs/` for debugging user-reported issues
2. Pipeline health check: a script reporting rule count, correction count, last synthesis date, guard rule count, profile completeness. For the developer, not the user.
3. Post-ship: Sentry-Tauri for crash reports, tauri-plugin-aptabase for anonymous feature adoption signals.
