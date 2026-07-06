# Plan 004: Extract macOS file-open event listener into useOpenFileEvents

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4748020..HEAD -- src/App.tsx src/hooks/useFileWatcher.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — pure extraction of a self-contained useEffect; behavior is unchanged
- **Depends on**: none (plans 001–003 may land first; this is independent)
- **Category**: tech debt / test coverage
- **Planned at**: commit `4748020`, 2026-06-11

## Why this matters

`src/App.tsx` is 1534 lines with 22 `useEffect` hooks, 13 `useCallback`
handlers, and zero direct tests. Any future decomposition requires a regression
net. The macOS "Open With" event listener (lines 629–645) is the most
self-contained effect in the file: it has one external dependency
(`drainPendingOpenFiles` + `listen`), one clear input (`openFilePath`
callback), and no shared state with the rest of App. Extracting it into
`useOpenFileEvents` follows the existing `useFileWatcher` pattern exactly,
produces a testable hook, and trims 17 lines from App.tsx.

This is a first step, not the whole decomposition. It demonstrates the
extraction pattern for future work without touching the complex, coupled
effects (diff-review coordination, highlight thread events, tab restoration).

## Current state

`src/App.tsx` lines 629–645:
```typescript
// Handle files opened via macOS "Open With" / double-click
const openFilePathRef = useRef(doc.openFilePath);
openFilePathRef.current = doc.openFilePath;

useEffect(() => {
  drainPendingOpenFiles().then((paths) => {
    const lastPath = paths[paths.length - 1];
    if (lastPath) {
      void openFilePathRef.current(lastPath);
    }
  }).catch(console.error);

  const unlisten = listen<string>("open-file", (event) => {
    void openFilePathRef.current(event.payload);
  });
  return () => { void unlisten.then((fn) => fn()); };
}, []);
```

`drainPendingOpenFiles` and the `listen` import come from:
```typescript
// App.tsx line 27
import { readFile, drainPendingOpenFiles, ... } from "@/lib/tauri-commands";
// App.tsx line 28
import { listen } from "@tauri-apps/api/event";
```

The model for the new hook is `src/hooks/useFileWatcher.ts` — same pattern:
ref to stable the callback, `listen` in `useEffect`, cleanup via returned
unlisten function. Tests model after
`src/hooks/__tests__/useFileWatcher.test.ts`.

## Commands you will need

| Purpose   | Command                              | Expected on success        |
|-----------|--------------------------------------|----------------------------|
| Typecheck | `./node_modules/.bin/tsc --noEmit`   | exit 0, no errors          |
| Tests     | `pnpm test -- useOpenFileEvents`     | all pass                   |
| Full test | `pnpm test`                          | all pass                   |

## Scope

**In scope** (the only files you should modify or create):
- `src/hooks/useOpenFileEvents.ts` (create)
- `src/hooks/__tests__/useOpenFileEvents.test.ts` (create)
- `src/App.tsx` — replace the 17 lines with a single hook call

**Out of scope** (do NOT touch):
- Any other effect or callback in `src/App.tsx`
- `src/lib/tauri-commands.ts` — `drainPendingOpenFiles` signature is not changing
- Any Rust/backend code
- `useFileWatcher.ts` — do not modify; it is a reference only

## Git workflow

- Branch: `feat/004-use-open-file-events`
- Commit style: `refactor(hooks): extract useOpenFileEvents from App.tsx`
- Do NOT push or open a PR unless the operator instructed it

## Steps

### Step 1: Create `src/hooks/useOpenFileEvents.ts`

Create the file with this exact content:

```typescript
import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { drainPendingOpenFiles } from "@/lib/tauri-commands";

/**
 * Handles files opened via macOS "Open With" or Finder double-click.
 * On mount: drains any files queued before the app was ready, then
 * subscribes to subsequent "open-file" Tauri events.
 *
 * @param onOpenFile - called with the file path whenever a file is opened.
 *   Stable across renders via a ref; no need to wrap in useCallback at the
 *   call site.
 */
export function useOpenFileEvents(
  onOpenFile: (path: string) => void
): void {
  const onOpenFileRef = useRef(onOpenFile);
  onOpenFileRef.current = onOpenFile;

  useEffect(() => {
    drainPendingOpenFiles()
      .then((paths) => {
        const lastPath = paths[paths.length - 1];
        if (lastPath) {
          void onOpenFileRef.current(lastPath);
        }
      })
      .catch(console.error);

    const unlisten = listen<string>("open-file", (event) => {
      void onOpenFileRef.current(event.payload);
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);
}
```

**Verify**: `./node_modules/.bin/tsc --noEmit` → exit 0

### Step 2: Update `src/App.tsx`

Add the import. Near the existing hook imports (around line 16), add:
```typescript
import { useOpenFileEvents } from "@/hooks/useOpenFileEvents";
```

Then replace the 17-line block (lines 629–645 in the `4748020` version):
```typescript
  // Handle files opened via macOS "Open With" / double-click
  const openFilePathRef = useRef(doc.openFilePath);
  openFilePathRef.current = doc.openFilePath;

  useEffect(() => {
    drainPendingOpenFiles().then((paths) => {
      const lastPath = paths[paths.length - 1];
      if (lastPath) {
        void openFilePathRef.current(lastPath);
      }
    }).catch(console.error);

    const unlisten = listen<string>("open-file", (event) => {
      void openFilePathRef.current(event.payload);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);
```

with:
```typescript
  // Handle files opened via macOS "Open With" / double-click
  useOpenFileEvents(doc.openFilePath);
```

After the replacement, check whether `drainPendingOpenFiles` is still
referenced anywhere else in App.tsx:
```bash
grep -n "drainPendingOpenFiles" src/App.tsx
```
If it returns zero matches, remove `drainPendingOpenFiles` from the import
on line 27. If it has other uses, leave the import.

Similarly check for the `listen` import:
```bash
grep -n "from \"@tauri-apps/api/event\"" src/App.tsx
```
`listen` is used in other effects in App.tsx (the file-watcher integration)
— only remove the import if `grep -n " listen" src/App.tsx` shows no
remaining calls.

**Verify**: `./node_modules/.bin/tsc --noEmit` → exit 0

### Step 3: Write tests for `useOpenFileEvents`

Create `src/hooks/__tests__/useOpenFileEvents.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOpenFileEvents } from "../useOpenFileEvents";

// Mock drainPendingOpenFiles
const mockDrain = vi.fn();
vi.mock("@/lib/tauri-commands", () => ({
  drainPendingOpenFiles: (...args: unknown[]) => mockDrain(...args),
}));

// Mock listen
const mockUnlisten = vi.fn();
let capturedListener: ((event: { payload: string }) => void) | null = null;
const mockListen = vi
  .fn()
  .mockImplementation(
    (_event: string, handler: (event: { payload: string }) => void) => {
      capturedListener = handler;
      return Promise.resolve(mockUnlisten);
    }
  );
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

/** Flush the microtask queue. */
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("useOpenFileEvents", () => {
  beforeEach(() => {
    mockDrain.mockReset();
    mockListen.mockClear();
    mockUnlisten.mockClear();
    capturedListener = null;
  });

  it("drains pending files on mount and calls onOpenFile with last path", async () => {
    mockDrain.mockResolvedValue(["/a.md", "/b.md"]);
    const onOpenFile = vi.fn();
    renderHook(() => useOpenFileEvents(onOpenFile));

    await act(async () => {
      await flush();
    });

    // Last path wins
    expect(onOpenFile).toHaveBeenCalledWith("/b.md");
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it("does nothing when drain returns empty array", async () => {
    mockDrain.mockResolvedValue([]);
    const onOpenFile = vi.fn();
    renderHook(() => useOpenFileEvents(onOpenFile));

    await act(async () => {
      await flush();
    });

    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("calls onOpenFile when open-file event fires", async () => {
    mockDrain.mockResolvedValue([]);
    const onOpenFile = vi.fn();
    renderHook(() => useOpenFileEvents(onOpenFile));

    await act(async () => {
      await flush();
    });

    expect(capturedListener).not.toBeNull();

    act(() => {
      capturedListener!({ payload: "/from-finder.md" });
    });

    await act(async () => {
      await flush();
    });

    expect(onOpenFile).toHaveBeenCalledWith("/from-finder.md");
  });

  it("cleanup: unlisten called on unmount", async () => {
    mockDrain.mockResolvedValue([]);
    const onOpenFile = vi.fn();
    const { unmount } = renderHook(() => useOpenFileEvents(onOpenFile));

    await act(async () => {
      await flush();
    });

    unmount();

    await act(async () => {
      await flush();
    });

    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("uses latest onOpenFile ref — stale closure does not fire old callback", async () => {
    mockDrain.mockResolvedValue([]);
    const firstCb = vi.fn();
    const secondCb = vi.fn();

    const { rerender } = renderHook(
      ({ cb }: { cb: (p: string) => void }) => useOpenFileEvents(cb),
      { initialProps: { cb: firstCb } }
    );

    await act(async () => {
      await flush();
    });

    // Update the callback
    rerender({ cb: secondCb });

    act(() => {
      capturedListener!({ payload: "/new-file.md" });
    });

    await act(async () => {
      await flush();
    });

    // Should have called the NEW callback, not the original
    expect(secondCb).toHaveBeenCalledWith("/new-file.md");
    expect(firstCb).not.toHaveBeenCalledWith("/new-file.md");
  });
});
```

**Verify**: `pnpm test -- useOpenFileEvents` → all 5 tests pass

### Step 4: Full test suite

```bash
pnpm test
```

All tests pass, including the 5 new `useOpenFileEvents` tests.

## Done criteria

- [ ] `./node_modules/.bin/tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0, 5 new `useOpenFileEvents` tests pass
- [ ] `grep -c "useOpenFileEvents" src/App.tsx` returns 2 (import + call site)
- [ ] `grep -c "drainPendingOpenFiles" src/App.tsx` returns 0 (moved to hook)
- [ ] `wc -l src/App.tsx` shows ≤1520 lines (net reduction of ~15 lines)
- [ ] `src/hooks/useOpenFileEvents.ts` exists and exports `useOpenFileEvents`
- [ ] `src/hooks/__tests__/useOpenFileEvents.test.ts` exists with 5 tests
- [ ] Only the three in-scope files are modified/created (`git status`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- `src/App.tsx` lines 629–645 do not match the excerpt (the effect was already moved or refactored)
- `drainPendingOpenFiles` is used elsewhere in App.tsx — leave the import in place and note it in the commit
- TypeScript errors in App.tsx after the replacement (the remaining `listen` import may need to stay if other effects use it — check before removing)

## Maintenance notes

- `useOpenFileEvents` is intentionally mounted-once (empty dep array). It
  models the macOS convention that "Open With" opens into the same running
  app rather than launching a new one. Do not add `doc.openFilePath` to the
  dependency array — the ref pattern is deliberate.
- Future App.tsx extractions to consider after this lands:
  - `useHighlightEvents` (lines 659–720): highlight click + delete event
    coordination — currently coupled to `highlightsRef`, `setAnchorRect`,
    `setFocusHighlightId`. Will require passing more state through the hook
    interface; plan carefully.
  - Diff-review event coordination (lines 583–627): tightly coupled to
    `editorRef`, `diffReviewRef`, `currentDocRef`. Requires those refs to be
    passed in or maintained in the hook; M effort.
- The pattern for all App.tsx hook extractions: (1) stable the callback via a
  ref inside the new hook, (2) keep the dep array minimal (usually `[]` for
  once-mounted effects), (3) write the test before the extraction.
