---
name: verify-margin
description: >
  Verification skill for Margin — a local-first Markdown reader and writing-quality app built with
  Tauri v2 + React 19 + TipTap + SQLite. Primary automated surface is Vitest + @testing-library/react
  (jsdom, 294 tests). Visual surface is the Vite dev server at localhost:1420 with browser stubs.
  Use this skill when verifying annotation flows, correction capture, Style Memory, or full-text
  search after any change to src/, src-tauri/, or mcp/.
---

# verify-margin

Verification skill for **Margin** — Tauri + React reading and writing-quality app.

## Surfaces

| Surface | Description | Driveable on Linux |
|---------|-------------|-------------------|
| Desktop Tauri app | `pnpm tauri dev` — full native app with Rust backend and SQLite | No (requires display + macOS/native) |
| **Vite dev server** | `pnpm dev` → `http://localhost:1420` — React app with browser stubs (in-memory CRUD) | **Yes** |
| Vitest + RTL | `pnpm test:frontend` — 294 jsdom component/hook tests | **Yes** |
| Cargo tests | `cargo test --manifest-path src-tauri/Cargo.toml` | Yes (requires Rust) |

The driveable surface on this VM is the **Vite dev server + Vitest harness**. The Tauri app is
documented but cannot be driven here. When Tauri-only behavior must be verified, note it as
requiring manual review and report BLOCKED for automated evidence.

---

## Launch

### Start the Vite dev server

```bash
cd /workspace
pnpm dev &
VITE_PID=$!
echo "Vite PID: $VITE_PID"
```

**Ready signal:** The server prints `VITE v... ready in` and the port becomes reachable:

```bash
# Poll until port 1420 responds (up to 15s)
for i in $(seq 1 30); do
  curl -sf http://localhost:1420/ -o /dev/null && echo "ready" && break
  sleep 0.5
done
```

**Structured launch via helper (preferred):**

```bash
bash .cursor/skills/verify-margin/helpers/launch.sh
# Prints: VITE_PID=<pid>  PORT=1420  READY=true
# JSON: { "pid": <n>, "port": 1420, "ready": true }
```

**Verify it loaded the React app:**

```bash
curl -sf http://localhost:1420/ | grep -q '<div id="root">' && echo "OK"
```

### Teardown

Kill by PID only — never by process name (other pnpm processes may be running):

```bash
kill $VITE_PID
```

Or use the cleanup helper which reads the PID from `.cursor/skills/verify-margin/evidence/.vite.pid`:

```bash
bash .cursor/skills/verify-margin/helpers/cleanup.sh
```

---

## Doctor

Read-only health checks — safe to run anytime, even against a running app.

### 1. Dependencies installed

```bash
test -f /workspace/node_modules/.bin/vite && echo "OK: node_modules present" || echo "FAIL: run pnpm install"
```

### 2. TypeScript compiles

```bash
cd /workspace && pnpm tsc --noEmit 2>&1
# Expected: exits 0, no output
```

### 3. Frontend test suite passes

```bash
cd /workspace && pnpm test:frontend 2>&1 | tail -5
# Expected: "294 passed" (or higher after new tests)
```

### 4. Dev server reachable

```bash
curl -sf http://localhost:1420/ -o /dev/null && echo "UP" || echo "DOWN (start with: pnpm dev)"
```

### 5. Rust backend compiles (optional — requires cargo)

```bash
cargo check --manifest-path /workspace/src-tauri/Cargo.toml 2>&1 | tail -5
# Expected: "Finished" with no errors
```

### 6. Expected data directories (Tauri app only)

The Tauri app writes to `~/.margin/`. The dev server uses in-memory stubs — no filesystem I/O.

```bash
ls ~/.margin/margin.db 2>/dev/null && echo "DB present" || echo "DB absent (normal for dev server)"
```

### Doctor helper (JSON output)

```bash
bash .cursor/skills/verify-margin/helpers/doctor.sh
# Output: { "deps": true, "tsc": true, "tests": 294, "devServer": true }
```

---

## Drive

The primary harness is **Vitest + @testing-library/react** (jsdom). All 294 tests run against
real component code with browser stubs providing in-memory Tauri command responses.

### Run the full suite

```bash
cd /workspace && pnpm test:frontend 2>&1
```

### Run tests for a specific feature

```bash
# Text annotation
pnpm test:frontend -- --reporter=verbose src/components/editor/__tests__/HighlightThread.test.tsx

# Floating toolbar (highlight picker + note button)
pnpm test:frontend -- --reporter=verbose src/components/editor/__tests__/FloatingToolbar.test.tsx

# Style Memory (corrections + rules tabs)
pnpm test:frontend -- --reporter=verbose src/components/settings/__tests__/StyleMemorySection.test.tsx

# Annotation hooks
pnpm test:frontend -- --reporter=verbose src/hooks/__tests__/useAnnotations.test.ts

# Search
pnpm test:frontend -- --reporter=verbose src/components/editor/__tests__/search.test.tsx
```

### RTL selector reference

These are the **real selectors** from this repo's source and tests:

| Element | Selector |
|---------|----------|
| TipTap editor | `[contenteditable]` |
| Scroll container | `[data-scroll-container]` |
| Floating toolbar | `role="toolbar"` + `aria-label="Formatting and feedback"` |
| Highlight button (yellow) | `aria-label="Highlight yellow"` |
| Highlight button (green) | `aria-label="Highlight green"` |
| Highlight button (blue) | `aria-label="Highlight blue"` |
| Highlight button (pink) | `aria-label="Highlight pink"` |
| Highlight button (orange) | `aria-label="Highlight orange"` |
| Note button | `aria-label="Add note"` |
| Highlight mark in DOM | `mark[data-color]`, `mark[data-highlight-id="<id>"]` |
| Highlight thread dialog | `role="dialog"` + `aria-label="Highlight notes"` |
| Note textarea | `.thread-textarea` |
| Save note button | `.note-action-btn--primary` (text: "Save") |
| Note intent radiogroup | `role="radiogroup"` + `aria-label="Note intent"` |
| Tab bar | `role="tablist"` + `aria-label="Open documents"` |
| Individual tab | `role="tab"` |
| Close tab button | `aria-label="Close <title>"` |
| Settings button | `aria-label="Settings"` |
| Sidebar search input | `role="combobox"` + `aria-label="Open file"` |
| Search results dropdown | `role="listbox"` + `aria-label="Search results"` |
| Style Memory tablist | `aria-label="Writing rules sections"` |
| Export annotations dialog | `role="dialog"` + `aria-label="Export annotations"` |
| Unsaved changes dialog | `role="dialog"` + `aria-label="Unsaved changes"` |
| Command palette | `role="dialog"` + `aria-label="Command palette"` |
| Settings back button | `aria-label="Back to app"` |
| Table of contents | `aria-label="Table of contents"` |

### Keyboard shortcuts (usable in RTL via `fireEvent.keyDown`)

| Action | Key |
|--------|-----|
| Open file | `Ctrl+O` |
| Save file | `Ctrl+S` |
| Export annotations | `Ctrl+Shift+E` |
| Style Memory | `Ctrl+Shift+M` |
| Find in document | `Ctrl+F` |

### Driving in the Vite browser (manual or CDP — no Playwright installed)

```bash
# Open in a browser that supports CDP
google-chrome --remote-debugging-port=9222 http://localhost:1420/

# Then use the Chrome DevTools Protocol to interact
# Or just open the URL in a browser for manual verification
```

---

## Evidence

All evidence lives at: `.cursor/skills/verify-margin/evidence/`

Files survive cleanup. Cleanup never deletes the evidence directory.

### Naming convention

```
evidence/
  annotation-smoke-YYYYMMDD-HHMMSS.txt    # test run output for annotation feature
  doctor-YYYYMMDD-HHMMSS.json             # doctor check output
  full-suite-YYYYMMDD-HHMMSS.txt          # full pnpm test:frontend output
  .vite.pid                               # PID written by launch.sh, read by cleanup.sh
```

### Capture evidence

```bash
# Run annotation tests and save output
cd /workspace && pnpm test:frontend -- --reporter=verbose \
  src/components/editor/__tests__/HighlightThread.test.tsx \
  2>&1 | tee .cursor/skills/verify-margin/evidence/annotation-smoke-$(date +%Y%m%d-%H%M%S).txt

# Run full suite and save
cd /workspace && pnpm test:frontend 2>&1 \
  | tee .cursor/skills/verify-margin/evidence/full-suite-$(date +%Y%m%d-%H%M%S).txt
```

### What to check in evidence

For the annotation smoke test, the evidence file should contain:
- `✓ applies highlight color to excerpt border`
- `✓ uses yellow color for yellow highlights`
- `✓ thread header label has thread-header-label class for 11px/0.08em styling`
- `✓ save button has note-action-btn--primary class`
- A line like `4 passed` (or the number in the test file at the time)

For the full suite, check:
- `294 passed` (or higher — number grows as tests are added)
- `0 failed`

---

## Cleanup

```bash
bash .cursor/skills/verify-margin/helpers/cleanup.sh
```

The cleanup helper:
1. Reads the Vite PID from `evidence/.vite.pid`
2. Kills the process by PID (`kill $PID`)
3. Waits up to 3s for the port to release
4. Reports whether port 1420 is now free
5. Does **not** delete the evidence directory or any evidence files

Manual cleanup if the helper fails:

```bash
# Find the Vite process by port
lsof -ti :1420 | xargs kill -9 2>/dev/null || true
```

---

## Helpers

All helpers are in `.cursor/skills/verify-margin/helpers/`. Each is executable and documented here.

### `launch.sh`

Starts the Vite dev server, waits for readiness, writes PID to `evidence/.vite.pid`.

```bash
bash .cursor/skills/verify-margin/helpers/launch.sh [--port 1420] [--dry-run]
```

Options:
- `--port N` — override port (default: 1420)
- `--dry-run` — print what would be run without starting the server

Output (JSON on success):
```json
{ "pid": 12345, "port": 1420, "ready": true }
```

### `doctor.sh`

Read-only health checks. Prints JSON summary.

```bash
bash .cursor/skills/verify-margin/helpers/doctor.sh [--dry-run]
```

Output:
```json
{ "deps": true, "tsc": true, "tests": 294, "devServer": true, "rust": "skipped" }
```

### `cleanup.sh`

Kills the Vite server started by `launch.sh`. Preserves evidence directory.

```bash
bash .cursor/skills/verify-margin/helpers/cleanup.sh [--dry-run]
```

---

See also: `docs/harness-engineering.md`, `scripts/verify`
