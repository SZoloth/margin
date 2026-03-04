# Release backlog

Unreleased changes ready to ship.

## Ready (main)

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
