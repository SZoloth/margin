import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

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

afterEach(() => {
  cleanup();
});
