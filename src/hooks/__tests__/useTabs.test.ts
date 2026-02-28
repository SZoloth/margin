// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabs } from "../useTabs";
import type { SnapshotData } from "../useTabs";
import type { Document } from "@/types/document";
import type { PersistedTab } from "@/types/tab";

// Mock tauri-commands
const mockGetOpenTabs = vi.fn();
const mockSaveOpenTabs = vi.fn();
const mockGetRecentDocuments = vi.fn();
const mockReadFile = vi.fn();
vi.mock("@/lib/tauri-commands", () => ({
  getOpenTabs: (...args: unknown[]) => mockGetOpenTabs(...args),
  saveOpenTabs: (...args: unknown[]) => mockSaveOpenTabs(...args),
  getRecentDocuments: (...args: unknown[]) => mockGetRecentDocuments(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Deterministic UUIDs
let uuidCounter = 0;
vi.stubGlobal("crypto", { randomUUID: () => `uuid-${++uuidCounter}` });

// Helpers
function makeDoc(id: string, title = "Doc"): Document {
  return {
    id,
    source: "file",
    file_path: `/tmp/${id}.md`,
    keep_local_id: null,
    title,
    author: null,
    url: null,
    word_count: 100,
    last_opened_at: Date.now(),
    created_at: Date.now(),
  };
}

function makePersistedTab(
  id: string,
  docId: string,
  order: number,
  active = false,
): PersistedTab {
  return {
    id,
    document_id: docId,
    tab_order: order,
    is_active: active,
    created_at: Date.now(),
  };
}

function makeSnapshotFn(): () => SnapshotData {
  return () => ({
    document: null,
    content: "",
    filePath: null,
    isDirty: false,
    highlights: [],
    marginNotes: [],
    annotationsLoaded: false,
    scrollPosition: 0,
  });
}

/** Flush all pending microtasks so async mount effects complete */
async function flushMount() {
  // Advance fake timers to resolve the setTimeout(0) inside act,
  // then flush the microtask queue for async effects.
  await act(async () => {
    vi.advanceTimersByTime(0);
    await vi.runAllTimersAsync();
  });
}

describe("useTabs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    uuidCounter = 0;
    mockGetOpenTabs.mockResolvedValue([]);
    mockSaveOpenTabs.mockResolvedValue(undefined);
    mockGetRecentDocuments.mockResolvedValue([]);
    mockReadFile.mockResolvedValue("");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Restore on mount ───────────────────────────────────────────

  describe("restore on mount", () => {
    it("restores persisted tabs with correct active tab", async () => {
      const docA = makeDoc("a", "Alpha");
      const docB = makeDoc("b", "Beta");
      mockGetOpenTabs.mockResolvedValue([
        makePersistedTab("t1", "a", 0, false),
        makePersistedTab("t2", "b", 1, true),
      ]);
      mockGetRecentDocuments.mockResolvedValue([docA, docB]);

      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      expect(result.current.tabs).toHaveLength(2);
      expect(result.current.tabs[0]!.id).toBe("t1");
      expect(result.current.tabs[1]!.id).toBe("t2");
      expect(result.current.activeTabId).toBe("t2");
      expect(result.current.isReady).toBe(true);
    });

    it("skips missing docs during restore", async () => {
      const docA = makeDoc("a", "Alpha");
      mockGetOpenTabs.mockResolvedValue([
        makePersistedTab("t1", "a", 0, true),
        makePersistedTab("t2", "missing", 1, false),
      ]);
      mockGetRecentDocuments.mockResolvedValue([docA]);

      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs[0]!.documentId).toBe("a");
      expect(result.current.isReady).toBe(true);
    });

    it("empty persisted tabs sets isReady immediately", async () => {
      mockGetOpenTabs.mockResolvedValue([]);

      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      expect(result.current.isReady).toBe(true);
      expect(result.current.tabs).toHaveLength(0);
    });

    it("preloads active tab content for file-source docs", async () => {
      const docA = makeDoc("a", "Alpha");
      mockGetOpenTabs.mockResolvedValue([
        makePersistedTab("t1", "a", 0, true),
      ]);
      mockGetRecentDocuments.mockResolvedValue([docA]);
      mockReadFile.mockResolvedValue("# Hello World");

      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const cached = result.current.getCachedTab("t1");
      expect(cached).toBeDefined();
      expect(cached!.content).toBe("# Hello World");
      expect(cached!.document).toEqual(docA);
    });
  });

  // ── Tab operations ─────────────────────────────────────────────

  describe("openTab", () => {
    it("creates a new tab", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const doc = makeDoc("a", "Alpha");
      act(() => {
        result.current.openTab(doc, "content", "/tmp/a.md");
      });

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs[0]!.documentId).toBe("a");
      expect(result.current.activeTabId).toBe("uuid-1");
    });

    it("deduplicates existing tab (switches + updates cache)", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const doc = makeDoc("a", "Alpha");
      act(() => {
        result.current.openTab(doc, "v1", "/tmp/a.md");
      });
      const tabId = result.current.tabs[0]!.id;

      act(() => {
        result.current.openTab(doc, "v2", "/tmp/a.md");
      });

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.activeTabId).toBe(tabId);
      expect(result.current.getCachedTab(tabId)!.content).toBe("v2");
    });
  });

  describe("openInActiveTab", () => {
    it("replaces active tab content", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const docA = makeDoc("a", "Alpha");
      const docB = makeDoc("b", "Beta");

      act(() => {
        result.current.openTab(docA, "contentA", "/tmp/a.md");
      });
      const tabId = result.current.tabs[0]!.id;

      act(() => {
        result.current.openInActiveTab(docB, "contentB", "/tmp/b.md");
      });

      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs[0]!.documentId).toBe("b");
      expect(result.current.tabs[0]!.title).toBe("Beta");
      expect(result.current.activeTabId).toBe(tabId);
    });

    it("deduplicates (switches to existing tab)", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const docA = makeDoc("a", "Alpha");
      const docB = makeDoc("b", "Beta");

      act(() => {
        result.current.openTab(docA, "a", null);
      });
      act(() => {
        result.current.openTab(docB, "b", null);
      });

      // Switch to A
      act(() => {
        result.current.switchTab(result.current.tabs[0]!.id);
      });
      expect(result.current.activeTabId).toBe(result.current.tabs[0]!.id);

      // openInActiveTab with B's doc — should switch to B's existing tab
      act(() => {
        result.current.openInActiveTab(docB, "b-updated", null);
      });

      expect(result.current.tabs).toHaveLength(2);
      expect(result.current.activeTabId).toBe(result.current.tabs[1]!.id);
    });
  });

  describe("switchTab", () => {
    it("snapshots current tab before switching", async () => {
      let snapshotCalls = 0;
      const snapshotFn = () => {
        snapshotCalls++;
        return {
          document: null,
          content: "",
          filePath: null,
          isDirty: false,
          highlights: [],
          marginNotes: [],
          annotationsLoaded: false,
          scrollPosition: 0,
        };
      };

      const { result } = renderHook(() => useTabs(snapshotFn));
      await flushMount();

      const docA = makeDoc("a");
      const docB = makeDoc("b");
      act(() => result.current.openTab(docA, "a", null));
      act(() => result.current.openTab(docB, "b", null));

      snapshotCalls = 0;
      act(() => {
        result.current.switchTab(result.current.tabs[0]!.id);
      });

      expect(snapshotCalls).toBe(1);
    });

    it("no-ops on same tab", async () => {
      let snapshotCalls = 0;
      const snapshotFn = () => {
        snapshotCalls++;
        return {
          document: null,
          content: "",
          filePath: null,
          isDirty: false,
          highlights: [],
          marginNotes: [],
          annotationsLoaded: false,
          scrollPosition: 0,
        };
      };

      const { result } = renderHook(() => useTabs(snapshotFn));
      await flushMount();

      const doc = makeDoc("a");
      act(() => result.current.openTab(doc, "a", null));

      snapshotCalls = 0;
      act(() => {
        result.current.switchTab(result.current.activeTabId!);
      });

      expect(snapshotCalls).toBe(0);
    });
  });

  // ── Close tab ──────────────────────────────────────────────────

  describe("closeTab", () => {
    it("clean tab closes immediately", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const doc = makeDoc("a");
      act(() => result.current.openTab(doc, "a", null));

      act(() => {
        result.current.closeTab(result.current.tabs[0]!.id);
      });

      expect(result.current.tabs).toHaveLength(0);
      expect(result.current.activeTabId).toBeNull();
    });

    it("dirty tab sets pendingCloseTabId", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const doc = makeDoc("a");
      act(() => result.current.openTab(doc, "a", null));
      const tabId = result.current.tabs[0]!.id;

      act(() => result.current.updateActiveTabDirty(true));
      act(() => result.current.closeTab(tabId));

      expect(result.current.pendingCloseTabId).toBe(tabId);
      expect(result.current.tabs).toHaveLength(1);
    });
  });

  describe("forceCloseTab", () => {
    it("removes tab + cache, selects adjacent", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const docA = makeDoc("a");
      const docB = makeDoc("b");
      const docC = makeDoc("c");
      act(() => result.current.openTab(docA, "a", null));
      act(() => result.current.openTab(docB, "b", null));
      act(() => result.current.openTab(docC, "c", null));

      // Switch to B
      const bId = result.current.tabs[1]!.id;
      act(() => result.current.switchTab(bId));

      act(() => result.current.forceCloseTab(bId));

      expect(result.current.tabs).toHaveLength(2);
      expect(result.current.tabs.find((t) => t.id === bId)).toBeUndefined();
      expect(result.current.getCachedTab(bId)).toBeUndefined();
      // Should select adjacent tab (C, which is now at index 1)
      expect(result.current.activeTabId).not.toBeNull();
    });

    it("handles last tab (activeTabId becomes null)", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const doc = makeDoc("a");
      act(() => result.current.openTab(doc, "a", null));
      const tabId = result.current.tabs[0]!.id;

      act(() => result.current.forceCloseTab(tabId));

      expect(result.current.tabs).toHaveLength(0);
      expect(result.current.activeTabId).toBeNull();
    });
  });

  describe("cancelCloseTab", () => {
    it("clears pendingCloseTabId", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      const doc = makeDoc("a");
      act(() => result.current.openTab(doc, "a", null));
      act(() => result.current.updateActiveTabDirty(true));
      act(() => result.current.closeTab(result.current.tabs[0]!.id));

      expect(result.current.pendingCloseTabId).not.toBeNull();

      act(() => result.current.cancelCloseTab());
      expect(result.current.pendingCloseTabId).toBeNull();
    });
  });

  // ── Reorder ────────────────────────────────────────────────────

  describe("reorderTabs", () => {
    it("moves tab and reassigns sequential order values", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      act(() => result.current.openTab(makeDoc("a", "A"), "a", null));
      act(() => result.current.openTab(makeDoc("b", "B"), "b", null));
      act(() => result.current.openTab(makeDoc("c", "C"), "c", null));

      // Move first to last
      act(() => result.current.reorderTabs(0, 2));

      expect(result.current.tabs[0]!.title).toBe("B");
      expect(result.current.tabs[1]!.title).toBe("C");
      expect(result.current.tabs[2]!.title).toBe("A");
      expect(result.current.tabs.map((t) => t.order)).toEqual([0, 1, 2]);
    });
  });

  // ── Update helpers ─────────────────────────────────────────────

  describe("updateActiveTabDirty", () => {
    it("updates isDirty on active tab", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      act(() => result.current.openTab(makeDoc("a"), "a", null));
      expect(result.current.tabs[0]!.isDirty).toBe(false);

      act(() => result.current.updateActiveTabDirty(true));
      expect(result.current.tabs[0]!.isDirty).toBe(true);
    });

    it("no-ops when no active tab", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      // No tabs open — should not throw
      act(() => result.current.updateActiveTabDirty(true));
      expect(result.current.tabs).toHaveLength(0);
    });
  });

  describe("updateActiveTabTitle", () => {
    it("updates title on active tab", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      act(() => result.current.openTab(makeDoc("a", "Old"), "a", null));
      act(() => result.current.updateActiveTabTitle("New Title"));

      expect(result.current.tabs[0]!.title).toBe("New Title");
    });
  });

  // ── Persist debounce ───────────────────────────────────────────

  describe("persist debounce", () => {
    it("saveOpenTabs called after 500ms, rapid ops coalesce", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      act(() => result.current.openTab(makeDoc("a"), "a", null));
      act(() => result.current.openTab(makeDoc("b"), "b", null));
      act(() => result.current.openTab(makeDoc("c"), "c", null));

      expect(mockSaveOpenTabs).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(mockSaveOpenTabs).toHaveBeenCalledTimes(1);
    });
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────

  describe("keyboard shortcuts", () => {
    it("Cmd+W closes active tab", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      act(() => result.current.openTab(makeDoc("a"), "a", null));
      expect(result.current.tabs).toHaveLength(1);

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "w", metaKey: true }),
        );
      });

      expect(result.current.tabs).toHaveLength(0);
    });

    it("Ctrl+Tab cycles forward (wraps)", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      act(() => result.current.openTab(makeDoc("a", "A"), "a", null));
      act(() => result.current.openTab(makeDoc("b", "B"), "b", null));
      act(() => result.current.openTab(makeDoc("c", "C"), "c", null));

      // Active is C (last opened). Switch to A first.
      act(() => result.current.switchTab(result.current.tabs[0]!.id));
      const [tabA, tabB, tabC] = result.current.tabs;

      expect(result.current.activeTabId).toBe(tabA!.id);

      // Ctrl+Tab → B
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true }),
        );
      });
      expect(result.current.activeTabId).toBe(tabB!.id);

      // Ctrl+Tab → C
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true }),
        );
      });
      expect(result.current.activeTabId).toBe(tabC!.id);

      // Ctrl+Tab → wraps to A
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", ctrlKey: true }),
        );
      });
      expect(result.current.activeTabId).toBe(tabA!.id);
    });

    it("Ctrl+Shift+Tab cycles backward", async () => {
      const { result } = renderHook(() => useTabs(makeSnapshotFn()));
      await flushMount();

      act(() => result.current.openTab(makeDoc("a", "A"), "a", null));
      act(() => result.current.openTab(makeDoc("b", "B"), "b", null));
      act(() => result.current.openTab(makeDoc("c", "C"), "c", null));

      // Start at A
      act(() => result.current.switchTab(result.current.tabs[0]!.id));
      const [tabA, _tabB, tabC] = result.current.tabs;

      expect(result.current.activeTabId).toBe(tabA!.id);

      // Ctrl+Shift+Tab → wraps to C
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Tab",
            ctrlKey: true,
            shiftKey: true,
          }),
        );
      });
      expect(result.current.activeTabId).toBe(tabC!.id);
    });
  });
});
