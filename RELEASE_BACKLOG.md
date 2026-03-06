# Release backlog

Unreleased changes ready to ship.

## Ready (main)

### 2026-03-05

- `fix: make synthesis transactional` (PIPELINE-AUDIT §9)
  - Split `export_and_mark_synthesized` into export-only + explicit mark.
  - Corrections stay unsynthesized until agent confirms rule creation via `mark_corrections_synthesized` (Tauri + MCP).
  - Both export paths (settings panel + corrections panel) include highlight_ids in synthesis prompt.
  - 9 new regression tests (6 Rust + 3 MCP integration).
  - Fixed MCP test schema drift (missing `synthesized_at` column).

### 2026-03-04

- `feat: register-aware voice calibration`
  - Added `register` column to `writing_rules` table (nullable TEXT) with migration and backfill.
  - Voice-calibration rules now tagged as `all` (universal) or `casual` based on `when_to_apply` text.
  - Writing profile markdown groups voice rules into Universal / Casual / Professional subsections.
  - Professional register section explicitly tells Claude casual rules DO NOT apply.
  - MCP `create_writing_rule` and `update_writing_rule` accept `register` parameter.
  - Adversarial test prompt includes register context so formal types aren't penalized by casual rules.
  - Mirrored grouping logic in both Rust and TS renderers.

### 2026-03-03

- `fix: harden feedback-to-rules synthesis pipeline` (`8ca532c`)
  - Aligned backfill filtering to `session_id != '__backfilled__'` across Rust + MCP profile export paths.
  - Removed legacy 2000-row cap for profile synthesis input fetches.
  - Made MCP rule creation retry-safe by merging duplicate synthesized rules with `ON CONFLICT` and `signal_count` accumulation.
  - Fixed style-memory export UX reliability:
    - auto-export profile artifacts after rule update/delete
    - clear stale synthesis CTA state after successful corrections export
  - Added battletests covering:
    - feedback -> synthesis -> rules -> export pipeline flow
    - duplicate synthesis retry behavior
    - backfilled-row exclusion while preserving physical rows
    - UI rule mutation auto-export and synthesis CTA behavior
