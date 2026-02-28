// @vitest-environment jsdom
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
