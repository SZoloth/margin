// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearch } from "../useSearch";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fakeSearchResult = (id: string) => ({
  documentId: id,
  title: `Doc ${id}`,
  snippet: `Snippet for ${id}`,
  rank: 1,
});

const fakeFileResult = (name: string) => ({
  path: `/tmp/${name}`,
  filename: name,
});

describe("useSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockReset();
    // Default: index_all_documents resolves immediately on mount
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents") {
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      }
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("FTS fires immediately on non-empty query, sets isSearching", async () => {
    const ftsDeferred = deferred<ReturnType<typeof fakeSearchResult>[]>();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents")
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      if (cmd === "search_documents") return ftsDeferred.promise;
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useSearch());
    // Flush mount effect
    await act(() => vi.runAllTimersAsync());

    act(() => {
      result.current.search("hello");
    });

    expect(mockInvoke).toHaveBeenCalledWith("search_documents", {
      query: "hello",
      limit: 20,
    });
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      ftsDeferred.resolve([fakeSearchResult("1")]);
      await vi.runAllTimersAsync();
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.results).toEqual([fakeSearchResult("1")]);
  });

  it("mdfind debounced 200ms, clears pending timeout on new keystroke", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents")
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      if (cmd === "search_documents") return Promise.resolve([]);
      if (cmd === "search_files_on_disk") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useSearch());
    await act(() => vi.runAllTimersAsync());

    // Type "a", wait 100ms (less than 200ms debounce)
    act(() => {
      result.current.search("a");
    });
    await act(() => vi.advanceTimersByTimeAsync(100));

    // Type "ab" before debounce fires
    act(() => {
      result.current.search("ab");
    });

    // Advance past 200ms debounce
    await act(() => vi.advanceTimersByTimeAsync(200));

    const diskCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "search_files_on_disk"
    );
    expect(diskCalls).toHaveLength(1);
    expect(diskCalls[0]![1]).toEqual({ query: "ab", limit: 20 });
  });

  it("stale FTS results ignored (searchIdRef mismatch)", async () => {
    const ftsA = deferred<ReturnType<typeof fakeSearchResult>[]>();
    const ftsB = deferred<ReturnType<typeof fakeSearchResult>[]>();
    let callCount = 0;

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents")
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      if (cmd === "search_documents") {
        callCount++;
        return callCount === 1 ? ftsA.promise : ftsB.promise;
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useSearch());
    await act(() => vi.runAllTimersAsync());

    // Search "a" then "b" quickly
    act(() => {
      result.current.search("a");
    });
    act(() => {
      result.current.search("b");
    });

    // Resolve "b" first, then "a" (out of order)
    await act(async () => {
      ftsB.resolve([fakeSearchResult("b-result")]);
      await vi.runAllTimersAsync();
    });

    expect(result.current.results).toEqual([fakeSearchResult("b-result")]);

    // Now resolve "a" — should be ignored (stale)
    await act(async () => {
      ftsA.resolve([fakeSearchResult("a-result")]);
      await vi.runAllTimersAsync();
    });

    // Still shows "b" results, "a" was ignored
    expect(result.current.results).toEqual([fakeSearchResult("b-result")]);
  });

  it("stale mdfind results ignored", async () => {
    const mdfindA = deferred<ReturnType<typeof fakeFileResult>[]>();
    const mdfindB = deferred<ReturnType<typeof fakeFileResult>[]>();
    let diskCallCount = 0;

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents")
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      if (cmd === "search_documents") return Promise.resolve([]);
      if (cmd === "search_files_on_disk") {
        diskCallCount++;
        return diskCallCount === 1 ? mdfindA.promise : mdfindB.promise;
      }
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useSearch());
    await act(() => vi.runAllTimersAsync());

    // Search "a", let debounce fire
    act(() => {
      result.current.search("a");
    });
    await act(() => vi.advanceTimersByTimeAsync(200));

    // Search "b", let debounce fire
    act(() => {
      result.current.search("b");
    });
    await act(() => vi.advanceTimersByTimeAsync(200));

    // Resolve "b" first
    await act(async () => {
      mdfindB.resolve([fakeFileResult("b.md")]);
      await vi.runAllTimersAsync();
    });

    expect(result.current.fileResults).toEqual([fakeFileResult("b.md")]);

    // Resolve "a" — stale, should be ignored
    await act(async () => {
      mdfindA.resolve([fakeFileResult("a.md")]);
      await vi.runAllTimersAsync();
    });

    expect(result.current.fileResults).toEqual([fakeFileResult("b.md")]);
  });

  it("empty query clears results and fileResults, sets isSearching=false", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents")
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      if (cmd === "search_documents")
        return Promise.resolve([fakeSearchResult("1")]);
      if (cmd === "search_files_on_disk")
        return Promise.resolve([fakeFileResult("f.md")]);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useSearch());
    await act(() => vi.runAllTimersAsync());

    // Do a search to populate results
    act(() => {
      result.current.search("hello");
    });
    await act(() => vi.advanceTimersByTimeAsync(200));
    await act(() => vi.runAllTimersAsync());

    expect(result.current.results.length).toBeGreaterThan(0);

    // Now clear with empty query
    act(() => {
      result.current.search("");
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.fileResults).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it("background indexing on mount sets isIndexing", async () => {
    const indexDeferred = deferred<{
      indexed: number;
      skipped: number;
      errors: number;
    }>();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents") return indexDeferred.promise;
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useSearch());

    // Need to flush microtasks for the mount effect to run
    await act(() => Promise.resolve());

    expect(result.current.isIndexing).toBe(true);

    await act(async () => {
      indexDeferred.resolve({ indexed: 5, skipped: 2, errors: 0 });
      await vi.runAllTimersAsync();
    });

    expect(result.current.isIndexing).toBe(false);
  });

  it("indexDocument and removeIndex invoke correctly, swallow errors", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents")
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      if (cmd === "index_document") return Promise.resolve();
      if (cmd === "remove_document_index") return Promise.reject(new Error("db error"));
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useSearch());
    await act(() => vi.runAllTimersAsync());

    // indexDocument should invoke correctly
    await act(async () => {
      await result.current.indexDocument("doc1", "Title", "Content");
    });

    expect(mockInvoke).toHaveBeenCalledWith("index_document", {
      documentId: "doc1",
      title: "Title",
      content: "Content",
    });

    // removeIndex should swallow error
    await act(async () => {
      await result.current.removeIndex("doc1");
    });

    expect(mockInvoke).toHaveBeenCalledWith("remove_document_index", {
      documentId: "doc1",
    });
    // No error thrown — swallowed
  });

  it("FTS error clears results, resets isSearching", async () => {
    let ftsCallCount = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents")
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      if (cmd === "search_documents") {
        ftsCallCount++;
        if (ftsCallCount === 1)
          return Promise.resolve([fakeSearchResult("1")]);
        return Promise.reject(new Error("FTS error"));
      }
      if (cmd === "search_files_on_disk") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { result } = renderHook(() => useSearch());
    await act(() => vi.runAllTimersAsync());

    // First search succeeds
    act(() => {
      result.current.search("hello");
    });
    await act(() => vi.runAllTimersAsync());

    expect(result.current.results).toEqual([fakeSearchResult("1")]);

    // Second search fails
    act(() => {
      result.current.search("fail");
    });
    await act(() => vi.runAllTimersAsync());

    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it("unmount clears pending mdfind timeout (no leak)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "index_all_documents")
        return Promise.resolve({ indexed: 0, skipped: 0, errors: 0 });
      if (cmd === "search_documents") return Promise.resolve([]);
      if (cmd === "search_files_on_disk") return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const { result, unmount } = renderHook(() => useSearch());
    await act(() => vi.runAllTimersAsync());

    // Start a search — mdfind timeout is now pending (200ms)
    act(() => {
      result.current.search("hello");
    });

    // Unmount before the 200ms debounce fires
    unmount();

    // Clear the call log so we can check no new calls happen
    const callsBefore = mockInvoke.mock.calls.filter(
      (c) => c[0] === "search_files_on_disk"
    ).length;

    // Advance past the debounce — timeout should have been cleared on unmount
    await act(() => vi.advanceTimersByTimeAsync(300));

    const callsAfter = mockInvoke.mock.calls.filter(
      (c) => c[0] === "search_files_on_disk"
    ).length;

    expect(callsAfter).toBe(callsBefore);
  });
});
