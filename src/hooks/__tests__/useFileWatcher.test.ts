// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileWatcher } from "../useFileWatcher";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockUnlisten = vi.fn();
let capturedListener: ((event: { payload: { path: string } }) => void) | null =
  null;
const mockListen = vi
  .fn()
  .mockImplementation(
    (
      _event: string,
      handler: (event: { payload: { path: string } }) => void
    ) => {
      capturedListener = handler;
      return Promise.resolve(mockUnlisten);
    }
  );
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

/** Flush microtask queue without relying on setTimeout (which fake timers intercept). */
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("useFileWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockReset();
    mockListen.mockClear();
    mockUnlisten.mockClear();
    capturedListener = null;
    mockInvoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("listen called before watch_file when filePath provided", async () => {
    const onChanged = vi.fn();
    renderHook(() => useFileWatcher("/tmp/test.md", onChanged));

    await act(async () => {
      await flush();
    });

    expect(mockListen).toHaveBeenCalledWith(
      "file-changed",
      expect.any(Function)
    );
    expect(mockInvoke).toHaveBeenCalledWith("watch_file", {
      path: "/tmp/test.md",
    });

    // listen should have been called before watch_file
    const listenOrder = mockListen.mock.invocationCallOrder[0]!;
    const watchOrder = mockInvoke.mock.invocationCallOrder[0]!;
    expect(listenOrder).toBeLessThan(watchOrder);
  });

  it("no setup when filePath is null", async () => {
    const onChanged = vi.fn();
    renderHook(() => useFileWatcher(null, onChanged));

    await act(async () => {
      await flush();
    });

    expect(mockListen).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("debounce: rapid file-changed events coalesce into single callback", async () => {
    const onChanged = vi.fn();
    renderHook(() => useFileWatcher("/tmp/test.md", onChanged));

    await act(async () => {
      await flush();
    });

    expect(capturedListener).not.toBeNull();

    // Fire 5 rapid events
    act(() => {
      for (let i = 0; i < 5; i++) {
        capturedListener!({ payload: { path: "/tmp/test.md" } });
      }
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
      await flush();
    });

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith("/tmp/test.md");
  });

  it("cleanup: calls unwatch_file + unlisten on unmount", async () => {
    const onChanged = vi.fn();
    const { unmount } = renderHook(() =>
      useFileWatcher("/tmp/test.md", onChanged)
    );

    await act(async () => {
      await flush();
    });

    unmount();

    await act(async () => {
      await flush();
    });

    expect(mockInvoke).toHaveBeenCalledWith("unwatch_file");
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("cleanup on filePath change", async () => {
    const onChanged = vi.fn();
    const { rerender } = renderHook(
      ({ path }: { path: string | null }) => useFileWatcher(path, onChanged),
      { initialProps: { path: "/tmp/a.md" as string | null } }
    );

    await act(async () => {
      await flush();
    });

    expect(mockInvoke).toHaveBeenCalledWith("watch_file", {
      path: "/tmp/a.md",
    });

    // Change filePath
    mockInvoke.mockClear();
    mockListen.mockClear();
    mockUnlisten.mockClear();
    capturedListener = null;

    rerender({ path: "/tmp/b.md" });

    await act(async () => {
      await flush();
    });

    // Should have cleaned up a.md
    expect(mockInvoke).toHaveBeenCalledWith("unwatch_file");
    expect(mockUnlisten).toHaveBeenCalled();

    // Should have set up b.md
    expect(mockListen).toHaveBeenCalledWith(
      "file-changed",
      expect.any(Function)
    );
    expect(mockInvoke).toHaveBeenCalledWith("watch_file", {
      path: "/tmp/b.md",
    });
  });

  it("cancelled flag prevents callbacks after unmount", async () => {
    const onChanged = vi.fn();
    const { unmount } = renderHook(() =>
      useFileWatcher("/tmp/test.md", onChanged)
    );

    await act(async () => {
      await flush();
    });

    // Fire event
    act(() => {
      capturedListener!({ payload: { path: "/tmp/test.md" } });
    });

    // Unmount before debounce fires
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(150);
      await flush();
    });

    expect(onChanged).not.toHaveBeenCalled();
  });
});
