---
name: verify-margin
description: Prove a Margin change works before calling it done. Drives the React frontend in Chromium against the browser stubs with a committed Playwright script (screenshots in light and dark, plus the backend calls each action sent), and names the lanes for Rust and for the real Tauri app on Sam's Mac. Use after any UI, hook or Tauri-command change, and when reviewing someone else's Margin diff.
---

# Verify Margin

Margin is a Tauri app. No browser tool can reach its webview. This skill gives you four lanes. Pick every lane the diff touches, run it, and paste what it printed.

| Lane | Proves | Runs where | Command |
|---|---|---|---|
| 1. Unit | Hooks, components, MCP, gap audit | Cloud or Mac | `pnpm verify:standard` |
| 2. UI drive | A user journey through the real React tree, with the backend stubbed | Cloud or Mac | `node .claude/skills/verify-margin/scripts/drive.mjs <journey>` |
| 3. Rust | Commands, migrations, SQLite | Cloud (after the apt step below) or Mac | `pnpm verify:full` |
| 4. Real app | WebKit rendering, Rust and UI together, file watcher, fonts | Sam's Mac only | `pnpm tauri dev`, then computer use on bundle id `com.samzoloth.margin` |

Lane 2 is the one that was missing. Lanes 1 and 3 existed. Lane 4 needs Sam's machine and, for a fresh-user check, the QA build in `CLAUDE.md`.

## Lane 2: drive the UI

### Launch

`drive.mjs` starts `vite --port 1420 --strictPort` itself if nothing answers at `--url` (default `http://localhost:1420`), and kills only the server it started. Pass `--keep-server` to leave it up between runs. Vite aliases every `@tauri-apps/*` import to `src/lib/browser-stubs/` when it is not a Tauri build, so the app boots on a sample draft with in-memory data. Ready means the `.ProseMirror` editor has mounted.

Playwright: cloud sessions have it preinstalled. On a Mac without it, ask Sam before installing.

### Doctor

```bash
node .claude/skills/verify-margin/scripts/drive.mjs doctor
```

Prints JSON. `editorMounted` and `stubbedBackend` must both be `true`. `stubbedBackend: false` means you are pointed at something other than the stub build, such as a Tauri dev window's port.

### Drive

```bash
node .claude/skills/verify-margin/scripts/drive.mjs list
node .claude/skills/verify-margin/scripts/drive.mjs never-write-this --theme both
node .claude/skills/verify-margin/scripts/drive.mjs highlight-and-note --out /tmp/proof
```

Exit 0 means every step ran and every expected backend call was sent. Exit 1 means a failure, listed in the JSON under `failures`. The journeys and what each proves are in [`features/`](features/README.md).

To cover a new feature, add a function to `journeys` in `drive.mjs` and a file in `features/`. Rules for a journey:

- Act the way a reader does. Select text with a real mouse drag (`dragSelect`), because the highlight thread opens on mouseup and a programmatic selection skips it. Find controls by role and accessible name, never by coordinates.
- Assert the side effect, not only the pixels. `ctx.expectCall(cmd, argsCheck)` passes only if the UI sent that Tauri command with matching arguments. The stub records every call on `window.__MARGIN_STUB_CALLS__`.
- Screenshot each state change with `ctx.shot(label)`.
- If the stub data lacks something a journey needs, the journey fails and the reason goes in that feature's Gotchas. Never weaken the journey to make it pass.

### Evidence

Each run writes to `--out` (default `$TMPDIR/margin-verify/<time>-<journey>/`): `<theme>-NN-<step>.png`, `<theme>-calls.json` (every backend command the UI sent, with `handled: false` for commands the stub doesn't implement), `<theme>-console-errors.json`, and `result.json`. Look at the screenshots yourself before you report. Cloud threads attach the ones that matter by copying them under `/mnt/project-files/`.

Two console errors are expected noise in the stub build: the refused WebSocket to `localhost:3030` (the design-playground plugin) and React's "Cannot update a component while rendering a different component" warning on load. Anything else is a finding.

### Cleanup

The script kills the Vite server it started. If you passed `--keep-server`, kill that PID yourself; never `pkill` by name, since Sam may have his own dev server running. Evidence folders are never deleted by the script.

### What lane 2 cannot prove

Chromium is not WebKit, so font rendering, `-webkit` quirks and scroll physics need lane 4. The stubs are not Rust: a journey that passes here proves the UI sent the right command, not that the command does the right thing. Pair it with a `cargo test` for that command (lane 3).

## Lane 3: Rust in the cloud

```bash
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev librsvg2-dev
```

About five minutes. `src-tauri/src/lib.rs` uses `RunEvent::Opened`, which only exists on macOS. Add a temporary `#[cfg(target_os = "macos")]` to build on Linux and never commit it.

## Lane 4: the real app

Only on Sam's Mac, through a Remote Control session or computer use. Run `pnpm tauri dev` (orange "dev" badge). Never launch `/Applications/Margin.app` or a production build against the real `~/.margin`; the `no_prod_app.py` hook blocks it. Mac disk is tight, so clean up build output afterwards.
