# Technical Strategy — Margin

**Last updated:** 2026-03-04

**Related docs:** [PIPELINE-AUDIT.md](./PIPELINE-AUDIT.md) · [product-strategy.md](./product-strategy.md)

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

Every technical decision is evaluated against: **does this make the pipeline more reliable, the enforcement stronger, the verification more rigorous, or the friction lower?**

**Constraint: Claude Code subscription only.** See [Design Principles § Constraint](#constraint-claude-code-subscription-only) for full details.

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

### 2b. Signal-driven severity — TARGET STATE (not yet built)

Rule severity should be determined by user behavior, not manual classification. Every rule has a `signal_count` — the number of times the user has given that correction. Signal count drives enforcement strength:
- 1-2 signals → guidance only (loaded in profile, not in hook)
- 3-5 signals → soft enforcement (hook asks for confirmation)
- 6+ signals → hard enforcement (hook blocks)

The user never classifies severity manually. Give the same correction three times, it becomes a soft gate. Give it six times, it becomes a hard gate. This eliminates a friction point (manual severity dropdown) while making enforcement smarter.

**Implications:**
- The guard hook reads signal_count, not just severity, when deciding enforcement behavior.
- Rule seeding (from KILL_WORDS.md) should set signal_count to reflect the rule's established importance, not start at 1.
- Override tracking: when a user overrides a guard block, that's a signal the rule may need context scoping (writing_type/register), not removal.

### 2c. Context-aware rule loading — TARGET STATE (not yet built)

Rules are scoped by `writing_type` and `register` in the schema. The agent should load only the relevant subset for the current task — cover letter rules for cover letters, casual voice for text messages, professional register for outreach. The full profile dump is a fallback, not the default.

**Implications:**
- The writing profile needs an index or fast-path for "give me rules for writing_type=cover-letter, register=professional."
- Token efficiency: scoped loading keeps the context window focused. As the rule set grows, this becomes mandatory, not optional.
- The `/writing-voice` skill should detect context and load scoped rules. The MCP resource should support type filtering.

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
- **P1: Synthesis is not transactional** ([PIPELINE-AUDIT.md §9](./PIPELINE-AUDIT.md)). Fix: wrap marking + rule creation in a SQLite transaction, or add a two-phase marker ("exported for synthesis" → "synthesis confirmed").
- **P2: `synthesized_at` semantics ignored by MCP** ([PIPELINE-AUDIT.md §4](./PIPELINE-AUDIT.md)). Either enforce the semantics or remove the field.

### Writing Rules System (solid, needs loading)

**What works:**
- Full CRUD via Rust commands and MCP tools
- Idempotent synthesis: `UNIQUE(writing_type, category, rule_text)` means creating the same rule twice merges (increments `signal_count`, takes max severity)
- Register support: rules scoped to casual, professional, or universal
- Profile generation: voice calibration grouped by register, writing samples (positive polarity), corrections (corrective polarity), categorized rules with examples
- Guard generation: kill-words and ai-slop extracted to Python hook with JSON-embedded data

**What needs work:**
- **The rules table is nearly empty** ([PIPELINE-AUDIT.md §1](./PIPELINE-AUDIT.md)). Zero kill-word rules despite `KILL_WORDS.md` having 50+ entries. The guard generates with an empty array.
- **Enforcement coverage is undefined.** No explicit policy about which categories auto-enforce vs. advise. See Principle 2b (signal-driven severity) for the target approach.

### Dual Artifact Generation (structural risk — [PIPELINE-AUDIT.md §8](./PIPELINE-AUDIT.md))

Rust and MCP both generate `writing-rules.md` and `writing_guard.py` independently. Duplicated formatting logic across languages means divergence is structural, not accidental.

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

### Friction Reduction Architecture — TARGET STATE (not yet built)

These are the technical challenges behind the UX north star (see [product-strategy.md](./product-strategy.md) for the product framing and friction tables).

**Auto-classification at correction time:**
Infer polarity (corrective/positive) from the gesture (strikethrough = corrective, highlight with praise = positive) and writing_type from document metadata. This is a local heuristic, not an LLM call — the document already has a type tag, and the annotation gesture carries semantic meaning. Fallback to manual tagging for ambiguous cases.

**Continuous synthesis for common cases:**
When a correction persists, check if it matches an existing rule's `rule_text` (exact or fuzzy match). If yes, increment `signal_count` and re-export — no agent session needed. If no match, queue for synthesis review. The common case (reinforcing a known pattern) should be fully automatic. Novel pattern detection is the only step that needs LLM involvement.

**Context-aware rule loading** (see also Principle 2c): Rules scoped by `writing_type` and `register`. The agent detects which context it's in and loads only the relevant subset. "Enter mid-thought" fires for outreach DMs but not for PRDs. "Never explain a company's business back to them" fires for cover letters but not for blog posts. Tests already verify the schema supports this (`filters by writing_type`, `groups voice rules by register`). The gap is in the loading path: the agent needs context detection, not a full profile dump. Token efficiency: as the rule set grows, scoped loading becomes mandatory.

**Correction decay:** Rules not reviewed in 90 days surface for re-evaluation. The `reviewed_at` column (already in schema, tests exist for `mark_reviewed_sets_timestamp`) becomes the mechanism. Rules don't silently expire; they surface for a quick "still relevant?" check.

**In-place rewrite (open architectural question):**
The UX vision calls for corrections to immediately fix the paragraph being edited. This requires either:
- **(a)** Margin calls Claude (via `claude --print` or MCP) to regenerate the paragraph with the correction applied. Margin becomes an AI writing surface — significant scope expansion, favors Tauri/TipTap.
- **(b)** Simple text replacement where the correction is a direct substitution. Simpler, works on any platform, but less flexible for structural corrections.
- **(c)** Hybrid: text replacement for kill-word corrections, LLM rewrite for structural corrections.

This decision affects the platform choice. If (a), TipTap's content AI and tracked changes extensions become load-bearing. If (b), NSTextView suffices.

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
| **Editorial rules in 3-6 places** | Same rules scattered across CLAUDE.md, editorial.md, writing-rules.md, KILL_WORDS.md, AI_TELLS.md, rules.json. Drift guaranteed. | Medium — auto-generate editorial.md from DB, retire manual copies |
| **Reference files disconnected from DB** | KILL_WORDS.md, AI_TELLS.md, STYLE_GUIDE.md manually curated, never synced with Margin DB. Two independent rule stores covering same concerns. | Medium — generate from DB or fold content into rules table |
| **Full profile dump on every invocation** | `/writing-voice` loads entire writing-rules.md (~480 lines). As rules grow, token cost grows linearly. No scoping by writing_type or register at load time. | Medium — add scoped loading path |
| **Voice eval never scored** | voice-eval.md has 25 test prompts with empty scorecards. No evidence the voice profile improves output. | Low — run the eval |
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
3. **Correction rate tracking:** corrections per document over time, grouped by `writing_type`. This is the product metric (see [product-strategy.md](./product-strategy.md) § Metrics). The data already exists in the corrections table. Needs a query and a visualization.
4. **Graduation detection:** surface when a writing type has had zero corrections for N days.
5. **Override tracking:** when the guard hook fires and the user overrides, log it. High-override rules need context scoping (wrong writing_type or register), not removal.
6. Post-ship: Sentry-Tauri for crash reports, tauri-plugin-aptabase for anonymous feature adoption signals.

---

## Platform Decision (Tauri vs. Swift)

**The question:** Does the writing quality system need the AI to edit documents *inside* Margin? Or does the AI write elsewhere (Claude Code, chat) and the voice profile travels to that context?

| If... | Then... |
|-------|---------|
| AI writes elsewhere, profile travels via MCP/clipboard/hooks | **Swift.** The app only needs to be a fast annotator. NSTextView is fine. 2 deps, 1 language, 15MB binary. 5-7 day gap to close (floating toolbar, text anchoring wiring, tab drag, TOC). |
| AI writes inside Margin (inline suggestions, tracked changes, AI editor) | **Tauri.** TipTap's extension system supports Content AI, tracked changes, agent editing. NSTextView can't match this. 50+ deps but justified. |
| Unsure | Stay on Tauri until Priority 1 (product-strategy) clarifies the interaction model. Don't migrate speculatively. |

**In-place rewrite consideration:** The UX north star calls for corrections to immediately fix the paragraph you're looking at. If this is in scope, Margin becomes an AI writing surface — significantly favoring Tauri/TipTap. See Friction Reduction Architecture above for the three implementation options.

**Current assessment:** The writing quality system works through enforcement hooks and voice profiles that travel to Claude's context, not through in-editor AI features. This points toward Swift. But in-place rewrite changes the calculus. Assessment should come from Priority 1 data and UX testing, not speculation.

**Supply chain tradeoff:** 50+ npm deps (Tauri) vs. 2 deps (Swift). The platform decision directly affects dependency surface and supply chain risk.

---

## Design Principles

Six principles govern every design decision in the target architecture. Absorbed from the pipeline audit's architectural analysis.

1. **Simplicity.** One source of truth (Margin DB). One guard hook. One generator. One profile file. Eliminate every parallel system, manual copy, and redundant store. If something exists in two places, one of them is wrong.

2. **Frictionless.** The distance between giving feedback and seeing its effect should approach zero. Auto-classify from context. Synthesize continuously, not in batches. Apply corrections to the current document immediately. The user's only job is to highlight and annotate — everything downstream is automatic.

3. **Elegance.** Signal count drives severity. Writing type drives scoping. Correction rate measures success. Graduation detects mastery. The system's behavior emerges from a few clean primitives, not from manual configuration.

4. **Efficiency.** The entire pipeline works within a Claude Code subscription (see Constraint below). Token cost matters: load scoped rules for the writing type, not the full profile every time.

5. **Consistency.** Same DB state produces same artifacts, regardless of whether the Rust or MCP path generates them. Same rule produces same enforcement, regardless of which surface loads it. Parity tests verify this.

6. **Performance.** Export completes in milliseconds (SQLite queries + string formatting). Guard hook runs in milliseconds (JSON parse + word/regex scan). Profile loading adds minimal tokens to the context window. The system should be imperceptible in the writing workflow.

### Constraint: Claude Code subscription only

The fully realized system works within a standard Claude Code subscription. No fine-tuning. No custom model hosting. No external LLM APIs.

What this means in practice:
- Rules travel as structured markdown in Claude's context window, not as trained weights
- Synthesis uses Claude Code's existing agent capabilities (MCP tools, `claude --print`)
- The guard hook is a local Python script — no API calls at enforcement time
- Voice calibration is statistical data (from iMessage corpus), not a trained model
- The adversarial compliance checker uses `claude --print --model sonnet` — within subscription
- Auto-classification at correction time uses local heuristics (document metadata, gesture type) rather than an LLM call for every annotation

---

## What's Needed, by Layer

These tables map the audit findings to concrete build/test items. Status tracked in [PIPELINE-AUDIT.md](./PIPELINE-AUDIT.md).

**Layer 1 — Plumbing (fix disconnects):**

| Gap | What to build/test | Audit ref |
| --- | --- | --- |
| Parity golden test | Same fixture DB → Rust and MCP export produce identical output | §8 |
| Transactional synthesis | `synthesized_at` NULL if rule persist fails; set only on confirm | §9 |
| Kill-word seeding | Import from KILL_WORDS.md into DB; verify guard populates | §1 |
| Profile filters unclassified | Corrections with `polarity = NULL` absent from profile | §5 |
| Editorial.md generation | Export produces `editorial.md` with all-prose glob header | §11 |
| Retire word_guard.py | Merge banned word into DB; delete hook | §2 |

**Layer 2 — Eliminate friction (make feedback instant and contextual):**

| Gap | What to build/test | Audit ref |
| --- | --- | --- |
| In-place rewrite | Correction triggers rewrite of the corrected paragraph in the current doc | — |
| Auto-classification | Polarity + writing type inferred from gesture + document metadata | — |
| Continuous synthesis | Correction persist triggers incremental rule match/create (not batched) | §4 |
| Signal-driven severity | Hook enforcement strength scales with signal_count thresholds | — |
| Context-aware loading | Agent detects writing type from task, loads scoped rules only | — |
| Correction decay | Rules not reviewed in 90 days surfaced for re-evaluation | §7 |

**Layer 3 — Closing the loop (prove friction is decreasing):**

| Gap | What to build/test |
| --- | --- |
| Correction rate tracking | Corrections per document over time, grouped by writing_type |
| Override tracking | Guard overrides logged; high-override rules surfaced for review |
| Uncovered pattern detection | Corrections not matching existing rules flagged during synthesis |
| Graduation detection | Surface when a writing type has had zero corrections for N days |
