# Release backlog

Unreleased changes ready to ship.

## Ready (main)

(none — v1.13.0 shipped 2026-03-06)

## Shipped

### v1.13.0 (2026-03-06)

- `fix: allow multiple corrections per highlight — remove UNIQUE constraint, re-backfill`
- `feat: type-aware rule filtering in adversarial test and compliance checker`
- `feat: pattern discovery script for modern Sonnet calibration`
- `fix: remove UNIQUE(highlight_id) from MCP schema (schema drift)`


### v1.12.0 (2026-03-05)

- `feat: auto-synthesis — corrections automatically become writing rules`
- `feat: hook enforcement for auto-synthesized rules (AUTO_CORRECTIONS substring match)`
- `fix: harden polarity handler — catch synthesis errors, safe JSON parsing`

### v1.11.0 (2026-03-05)

- `fix: make synthesis transactional` (PIPELINE-AUDIT §9)
- `feat: register-aware voice calibration`
- `fix: harden feedback-to-rules synthesis pipeline`
- `docs: deduplicate strategy docs`
- `fix: use withDbAndExport for mark_corrections_synthesized`
- `fix: add missing deps to package.json`
