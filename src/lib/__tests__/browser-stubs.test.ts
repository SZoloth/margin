import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the mock invoke dispatcher directly
// These stubs are used when running `pnpm dev` (no Tauri runtime)

let mockInvoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
let mockListen: (event: string, handler: (...args: unknown[]) => void) => Promise<() => void>;
let mockEmit: () => Promise<void>;
let mockGetCurrentWindow: () => {
  setTitle: () => Promise<void>;
  onFocusChanged: (cb: (focused: boolean) => void) => Promise<() => void>;
};
let mockStat: (path: string) => Promise<{ isFile: boolean; mtime: Date | null }>;
let resetStubs: () => void;

beforeEach(async () => {
  const core = await import("../browser-stubs/core");
  mockInvoke = core.invoke;
  resetStubs = core.__resetForTests;
  resetStubs();

  const event = await import("../browser-stubs/event");
  mockListen = event.listen;
  mockEmit = event.emit;

  const window = await import("../browser-stubs/window");
  mockGetCurrentWindow = window.getCurrentWindow;

  const fs = await import("../browser-stubs/fs");
  mockStat = fs.stat;
});

describe("browser mock invoke", () => {
  it("returns Document[] for get_recent_documents", async () => {
    const result = await mockInvoke("get_recent_documents");
    expect(Array.isArray(result)).toBe(true);
    const docs = result as Array<Record<string, unknown>>;
    expect(docs.length).toBeGreaterThan(0);
    const doc = docs[0];
    expect(doc).toHaveProperty("id");
    expect(doc).toHaveProperty("source");
    expect(doc).toHaveProperty("title");
    expect(doc).toHaveProperty("word_count");
    expect(doc).toHaveProperty("last_opened_at");
    expect(doc).toHaveProperty("created_at");
  });

  it("returns IndexAllResult for index_all_documents", async () => {
    const result = (await mockInvoke("index_all_documents")) as Record<string, unknown>;
    expect(result).toHaveProperty("indexed");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("errors");
    expect(typeof result.indexed).toBe("number");
  });

  it("returns PersistedTab[] for get_open_tabs", async () => {
    const result = await mockInvoke("get_open_tabs");
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(0);
  });

  it("returns Highlight[] for get_highlights", async () => {
    const result = await mockInvoke("get_highlights", { documentId: "sample-doc" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns MarginNote[] for get_margin_notes", async () => {
    const result = await mockInvoke("get_margin_notes", { documentId: "sample-doc" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("CRUDs highlights in memory", async () => {
    const created = (await mockInvoke("create_highlight", {
      documentId: "doc-1",
      color: "yellow",
      textContent: "test highlight",
      fromPos: 0,
      toPos: 14,
      prefixContext: null,
      suffixContext: null,
    })) as Record<string, unknown>;

    expect(created).toHaveProperty("id");
    expect(created.document_id).toBe("doc-1");
    expect(created.color).toBe("yellow");
    expect(created.text_content).toBe("test highlight");

    // Read back
    const highlights = (await mockInvoke("get_highlights", {
      documentId: "doc-1",
    })) as Array<Record<string, unknown>>;
    expect(highlights.some((h) => h.id === created.id)).toBe(true);

    // Delete
    await mockInvoke("delete_highlight", { id: created.id });
    const after = (await mockInvoke("get_highlights", {
      documentId: "doc-1",
    })) as Array<Record<string, unknown>>;
    expect(after.some((h) => h.id === created.id)).toBe(false);
  });

  it("CRUDs margin notes in memory", async () => {
    const created = (await mockInvoke("create_margin_note", {
      highlightId: "hl-1",
      content: "my note",
    })) as Record<string, unknown>;

    expect(created).toHaveProperty("id");
    expect(created.highlight_id).toBe("hl-1");
    expect(created.content).toBe("my note");

    // Read back
    const notes = (await mockInvoke("get_margin_notes", {
      documentId: "any",
    })) as Array<Record<string, unknown>>;
    expect(notes.some((n) => n.id === created.id)).toBe(true);

    // Update
    await mockInvoke("update_margin_note", {
      id: created.id,
      content: "updated note",
    });
    const updated = (await mockInvoke("get_margin_notes", {
      documentId: "any",
    })) as Array<Record<string, unknown>>;
    const found = updated.find((n) => n.id === created.id) as Record<string, unknown>;
    expect(found.content).toBe("updated note");

    // Delete
    await mockInvoke("delete_margin_note", { id: created.id });
    const after = (await mockInvoke("get_margin_notes", {
      documentId: "any",
    })) as Array<Record<string, unknown>>;
    expect(after.some((n) => n.id === created.id)).toBe(false);
  });

  it("returns string[] for drain_pending_open_files", async () => {
    const result = await mockInvoke("drain_pending_open_files");
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns undefined + warns for unknown commands", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await mockInvoke("nonexistent_command_xyz");
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("nonexistent_command_xyz"),
    );
    warnSpy.mockRestore();
  });

  it("returns markdown string for read_file", async () => {
    const result = await mockInvoke("read_file", { path: "/any/path.md" });
    expect(typeof result).toBe("string");
    expect((result as string).length).toBeGreaterThan(0);
  });

  it("delete_all_highlights_for_document clears highlights for a doc", async () => {
    await mockInvoke("create_highlight", {
      documentId: "doc-clear",
      color: "blue",
      textContent: "text",
      fromPos: 0,
      toPos: 4,
      prefixContext: null,
      suffixContext: null,
    });

    const before = (await mockInvoke("get_highlights", {
      documentId: "doc-clear",
    })) as unknown[];
    expect(before.length).toBeGreaterThan(0);

    await mockInvoke("delete_all_highlights_for_document", {
      documentId: "doc-clear",
    });

    const after = (await mockInvoke("get_highlights", {
      documentId: "doc-clear",
    })) as unknown[];
    expect(after.length).toBe(0);
  });

  it("returns correct shapes for snapshot commands", async () => {
    const saveResult = await mockInvoke("save_content_snapshot", {
      documentId: "doc-1",
      content: "content",
      snapshotType: "manual",
    });
    expect(typeof saveResult).toBe("string");

    const getResult = await mockInvoke("get_content_snapshot", {
      documentId: "doc-1",
      snapshotType: "manual",
    });
    expect(getResult === null || typeof getResult === "string").toBe(true);
  });

  it("returns empty arrays for correction commands", async () => {
    expect(await mockInvoke("get_all_corrections")).toEqual([]);
    expect(await mockInvoke("get_corrections_count")).toBe(0);
    expect(await mockInvoke("get_corrections_by_document")).toEqual([]);
    expect(await mockInvoke("get_corrections_flat")).toEqual([]);
  });

  it("returns empty arrays for writing rules commands", async () => {
    expect(await mockInvoke("get_writing_rules")).toEqual([]);
    const exportResult = (await mockInvoke("export_writing_rules")) as Record<string, unknown>;
    expect(exportResult).toHaveProperty("markdownPath");
    expect(exportResult).toHaveProperty("hookPath");
    expect(exportResult).toHaveProperty("ruleCount");
    expect(exportResult.ruleCount).toBe(0);
  });
});

describe("browser mock listen", () => {
  it("returns Promise<() => void>", async () => {
    const unlisten = await mockListen("file-changed", () => {});
    expect(typeof unlisten).toBe("function");
    // calling unlisten should not throw
    unlisten();
  });
});

describe("browser mock emit", () => {
  it("returns Promise<void>", async () => {
    const result = await mockEmit();
    expect(result).toBeUndefined();
  });
});

describe("browser mock getCurrentWindow", () => {
  it("setTitle returns Promise<void>", async () => {
    const win = mockGetCurrentWindow();
    const result = await win.setTitle();
    expect(result).toBeUndefined();
  });

  it("onFocusChanged returns Promise<() => void>", async () => {
    const win = mockGetCurrentWindow();
    const unlisten = await win.onFocusChanged(() => {});
    expect(typeof unlisten).toBe("function");
    unlisten();
  });
});

describe("browser mock stat", () => {
  it("returns { mtime: Date | null }", async () => {
    const result = await mockStat("/any/file");
    expect(result).toHaveProperty("isFile");
    expect(result).toHaveProperty("mtime");
    expect(result.mtime).toBeInstanceOf(Date);
  });
});
