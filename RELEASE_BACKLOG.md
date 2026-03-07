# Release backlog

Unreleased changes ready to ship.

## Ready (main)

### Uncommitted

- `feat: dashboard section` in settings (tables, commands, UI)
- `feat: seed rules from style guide` — upload/paste style guide, extract rules into DB

## Shipped

### v1.13.1 (2026-03-07)

- `fix: restore diff review wiring` in App.tsx (DiffBanner, DiffNavChip, DiffControls)
- `fix: restore polarity UI` — re-wire polarityMap, onSetPolarity, polarity stats to HighlightThread
- `fix: restore smart annotation clearing` — shouldClearAnnotationsAfterExport guards clearing when correction persist fails
- `fix: restore auto-export writing rules` — exportWritingRules() fires after corrections persist
- `fix: restore polarity in correction inputs` — polarityMap.get(h.id) instead of hardcoded null
- `fix: restore polarity in export markdown` — polarityMap passed to formatAnnotationsMarkdown

### v1.13.0 (2026-03-06)

- `feat: pattern discovery script for modern Sonnet calibration`
- `feat: type-aware rule filtering in adversarial test and compliance checker`
- `fix: allow multiple corrections per highlight`
- `feat: add margin harness workflow`
- `feat: auto-synthesis — corrections automatically become writing rules`

### v0.10.0 (2026-03-05)

- `fix: make synthesis transactional` (PIPELINE-AUDIT S9)
- `feat: register-aware voice calibration`
- `fix: harden feedback-to-rules synthesis pipeline`
- `docs: deduplicate strategy docs`
- `fix: use withDbAndExport for mark_corrections_synthesized`
- `fix: add missing deps to package.json`
