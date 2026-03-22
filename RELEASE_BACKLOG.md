# Release backlog

Unreleased changes ready to ship.

## Ready (main)

### Uncommitted

(none)

## Shipped

### v1.16.0 (2026-03-21)

- `feat(search): optimize command palette with FTS5 + benchmarks` — instant FTS search on keystroke, buffered snippet reads, Criterion benchmarks
- `feat(annotations): turn positive highlights into reusable taste criteria`
- `feat(cli): add margin export coaching-prompt subcommand (SAM-177)`
- `refactor(settings): rename Style Memory to Writing rules IA`

### v1.15.0 (2026-03-21)

- `feat(SAM-27): v2 push-down chrome, Cmd+K palette, sidebar removal` — new chrome bar, Raycast-style command palette
- `feat: redesign command palette as Raycast-style two-column navigation hub`
- `feat: reposition FindBar as fixed gutter card (SAM-97)`
- `feat(corrections): inline Accept action for edit-type corrections (SAM-134)` — anchored to highlight
- `feat(SAM-133): add feedback_type enum to corrections schema`
- `feat(design-system): warm palette, consolidate type scale, fix WCAG contrast`
- `feat: consolidate artifact generation to single-writer CLI pattern`
- `feat(dev): add UIFork for in-app design variation testing`
- `style: apply make-interfaces-feel-better polish checklist`
- `fix: align TOC column top with document content start`
- `fix: capitalize titleBarStyle "Overlay" for Tauri v2 compatibility`
- `fix: truncate FTS5 content to 50k chars to prevent snippet() perf hang`
- `fix: exported annotations should not appear in next export`
- `fix(SAM-27): chrome bar QA fixes — palette focus, + button, ⌘O behavior`
- `fix: broken useRef patterns in AppShell (tab chrome reveal, crossfade timer leak)`
- 20+ test stability fixes (vitest worker pool, timer cleanup, fake timer isolation)

### v1.14.0 (2026-03-09)

- `feat: seed writing rules from style guide` — upload/paste style guide, LLM extraction into DB
- `feat: first-run onboarding with sample document` — WelcomeBar, OnboardingToast, sample content
- `feat: writing quality dashboard` — test run tracking, progress feedback, error surfacing
- `fix: improve style memory UI` — CorrectionsTab/RulesTab improvements, design token migration
- `fix: review fixes` — division-by-zero guard in RunButton, JSON.parse safety in dashboard, script path resolution for production builds

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
