# Fresh-user QA, October 2026

Date: 2026-10-09. Branch `fix/consumer-first-run`. Tested against a release build of main (`9c37fac`), launched with `HOME` pointed at an empty scratch folder so a stranger's first launch could be simulated without touching Sam's `~/.margin`.

**Method limit:** computer-use access to Margin was declined, so this pass didn't click through the UI. Findings come from the fresh-install database, the contents of the app bundle, the code paths a new user reaches, and the test suites. A hands-on click-through of onboarding, highlighting, notes, and export is still owed.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Blocker | Every new install was seeded with 21 "voice-calibration" rules taken from Sam's personal texting style (period frequency, "haha" vs "lol", sign-offs). A stranger's AI exports would imitate Sam's voice, and Sam's messaging statistics shipped to every user. This has been in public builds since v1.8.0. | **Fixed** (`022384e`). New installs start with an empty voice profile. Existing databases keep their rules. |
| 2 | Blocker | The `margin` CLI does all writing-rules exports, but the app bundle didn't include it. It was found only at `~/.local/bin/margin` or on `PATH`, so for anyone but Sam, Export failed with "Could not resolve margin CLI" and automatic exports failed silently. | **Fixed.** `src-tauri/build.rs` builds `cli/` as a `margin-cli` sidecar, `tauri.conf.json` bundles it through `externalBin`, and the app prefers the bundled copy. Verified that `Margin.app/Contents/MacOS/margin-cli` exists and exports in a fresh home folder. |
| 3 | Blocker (consent) | Every export, including the automatic one after each correction, wrote `~/.claude/hooks/writing_guard.py` and, if `~/.codex` existed, `~/.codex/AGENTS.md`. Neither was announced. A consumer app must not edit other apps' configuration without asking. | **Fixed.** New "Writing guard" toggle in Settings → Integrations, off by default. While it's off, exports write only `~/.margin/writing-rules.md` (new CLI `--target markdown`). Users whose earlier Margin already wrote the guard stay opted in, so Sam's setup doesn't change. The setting lives in `~/.margin/agent-integration`. |
| 4 | Accessibility | The Claude Desktop switch had no accessible name, so VoiceOver read it as an unnamed switch. | **Fixed.** `SettingRow` gained a `labelId`, and both switches now use `aria-labelledby`. |
| 5 | Blocker | The "Claude Desktop" integration points at `Resources/mcp/dist/index.js` and runs it with `node`. The bundle contains no `mcp/` folder, and most users don't have Node installed. Turning the toggle on writes a Claude config entry that can't start. | **Open.** Needs a decision: compile the MCP server to a single binary (for example `bun build --compile`) and ship it as a second sidecar, or hide the toggle in release builds. Before it ships, `mcp/src/index.ts` must respect the Writing guard setting: its automatic export runs `margin export profile` with no target, which writes `~/.claude` even when the switch is off. |
| 6 | Polish | Downloads are Apple Silicon only (`aarch64` DMG). Intel Macs get no build. | Open. A universal build is a one-line target change, at the cost of CI time. |
| 7 | Polish | The `/margin` download page doesn't exist yet. | Open (see SHAREABLE-PLAN.md). |

## Verification

- Rust: `cargo test --lib`, 256 passed (four new tests: bundled CLI lookup, integration off for a new user, on for an existing guard, explicit setting wins).
- Go: `go test ./...` passes, including the new `TestExportProfileMarkdownTargetTouchesNoAgentConfig`. `go vet` is clean.
- Frontend: `pnpm test`, 356 passed. `pnpm tsc --noEmit` is clean.
- Bundle: `pnpm tauri build --bundles app` produces `Contents/MacOS/margin` and `margin-cli`.
- Fresh install, launched with an empty `HOME`: no voice-calibration rules; `margin-cli export profile --target markdown` writes the profile; no `~/.claude` folder is created.
- Clippy (`-D warnings`) reports 12 findings, all in older code (`corrections.rs`, `dashboard.rs`, older functions in `writing_rules.rs` and `migrations.rs`). None are in lines this branch adds. CI's clippy step pipes through `tee`, which hides its exit code.
