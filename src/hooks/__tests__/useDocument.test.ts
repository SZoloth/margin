import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDocument } from "../useDocument";

// Mock all Tauri commands
vi.mock("@/lib/tauri-commands", () => ({
  openFileDialog: vi.fn(),
  readFile: vi.fn(),
  saveFile: vi.fn().mockResolvedValue(undefined),
  upsertDocument: vi.fn().mockImplementation((doc) => Promise.resolve(doc)),
  getRecentDocuments: vi.fn().mockResolvedValue([]),
  renameFile: vi.fn(),
}));

const TEST_PATH = "/tmp/test.md";

function makeTestDoc(path = TEST_PATH) {
  return {
    id: "test-doc",
    source: "file" as const,
    file_path: path,
    keep_local_id: null,
    title: "Test",
    author: null,
    url: null,
    word_count: 5,
    last_opened_at: Date.now(),
    created_at: Date.now(),
  };
}

describe("useDocument — isSelfSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when no save has occurred", () => {
    const { result } = renderHook(() => useDocument());
    expect(result.current.isSelfSave(TEST_PATH)).toBe(false);
  });

  it("returns true after saveCurrentFile for the saved path", async () => {
    const { result } = renderHook(() => useDocument());

    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "hello world", TEST_PATH, true);
    });

    await act(async () => {
      await result.current.saveCurrentFile();
    });

    expect(result.current.isSelfSave(TEST_PATH)).toBe(true);
  });

  it("returns false for a different path", async () => {
    const { result } = renderHook(() => useDocument());

    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "hello world", TEST_PATH, true);
    });

    await act(async () => {
      await result.current.saveCurrentFile();
    });

    expect(result.current.isSelfSave("/other/file.md")).toBe(false);
  });

  it("suppresses multiple checks within the time window", async () => {
    const { result } = renderHook(() => useDocument());

    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "hello world", TEST_PATH, true);
    });

    await act(async () => {
      await result.current.saveCurrentFile();
    });

    // Multiple FS events — all should be suppressed within the window
    expect(result.current.isSelfSave(TEST_PATH)).toBe(true);
    expect(result.current.isSelfSave(TEST_PATH)).toBe(true);
    expect(result.current.isSelfSave(TEST_PATH)).toBe(true);
  });

  it("expires after the time window", async () => {
    const { result } = renderHook(() => useDocument());

    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "hello world", TEST_PATH, true);
    });

    await act(async () => {
      await result.current.saveCurrentFile();
    });

    // Advance past the 1s window
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    expect(result.current.isSelfSave(TEST_PATH)).toBe(false);
  });
});

describe("useDocument — content provider (fresh save during debounced emission)", () => {
  it("saves provider content over stale state, and markDirty enables the save", async () => {
    const { saveFile } = await import("@/lib/tauri-commands");
    const saveFileMock = vi.mocked(saveFile);
    saveFileMock.mockClear();

    const { result } = renderHook(() => useDocument());

    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "stale content", TEST_PATH, false);
    });

    // The editor emits serialized content on a debounce; between keystroke and
    // emission, state is stale and only markDirty has fired. Save must still
    // write the fresh text.
    act(() => {
      result.current.registerContentProvider(() => "fresh content from editor");
      result.current.markDirty();
    });

    await act(async () => {
      await result.current.saveCurrentFile();
    });

    expect(saveFileMock).toHaveBeenCalledTimes(1);
    expect(saveFileMock).toHaveBeenCalledWith(TEST_PATH, "fresh content from editor");
  });

  it("falls back to state content when no provider is registered", async () => {
    const { saveFile } = await import("@/lib/tauri-commands");
    const saveFileMock = vi.mocked(saveFile);
    saveFileMock.mockClear();

    const { result } = renderHook(() => useDocument());
    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "state content", TEST_PATH, true);
    });
    await act(async () => {
      await result.current.saveCurrentFile();
    });
    expect(saveFileMock).toHaveBeenCalledWith(TEST_PATH, "state content");
  });
});

describe("useDocument — isLoading with overlapping loads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Cold launch from Finder: tab restore and the queued "Open With" file load
  // at the same moment. Both finish fast, so the dim must never appear.
  it("does not stay dimmed when two fast loads overlap", async () => {
    const { readFile } = await import("@/lib/tauri-commands");
    vi.mocked(readFile).mockResolvedValue("# Doc");
    const { result } = renderHook(() => useDocument());

    await act(async () => {
      await Promise.all([
        result.current.openFilePath("/tmp/a.md"),
        result.current.openFilePath("/tmp/b.md"),
      ]);
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("stays dimmed until the last overlapping load finishes", async () => {
    const { readFile } = await import("@/lib/tauri-commands");
    let finishSlow: (v: string) => void = () => {};
    vi.mocked(readFile)
      .mockResolvedValueOnce("# Fast")
      .mockImplementationOnce(() => new Promise<string>((r) => { finishSlow = r; }));
    const { result } = renderHook(() => useDocument());

    let slow: Promise<void> = Promise.resolve();
    await act(async () => {
      const fast = result.current.openFilePath("/tmp/fast.md");
      slow = result.current.openFilePath("/tmp/slow.md");
      await fast;
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      finishSlow("# Slow");
      await slow;
    });
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useDocument — failed writes", () => {
  it("reports failure and keeps the document dirty when the write fails", async () => {
    const { saveFile } = await import("@/lib/tauri-commands");
    vi.mocked(saveFile).mockRejectedValueOnce(new Error("read-only file system"));

    const { result } = renderHook(() => useDocument());
    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "unsaved edits", TEST_PATH, true);
    });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveCurrentFile();
    });

    expect(saved).toBe(false);
    expect(result.current.isDirty).toBe(true);
  });

  it("reports success after a write", async () => {
    const { result } = renderHook(() => useDocument());
    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "edits", TEST_PATH, true);
    });
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveCurrentFile();
    });
    expect(saved).toBe(true);
    expect(result.current.isDirty).toBe(false);
  });
});

describe("useDocument — saves write exactly what the editor holds", () => {
  it("keeps literal <mark> text inside code", async () => {
    const { saveFile } = await import("@/lib/tauri-commands");
    const saveFileMock = vi.mocked(saveFile);
    saveFileMock.mockClear();
    const body = "Example:\n\n```html\n<mark>hi</mark> <marker/>\n```\n\nand `<mark>` inline.";

    const { result } = renderHook(() => useDocument());
    act(() => {
      result.current.restoreFromCache(makeTestDoc(), body, TEST_PATH, true);
    });
    await act(async () => {
      await result.current.saveCurrentFile();
    });
    expect(saveFileMock).toHaveBeenCalledWith(TEST_PATH, body);
  });

  it("refuses to save and stays dirty when the editor can't produce Markdown", async () => {
    const { saveFile } = await import("@/lib/tauri-commands");
    const saveFileMock = vi.mocked(saveFile);
    saveFileMock.mockClear();

    const { result } = renderHook(() => useDocument());
    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "older text", TEST_PATH, true);
      result.current.registerContentProvider(() => false);
    });
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveCurrentFile();
    });
    expect(saved).toBe(false);
    expect(saveFileMock).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(true);
  });

  it("does not report an article with edited text as saved", async () => {
    const { result } = renderHook(() => useDocument());
    act(() => {
      result.current.restoreFromCache({ ...makeTestDoc(), source: "keep-local", file_path: null }, "edited", null, true);
    });
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveCurrentFile();
    });
    expect(saved).toBe(false);
    expect(result.current.isDirty).toBe(true);
  });

  it("an edit made while a save is in flight stays dirty", async () => {
    const { saveFile } = await import("@/lib/tauri-commands");
    let finishWrite: () => void = () => {};
    vi.mocked(saveFile).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishWrite = resolve; }),
    );

    const { result } = renderHook(() => useDocument());
    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "first", TEST_PATH, true);
    });
    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => {
      pending = result.current.saveCurrentFile();
    });
    act(() => {
      result.current.markDirty();
    });
    await act(async () => {
      finishWrite();
      await pending;
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("switching documents during a save doesn't bring the saved one back", async () => {
    const { saveFile } = await import("@/lib/tauri-commands");
    let finishWrite: () => void = () => {};
    vi.mocked(saveFile).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishWrite = resolve; }),
    );

    const { result } = renderHook(() => useDocument());
    act(() => {
      result.current.restoreFromCache(makeTestDoc(), "first", TEST_PATH, true);
    });
    let pending: Promise<boolean> = Promise.resolve(true);
    act(() => {
      pending = result.current.saveCurrentFile();
    });
    const other = { ...makeTestDoc("/tmp/other.md"), id: "other-doc" };
    act(() => {
      result.current.restoreFromCache(other, "other", "/tmp/other.md", true);
    });
    await act(async () => {
      finishWrite();
      await pending;
    });
    expect(result.current.currentDoc?.id).toBe("other-doc");
    expect(result.current.filePath).toBe("/tmp/other.md");
    expect(result.current.isDirty).toBe(true);
  });
});
