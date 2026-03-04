# Feedback -> Synthesis -> Rules -> Rule Usage Pipeline Audit

Last updated: 2026-03-03
Scope: Margin app (Tauri + React) + MCP server pipeline

## 1) System map (what exists today)

```mermaid
flowchart TD
  A[User highlights + margin notes in editor] --> B[Export annotations popover]
  B --> C[App.handleExportAnnotations]
  C --> D[Clipboard markdown export]
  C --> E[MCP export bridge POST /export]
  C --> F[persist_corrections -> corrections table]
  F --> G[Auto-export unified profile + hook (Rust export_writing_rules)]
  G --> H["~/.margin/writing-rules.md"]
  G --> I["~/.claude/hooks/writing_guard.py"]

  J[Style Memory: Corrections tab] --> K[export_corrections_json]
  K --> L[marks synthesized_at for unsynthesized corrections]
  K --> M["~/.margin/corrections-export.json"]
  J --> N[Copy synthesis prompt]
  N --> O[Agent runs margin_create_writing_rule via MCP]
  O --> P[writing_rules table]
  O --> Q[MCP autoExportWritingProfile]
  Q --> H
  Q --> I

  H --> R[Used by writing-quality-gate/manual prompting]
  I --> S[Hook enforcement on Claude Write/Edit for prose files]
```

## 2) Data stores and ownership

- `corrections` table: source of truth for feedback signals and synthesis state (`synthesized_at`).
- `writing_rules` table: source of truth for rule set.
- `~/.margin/writing-rules.md`: generated artifact (consumed by prompts/workflows).
- `~/.claude/hooks/writing_guard.py`: generated enforcement hook (automatic gate for specific rule categories).

## 3) Battletest coverage (current)

### End-to-end and integration

- `mcp/src/__tests__/pipeline-integration.test.ts`
  - feedback -> correction -> rule -> profile/hook export path
  - delete cascade behavior
  - retry-safe duplicate rule synthesis merge
  - backfilled-row exclusion while preserving physical rows

### Corrections and synthesis state

- `src-tauri/src/commands/corrections.rs` tests
  - backfilled sentinel exclusion (`session_id = '__backfilled__'`)
  - export/mark synthesized semantics
  - unsynthesized reset behavior

### Rule generation and profile rendering

- `src-tauri/src/commands/writing_rules.rs` tests
  - unified profile composition
  - register grouping and ordering
  - no duplicate casual voice bullets
  - hook generation shape and fail-open behavior

- `mcp/src/__tests__/writing-rules.test.ts`
  - create/update/delete and duplicate merge semantics
  - register field propagation in unfiltered reads
  - profile markdown sections
  - guard generation constraints

### UI handoff reliability

- `src/components/settings/__tests__/StyleMemorySection.test.tsx`
  - synthesis CTA clears after successful export

- `src/components/style-memory/__tests__/RulesTab.test.tsx`
  - auto-export on rule update
  - auto-export on rule delete

- `src/lib/__tests__/export-clear-policy.test.ts`
  - prevent annotation clearing when correction persistence was attempted but failed

## 4) Findings (where pieces do not fit cleanly)

### P1 (fixed): MCP dropped `register` metadata in common rule read path

- Symptom: voice-calibration rules were treated as universal in MCP-generated profile, collapsing casual/professional scoping.
- Root cause: `getWritingRules(db)` (unfiltered query) did not select `register`.
- Fixed in: `mcp/src/tools/writing-rules.ts`.
- Guarded by: `mcp/src/__tests__/writing-rules.test.ts` (`includes register field in unfiltered rule reads`).

### P1 (fixed): clear behavior is now durability-first on persistence failure

- Location: `src/App.tsx` + `src/lib/export-clear-policy.ts`.
- Prior behavior: annotations were cleared even if correction persistence failed.
- Current behavior: when correction persistence is attempted and fails, annotations are retained for retry.
- Guarded by: `src/lib/__tests__/export-clear-policy.test.ts`.

### P1 (still open): synthesis completion is not transactional

- Location: `export_corrections_json` marks rows synthesized before rules are guaranteed persisted.
- Risk: partial/failed synthesis run can move items to archive state without complete rule creation.
- Mitigation today: manual recovery via “mark unsynthesized” workflow exists.

### P2 (structural): dual artifact generators increase drift risk

- Rust path (`export_writing_rules`) and MCP path (`autoExportWritingProfile`) both generate `writing-rules.md` and `writing_guard.py`.
- Even with parity intent, duplicated formatting logic means future divergence risk unless continuously cross-tested.

### P2 (coverage gap): only subset of rules are auto-enforced

- `writing_guard.py` enforces kill words (`must-fix`, `kill-words`) and `ai-slop` regex patterns.
- Many rule categories (tone, structure, register guidance, etc.) are guidance-only unless an external quality gate/prompt applies them.

## 5) Redundancy map

- Redundant artifact writers:
  - Rust export command path
  - MCP mutation auto-export path
- Redundant “rule consumption” channels:
  - guard hook (automatic, narrow scope)
  - writing-quality-gate/prompt usage (manual or tool-driven, broader scope)

## 6) Recommended hardening backlog

1. Add synthesis transaction marker:
   - session/token for “exported for synthesis” and “rules applied” to detect incomplete synthesis rounds.
2. Add parity safety net:
   - golden test comparing Rust vs MCP profile/hook outputs for same fixture data.
3. Expand enforcement coverage intentionally:
   - define which categories are hard-gated vs advisory, and encode that policy explicitly.
