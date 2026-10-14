# Correction Capture

Every highlight can carry editorial judgment: a polarity (corrective or positive) and a rationale.
When `persistCorrections` is enabled in Writing settings, saving a polarity or rationale calls
`sync_feedback_signal` immediately — the correction enters SQLite before export. This is the
"local learning on by default" invariant. Editing the rationale updates the current unsynthesized
signal row; feedback after synthesis creates a new event.

## Sub-features

- Tag a highlight as **corrective** ("never do this") or **positive** ("emulate this")
- Add a **rationale** text note explaining the correction
- `sync_feedback_signal` fires immediately when polarity or rationale is saved (not on export)
- `persistCorrections` setting toggles local learning (default: on)
- Corrections panel (`CorrectionsPanel.tsx`) shows all saved corrections
- Export for synthesis: `StyleMemorySection` exports corrections as JSONL for Claude synthesis

## How to get to it

From a highlight thread (see text-annotation.md for how to open one):
1. The thread shows the highlighted text excerpt at the top
2. Below the note textarea, radio buttons appear for intent: **Corrective** or **Positive**
3. Select an intent — this immediately calls `syncFeedbackSignal` (if `persistCorrections` is on)
4. The rationale field accepts free text
5. Open Settings → Style Memory (`Ctrl+Shift+M`) to see all saved corrections

## Driving it with Vitest + RTL

**Preconditions:**
- Import `HighlightThread`; mock `syncFeedbackSignal` via `vi.mock("@/lib/tauri-commands")`
- The `onSetPolarity` prop is called when the user selects an intent radio button
- The `onUpdateRationale` prop is called when the rationale input changes

- **Action: verify intent radiogroup exists** → render HighlightThread → **Observable result:** `document.body.querySelector('[role="radiogroup"][aria-label="Note intent"]')` is truthy

- **Action: verify corrective and positive radio options** → after render → **Observable result:** two elements with `role="radio"` are present inside the radiogroup

- **Action: set polarity to corrective** → `fireEvent.click` on the corrective radio → **Observable result:** `onSetPolarity` called with `(highlightId, "corrective")`; in the real app, `syncFeedbackSignal` is invoked with `polarity="corrective"`

- **Action: set polarity to positive** → `fireEvent.click` on the positive radio → **Observable result:** `onSetPolarity` called with `(highlightId, "positive")`

- **Action: verify polarity persists to feedback signal** → in `useAnnotations.test.ts`, mock `invoke("sync_feedback_signal", ...)` → call `syncFeedbackSignal(highlightId, "corrective", rationale)` → **Observable result:** `invoke` called with `{ command: "sync_feedback_signal", args: { highlightId, polarity: "corrective", rationale } }`

**Run correction capture tests:**
```bash
cd /workspace && pnpm test:frontend -- --reporter=verbose \
  src/components/editor/__tests__/HighlightThread.test.tsx \
  src/hooks/__tests__/useAnnotations.test.ts
```

**Expected output includes:**
```
✓ applies highlight color to excerpt border
```
(Full correction-capture assertions live in the HighlightThread component test.)

**Run annotation export tests:**
```bash
cd /workspace && pnpm test:frontend -- --reporter=verbose \
  src/components/editor/__tests__/ExportAnnotationsPopover.test.tsx \
  src/lib/__tests__/export-annotations-intent.test.ts
```

## Gotchas

- `persistCorrections` is a **user setting** defaulting to `true`. Tests that exercise `syncFeedbackSignal` must pass `persistCorrections={true}` as a prop to `HighlightThread` (or ensure the setting is on in the test context).
- `syncFeedbackSignal` is called for **both** polarity changes AND rationale changes — two separate code paths in `App.tsx` (one `onSetPolarity` handler and one `onUpdateRationale` handler). Both call `syncFeedbackSignal` with the latest combined state.
- The `polarityMap` and `rationaleMap` live in `App.tsx` state (not in the hook). They are cleared on export via `setPolarityMap(new Map())`.
- In the browser stub (`core.ts`), `sync_feedback_signal` returns `true` — no actual DB write.
- After synthesis, corrections become "synthesized" — new feedback on the same highlight creates a **new** event row, not an update. The invariant is: one unsynthesized row per highlight; synthesis does not destroy event history.
- The `CorrectionsPanel` component (`src/components/corrections/CorrectionsPanel.tsx`) is a `role="dialog"` accessed via keyboard shortcut — it's not driven via the settings page. Check `aria-label="Corrections"`.
