// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeepLocal } from "../useKeepLocal";

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

/** Flush microtask queue without relying on setTimeout (which fake timers intercept). */
async function flush() {
  // Multiple rounds to handle chained .then() / state updates
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

const fakeItem = (id: string) => ({
  id,
  url: `https://example.com/${id}`,
  title: `Item ${id}`,
  author: null,
  domain: "example.com",
  platform: null,
  wordCount: 100,
  tags: [],
  createdAt: 1000,
  status: "active",
  contentAvailable: true,
});

describe("useKeepLocal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("health check on mount sets isOnline true", async () => {
    mockInvoke.mockResolvedValue({ ok: true, now: 123 });

    const { result } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });

    expect(mockInvoke).toHaveBeenCalledWith("keep_local_health");
    expect(result.current.isOnline).toBe(true);
  });

  it("health check failure sets isOnline false", async () => {
    mockInvoke.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("30s polling interval fires health check", async () => {
    mockInvoke.mockResolvedValue({ ok: true, now: 123 });

    renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });

    const callCountAfterMount = mockInvoke.mock.calls.filter(
      (c) => c[0] === "keep_local_health"
    ).length;

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await flush();
    });

    const callCountAfter30s = mockInvoke.mock.calls.filter(
      (c) => c[0] === "keep_local_health"
    ).length;

    expect(callCountAfter30s).toBe(callCountAfterMount + 1);
  });

  it("cleanup on unmount clears interval", async () => {
    mockInvoke.mockResolvedValue({ ok: true, now: 123 });

    const { unmount } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });

    unmount();

    const callCountAtUnmount = mockInvoke.mock.calls.filter(
      (c) => c[0] === "keep_local_health"
    ).length;

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await flush();
    });

    const callCountAfter30s = mockInvoke.mock.calls.filter(
      (c) => c[0] === "keep_local_health"
    ).length;

    expect(callCountAfter30s).toBe(callCountAtUnmount);
  });

  it("online to offline transition when health throws", async () => {
    let callCount = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "keep_local_health") {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ok: true, now: 1 });
        return Promise.reject(new Error("offline"));
      }
      if (cmd === "keep_local_list_items") {
        return Promise.resolve({ items: [], count: 0 });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });
    expect(result.current.isOnline).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await flush();
    });
    expect(result.current.isOnline).toBe(false);
  });

  it("offline to online auto-loads items", async () => {
    let callCount = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "keep_local_health") {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error("offline"));
        return Promise.resolve({ ok: true, now: 2 });
      }
      if (cmd === "keep_local_list_items") {
        return Promise.resolve({ items: [fakeItem("i1")], count: 1 });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });
    expect(result.current.isOnline).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await flush();
    });
    expect(result.current.isOnline).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("keep_local_list_items", {
      limit: 50,
      offset: 0,
      query: null,
      status: null,
    });
    expect(result.current.items).toHaveLength(1);
  });

  it("wasOnlineRef prevents redundant loads when already online", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "keep_local_health") {
        return Promise.resolve({ ok: true, now: 1 });
      }
      if (cmd === "keep_local_list_items") {
        return Promise.resolve({ items: [], count: 0 });
      }
      return Promise.resolve();
    });

    renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });

    const loadCallsAfterMount = mockInvoke.mock.calls.filter(
      (c) => c[0] === "keep_local_list_items"
    ).length;

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await flush();
    });

    const loadCallsAfter30s = mockInvoke.mock.calls.filter(
      (c) => c[0] === "keep_local_list_items"
    ).length;

    expect(loadCallsAfter30s).toBe(loadCallsAfterMount);
  });

  it("search debounces at 300ms", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "keep_local_health") {
        return Promise.resolve({ ok: true, now: 1 });
      }
      if (cmd === "keep_local_list_items") {
        return Promise.resolve({ items: [], count: 0 });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });

    // Clear calls from initial load
    mockInvoke.mockClear();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "keep_local_health") {
        return Promise.resolve({ ok: true, now: 1 });
      }
      if (cmd === "keep_local_list_items") {
        return Promise.resolve({ items: [], count: 0 });
      }
      return Promise.resolve();
    });

    act(() => {
      result.current.search("a");
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
      await flush();
    });

    act(() => {
      result.current.search("ab");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await flush();
    });

    const listCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "keep_local_list_items"
    );
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]![1]).toEqual({
      limit: 50,
      offset: 0,
      query: "ab",
      status: null,
    });
  });

  it("loadItems sets isLoading", async () => {
    const listDeferred = deferred<{ items: never[]; count: number }>();

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "keep_local_health") {
        return Promise.resolve({ ok: true, now: 1 });
      }
      if (cmd === "keep_local_list_items") {
        return listDeferred.promise;
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });

    // loadItems is pending (auto-load from offline->online transition)
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      listDeferred.resolve({ items: [], count: 0 });
      await flush();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("loadItems error clears items and sets isOnline false", async () => {
    let listCallCount = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "keep_local_health") {
        return Promise.resolve({ ok: true, now: 1 });
      }
      if (cmd === "keep_local_list_items") {
        listCallCount++;
        if (listCallCount === 1) {
          return Promise.resolve({ items: [fakeItem("i1")], count: 1 });
        }
        return Promise.reject(new Error("server error"));
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });
    expect(result.current.items).toHaveLength(1);

    // Trigger another loadItems via search
    act(() => {
      result.current.search("fail");
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await flush();
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.isOnline).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("cleanup on unmount clears search timer", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "keep_local_health") {
        return Promise.resolve({ ok: true, now: 1 });
      }
      if (cmd === "keep_local_list_items") {
        return Promise.resolve({ items: [], count: 0 });
      }
      return Promise.resolve();
    });

    const { result, unmount } = renderHook(() => useKeepLocal());

    await act(async () => {
      await flush();
    });

    mockInvoke.mockClear();
    mockInvoke.mockImplementation(() =>
      Promise.resolve({ items: [], count: 0 })
    );

    act(() => {
      result.current.search("test");
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(300);
      await flush();
    });

    const listCalls = mockInvoke.mock.calls.filter(
      (c) => c[0] === "keep_local_list_items"
    );
    expect(listCalls).toHaveLength(0);
  });
});
