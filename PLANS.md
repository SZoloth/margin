# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Reader polish + correction→rule loop closure (SAM-1141 done, SAM-1146 done).
Annotation resurfacing is live end-to-end: reviewed rules scan the open
doc, underline matches, open a margin-lane rule card, and apply one-click
fixes.

### Done this session

- SAM-1141 all 13 findings shipped (71922ac, a0b24ce): candidate promotion,
  provenance, recurrence merge, triage path, queue-count fix.
- Annotation resurfacing (dc54b10): rule-scan decoration plugin, rule card,
  one-click apply, general-type scoping, browser-stub fixture.
- Rule card reworked into margin lane (007a346…eaf9884): shared thread
  chrome, hairline in the leading, severity pill, serif-italic match echo,
  focus trap + restore, toggle-close, replace-all, case-insensitive
  literals, capitalization-preserving apply, enter/exit motion.
- Critical freeze fixed (7f22c09): open-state lives in PM plugin state —
  React never mutates PM-managed decoration DOM (was a transaction/
  MutationObserver loop).
- Reader polish: highlight entrance animation, ⌘. color cycling on open
  threads, Butterick recommended-typography preset (2ecd20e).
- Minimap rail (201f72c): doc-relative annotation ticks + viewport thumb,
  click-to-jump, portal-rendered past reader-grid opacity.
- Note peek (e08b429): hover/focus a dot fans the note's first line into
  the margin lane; mount animations give annotations a fan-in on doc open.

### Next (mission order)

1. Archive-not-delete for writing rules — deleting loses provenance
   forever; archive keeps it recoverable.
2. SAM-1134: second-provider eval — muse-null done (66.7%/45.9/14 beats
   poolside's best); muse-c running; muse-skill pending.
3. DB repair: 43 auto-synthesized rules have inverted example_before —
   excluded from eval, still in production loads.
4. SAM-135 conversational feedback — biggest consumer feature.
5. Re-grade rule card once more after latest visual pass; remaining nits:
   responsive margin-lane collapse, anchor-off-viewport dismissal.

## 2026-09-04 Codex prompt cleanup

Sam approved a compact global writing router, preservation of the full profile,
and repair of tool/model/channel conflicts in local Codex instructions.

- Reuse `FormatProfileMarkdown` for complete accepted rules and correction examples.
- Generate a bounded Codex block with the profile path and channel/approval boundaries.
- Keep direct Codex export and both profile export routes consistent and preserve user text.
- Verify with failing-first export/budget tests, all Go tests, and the installed CLI export.

### Verification and scope

Before the fix, the bounded-router test failed and direct export did not create
the referenced profile. Four local prompt checks also failed. After the fix,
`GOMAXPROCS=2 go test -p 2 ./...` passes from `cli/`; regression coverage includes
repeat export, all three export routes, accepted rule retention, candidate
exclusion, and preservation of user instructions. `git diff --check` passes.

The CLI was built and installed at `/Users/samzoloth/.local/bin/margin`, then
`margin export codex` succeeded. The live global file shrank from 130859 to
13766 bytes after removal of a duplicate tool-map entry. Content outside the generated block survived the export unchanged
apart from blank lines. The local four-check prompt suite passes. No database
rules, model defaults, app state, active tasks, or network settings were changed.

Backups and rollback details live at
`/Users/samzoloth/.codex/backups/sol-high-cleanup-20260904.obyUQR/`.
No commit or push is authorized. Full Rust/frontend verification was not run
for this Go-only change. Static/export tests do not prove model behavior;
fresh-task instruction loading and representative writing quality remain
unverified. Existing task context was not reset.

