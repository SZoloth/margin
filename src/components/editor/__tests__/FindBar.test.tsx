import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import type { SearchStorage, SearchResult } from "../extensions/search";

// @hugeicons/core-free-icons is a 41k-line CJS bundle — loading it in a worker
// thread causes a startup timeout before any test code runs. Icon rendering is
// not under test.
vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: () => null,
}));
vi.mock("@hugeicons/core-free-icons", () => ({
  ArrowUp02Icon: {},
  ArrowDown02Icon: {},
  Cancel01Icon: {},
}));

import { FindBar } from "../FindBar";

/**
 * Minimal editor mock that mirrors the real search extension contract:
 * commands mutate `storage.search` and emit a "transaction" event. The bug
 * this guards: FindBar read storage during render but never subscribed, so
 * nextMatch()/prevMatch() left the counter stale.
 */
function createMockEditor() {
  const listeners: Record<string, Array<() => void>> = {};
  const search: SearchStorage = {
    results: [],
    activeIndex: -1,
    searchTerm: "",
  };
  const emit = (event: string) => {
    for (const fn of listeners[event] ?? []) fn();
  };
  return {
    storage: { search },
    emit,
    on: (event: string, fn: () => void) => {
      (listeners[event] ??= []).push(fn);
    },
    off: (event: string, fn: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
    },
    commands: {
      setSearchTerm: vi.fn(),
      clearSearch: vi.fn(),
      nextMatch: () => {
        search.activeIndex = (search.activeIndex + 1) % search.results.length;
        emit("transaction");
        return true;
      },
      prevMatch: () => {
        search.activeIndex =
          (search.activeIndex - 1 + search.results.length) % search.results.length;
        emit("transaction");
        return true;
      },
    },
  };
}

const RESULTS: SearchResult[] = [
  { from: 0, to: 4 },
  { from: 10, to: 14 },
  { from: 20, to: 24 },
];

describe("FindBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates the match counter when next/prev navigation fires transactions", () => {
    const editor = createMockEditor();
    render(<FindBar editor={editor as unknown as Editor} isOpen onClose={() => {}} />);

    // Simulate a completed search: 3 matches, first active
    act(() => {
      editor.storage.search.results = RESULTS;
      editor.storage.search.activeIndex = 0;
      editor.emit("transaction");
    });
    expect(screen.getByText("1 of 3")).toBeTruthy();

    act(() => {
      editor.commands.nextMatch();
    });
    expect(screen.getByText("2 of 3")).toBeTruthy();

    act(() => {
      editor.commands.nextMatch();
    });
    expect(screen.getByText("3 of 3")).toBeTruthy();

    // Wraps around
    act(() => {
      editor.commands.nextMatch();
    });
    expect(screen.getByText("1 of 3")).toBeTruthy();

    act(() => {
      editor.commands.prevMatch();
    });
    expect(screen.getByText("3 of 3")).toBeTruthy();
  });

  it("clears the counter when results are removed", () => {
    const editor = createMockEditor();
    render(<FindBar editor={editor as unknown as Editor} isOpen onClose={() => {}} />);

    act(() => {
      editor.storage.search.results = RESULTS;
      editor.storage.search.activeIndex = 0;
      editor.emit("transaction");
    });
    expect(screen.getByText("1 of 3")).toBeTruthy();

    act(() => {
      editor.storage.search.results = [];
      editor.storage.search.activeIndex = -1;
      editor.emit("transaction");
    });
    expect(screen.queryByText(/of 3/)).toBeNull();
  });
});
