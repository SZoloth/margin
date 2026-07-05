# Plans

Advisor output from the `improve` skill run at commit `4748020` (2026-06-11).
Non-interactive mode: top 4 findings by leverage were planned.

## Execution order

| # | Plan | Category | Priority | Effort | Risk | Status | Depends on |
|---|------|----------|----------|--------|------|--------|------------|
| 001 | [Fix CommandPalette XSS](./001-fix-command-palette-xss.md) | security | P1 | S | LOW | DONE | — |
| 002 | [Fix stale fileDocMapRef after save/rename](./002-fix-filedocmap-stale-after-save.md) | bug | P1 | S | LOW | DONE | — |
| 003 | [Upgrade dev-tool CVEs (vitest, vite, rollup)](./003-upgrade-dev-tool-cves.md) | security/deps | P2 | S | LOW | DONE | — |
| 004 | [Extract useOpenFileEvents hook from App.tsx](./004-extract-use-open-file-events-hook.md) | tech debt | P3 | S | LOW | DONE | — |

## Recommended execution order

Plans 001 and 002 are independent of each other and can run in parallel
worktrees. Plan 003 is also independent. Plan 004 is the lowest priority and
should land after the P1 fixes are merged.

```
001 ─┐
     ├─→ merge to main
002 ─┘
003 ──→ merge to main
004 ──→ merge to main (after 001+002)
```

## Dependency graph

No plan depends on another. The ordering above is by priority, not technical
dependency.

## What was audited

**Audited directly** (all nine categories per the audit playbook):
- Correctness/bugs: `useDocument.ts`, `files.rs`, `search.rs`, App.tsx effects
- Security: all `dangerouslySetInnerHTML` call sites, mdfind query construction, SQLite schema
- Dependencies: `pnpm audit` on root + mcp workspaces
- Test coverage: all 41 test files inventoried; hook coverage mapped
- Tech debt: App.tsx structure, module duplication (`sanitizeSnippet`)
- DX/tooling: vitest config, build pipeline, type check setup
- Architecture: hook decomposition pattern, single-writer CLI convention
- Direction: `docs/strat/product-strategy.md`, roadmap signals in codebase

**Not audited** (outside standard scope):
- Rust backend in depth beyond `commands/` (db migrations, watcher, models)
- MCP server internals beyond `pnpm audit` dependency check
- End-to-end annotation export pipeline (`export-annotations.ts` beyond skim)
- `src/playground/` (design iteration scaffolding, not production code)

## Considered and rejected

The following findings were investigated and rejected before writing plans:

| Finding | Evidence | Verdict |
|---------|----------|---------|
| mdfind blocking in search.rs | napkin entry 2026-02-26; checked search.rs | **Already fixed** in v1.16.0 (spawn_blocking added) |
| rename_file rollback gap | napkin entry 2026-02-27; checked files.rs | **Already fixed** — uses RETURNING clause for atomic update |
| writing_rules.rs formatters in `#[cfg(test)]` | napkin entry; checked writing_rules.rs | **By design** — test coverage for the format logic; not a bug |
| App.tsx god-component full decomposition | App.tsx, 1534 lines, 22 useEffects | **Scope-narrowed** — planned as Plan 004 (single self-contained extraction); full decomposition requires characterization tests first (M effort, separate plan if selected) |
| vitest UI CVE as standalone plan | pnpm audit critical | **Merged into Plan 003** with vite and rollup bumps — same PR, same test gate |

## Status key

- `TODO` — not started
- `IN PROGRESS` — executor is working on it
- `DONE` — all done criteria met, merged
- `BLOCKED` — stopped; reason noted in plan file
- `STALE` — plan target code changed; needs re-review before execution
