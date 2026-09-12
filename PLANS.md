# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Commercialization roadmap executed in Linear: 4 milestones (Proof →
Consumer loop → Distribution → Case study), existing issues attached, gaps
filed as SAM-1134..1139.

### Done this session

- Eval harness runs end-to-end: `MARGIN_EVAL_CMD` provider abstraction,
  compliance-check arg/inflection fixes, tsx devDep + eval:* scripts.
- First real evidence committed: `baseline-poolside-2026-09-12.json` —
  coached +5.8 dim pts/sample, -0.6 mech issues; slack regresses -4
  (per-register rule loading needed → SAM-161).
- SAM-1133 done: persistent FTS failure toast + batch orphan-recovery toast.
- SAM-1132 done: orphaned Sep-4 Codex export work landed on main.
- In-app LLM pluggable: `MARGIN_LLM_CMD` for seed_rules (SAM-1136 step 1).
- codex CLI config fixed fleet-wide: `context_management = true` (flat key).

### Next (mission order)

1. SAM-1134: second-provider comparison run (needs claude/codex auth or a
   codex CLI upgrade for gpt-6-astra) → then mark Proof gate.
2. SAM-1135 cold-start: app already seeds voice/prohibition rules + has a
   style-guide import; gap is onboarding surfacing, not zero rules.
3. SAM-135 conversational feedback — biggest consumer feature.
4. SAM-1137 auto-updater — plugin already in Cargo.toml, needs wiring +
   release manifest.

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

