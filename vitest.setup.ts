import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, vi } from "vitest";

// Node.js 25 introduced a native localStorage stub that lacks the full Storage API.
// Redefine it with a proper in-memory implementation so tests can call localStorage.clear() etc.
if (typeof globalThis.localStorage === "undefined" || typeof (globalThis.localStorage as Storage).clear !== "function") {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
      setItem: (key: string, value: string) => { store[key] = String(value); },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      get length() { return Object.keys(store).length; },
      key: (n: number) => Object.keys(store)[n] ?? null,
    } as Storage,
  });
}

// jsdom doesn't provide ResizeObserver
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// With vmThreads pool, multiple test files run in the same worker thread and share a
// module registry. vi.mock() factories from file A can bleed into file B when both
// mock the same module (e.g. @/lib/tauri-commands) with different factory shapes.
// Calling vi.resetModules() after each file clears the module cache, so the next
// file's hoisted vi.mock() call creates a fresh module instance from its own factory.
afterAll(() => {
  vi.resetModules();
});

afterEach(async () => {
  // Discard all pending fake timers before restoring real ones. Without
  // clearAllTimers(), a fake setInterval registered in the previous test
  // (e.g. DiffBanner's 15s tick interval) survives into the next file:
  // React 19's act() sees the orphaned fake callback and spin-waits for
  // 30s until the test timeout fires.
  vi.clearAllTimers();
  // Restore real timers after every test so fake timers from one file
  // don't leak into subsequent files in the same worker thread.
  vi.useRealTimers();
  cleanup();
  // Drain stale jsdom timer callbacks left by userEvent.setup() and RTL waitFor before
  // the next test file begins. React 19's act() spin-waits for any pending callbacks,
  // hitting the 30s testTimeout. Complex tests (click + multiple waitFor) leave nested
  // callback chains that require multiple macrotask cycles to fully drain.
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
});
