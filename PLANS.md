# Execution Plan

Keep this file as the live working memory for non-trivial tasks.
Replace the active task section when new substantial work starts.

## Active Work

### Task

Autoresearch optimization: 4-agent research fan-out synthesized into
`docs/research/autoresearch-synthesis-2026-09-12.md`; eval-fidelity fixes
landed; re-baselining on the repaired harness.

### Done this session

- Research synthesis committed — ranked P0-P3 backlog combining vault,
  GitHub stars (503), X bookmarks, Deft/Every/DSPy literature, and a repo
  audit that found the eval was scoring ~4%-recall proxy on dirty data.
- Eval fidelity landed (8b83e3e): restored 6 lost Tier-2a checks, slop
  scoring via detection_pattern, prod-parity correction/rule filters in
  all generators, REGISTER_MAP aligned to production, per_type in
  EvalResult.
- Loop fixes (eead928, 7dac0e7): provider-scoped best (poolside runs were
  auto-reverted vs claude-era 0.889) + last-eval.json feedback channel
  (violations + per-type scores now reach the mutating agent).
- First poolside loop run completed: run 24 KEPT as the provider baseline
  (0.37); earlier runs 22-23 correctly reverted.
- a84ad78: typeConstraint length bounds ported to all generators;
  `--arch skill` wired into eval.ts (production path now scorable);
  ideas.md consolidated as the single backlog.

### Next (mission order)

1. Re-baseline archs on repaired harness (null + a running; then c/e/d
   confirm under new checker) — experiment-log rankings are suspect.
2. SAM-1134: second-provider comparison (needs claude/codex auth or codex
   CLI upgrade for gpt-6-astra) → then mark Proof gate.
3. DB repair: 43 auto-synthesized rules have inverted example_before —
   excluded from eval, still in production loads.
4. Scenario B (corrections + top-10 rules) — the synthesis's #1 untested
   architecture.
5. SAM-135 conversational feedback — biggest consumer feature.

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

