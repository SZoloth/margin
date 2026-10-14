# Style Memory

Style Memory is the panel where users review and manage their accumulated editorial feedback.
It has two tabs: **Corrections** (saved correction signals waiting for synthesis) and **Rules**
(synthesized writing rules). Accessed via `Ctrl+Shift+M` or Settings → Style Memory.

## Sub-features

- **Corrections tab**: list all unsynthesized corrections; filter by writing type; tag writing type; delete individual corrections; bulk delete; export for Claude synthesis (JSONL to clipboard)
- **Rules tab**: list all synthesized writing rules; filter by category/severity; edit rule text; delete rules
- **Export for synthesis CTA**: when unsynthesized corrections exist, a button exports them to clipboard as JSONL for Claude to synthesize into rules
- **Stats display**: total corrections count, document count, untagged count, unsynthesized count
- **Auto-export writing rules**: after export, the app auto-calls `exportWritingRules` to update `~/.margin/writing-rules.md` and the writing guard hook (Tauri only)

## How to get to it

1. Press `Ctrl+Shift+M` — opens the settings overlay directly to the Style Memory section
2. Or: click the gear icon (Settings) → navigate to "Style Memory" in the left nav
3. The Style Memory section shows two tabs: "Corrections" and "Rules"

## Driving it with Vitest + RTL

**Preconditions:**
- Stub `@/components/style-memory/CorrectionsTab` and `@/components/style-memory/RulesTab` to avoid collisions in `vmThreads` shared module registry (see `StyleMemorySection.test.tsx`)
- Mock `@/lib/tauri-commands`: `exportCorrectionsJson`, `markCorrectionsUnsynthesized`, `seedRulesFromGuide`, `openStyleGuideDialog`, `getWritingRules`

- **Action: render StyleMemorySection** → `render(<StyleMemorySection />)` → **Observable result:** `screen.getByRole("tablist", { name: "Writing rules sections" })` is present; two tab buttons visible

- **Action: verify corrections tab is default** → after render and stats update → **Observable result:** `screen.getByRole("tabpanel")` with `aria-labelledby` pointing to the corrections tab ID is visible

- **Action: trigger synthesis export** → `userEvent.click(screen.getByRole("button", { name: /export/i }))` → **Observable result:** `exportCorrectionsJson` called; `writeText` (clipboard) called with JSONL content

- **Action: verify export CTA disappears after export** → after calling `exportCorrectionsJson` resolves → **Observable result:** the export CTA button is no longer in the DOM (hidden per `shouldClearAnnotationsAfterExport` logic)

- **Action: switch to Rules tab** → `userEvent.click(screen.getByRole("tab", { name: /rules/i }))` → **Observable result:** the Rules tabpanel becomes visible

**Run Style Memory tests:**
```bash
cd /workspace && pnpm test:frontend -- --reporter=verbose \
  src/components/settings/__tests__/StyleMemorySection.test.tsx
```

**Expected output:**
```
✓ hides export CTA after successful synthesis export of all pending corrections
```

**Run full settings tests:**
```bash
cd /workspace && pnpm test:frontend -- --reporter=verbose \
  src/components/settings/__tests__/SettingsPage.test.tsx \
  src/components/settings/__tests__/WritingSection.test.tsx
```

## Gotchas

- `StyleMemorySection.test.tsx` mocks `CorrectionsTab` and `RulesTab` with different factory shapes than the other test files that mock `@/lib/tauri-commands`. This is why the vitest sequencer (`HookFirstSequencer`) forces `StyleMemorySection.test` to run **first** via `mustRunFirst.unshift(f)`. If you add new tests that also mock `@/lib/tauri-commands`, follow this pattern.
- The "export CTA" hides when `correctionCount >= unsynthesizedCount` after a successful export. The test relies on a real `window.setTimeout(6000)` for the toast. Because of this, `StyleMemorySection.test.tsx` runs before `useSettings.test.tsx` and `DiffBanner.test.tsx` which are in `preFirst` — if the order changes, the real timer bleeds into the next file.
- `auto-export writing rules` (`exportWritingRules()`) fires after corrections are exported. In browser stub mode it calls `invoke("export_writing_rules")` which returns `{ markdownPath: "", hookPath: "", ruleCount: 0 }` — no filesystem writes.
- Rules are stored in SQLite. In browser stub mode, `get_writing_rules` returns `[]` (empty). The Rules tab will show an empty state unless you mock the return.
- Style Memory is reached via `Ctrl+Shift+M` shortcut, which sets `settingsSection = "style-memory"` and `showSettings = true` in `App.tsx`. The settings overlay covers the full viewport.
