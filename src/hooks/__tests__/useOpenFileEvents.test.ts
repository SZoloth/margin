import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOpenFileEvents } from "../useOpenFileEvents";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockUnlisten = vi.fn();
let capturedListener: ((event: { payload: string }) => void) | null = null;
const mockListen = vi.fn().mockImplementation(
  (_event: string, handler: (event: { payload: string }) => void) => {
    capturedListener = handler;
    return Promise.resolve(mockUnlisten);
  },
);
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("useOpenFileEvents", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockListen.mockClear();
    mockUnlisten.mockClear();
    capturedListener = null;
  });

  it("does not drain the cold-launch queue until restored tabs are ready", async () => {
    // Restoring tabs after the file opens would replace it with the previous doc.
    mockInvoke.mockResolvedValue(["/new.md"]);
    const openFilePath = vi.fn();
    const { rerender } = renderHook(
      ({ isReady }) => useOpenFileEvents({ isReady, openFilePath, onError: vi.fn() }),
      { initialProps: { isReady: false } },
    );
    await act(flush);
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(openFilePath).not.toHaveBeenCalled();

    rerender({ isReady: true });
    await act(flush);
    expect(mockInvoke).toHaveBeenCalledWith("drain_pending_open_files");
    expect(openFilePath).toHaveBeenCalledWith("/new.md");
  });

  it("registers the listener before draining, so no path falls in the gap", async () => {
    const order: string[] = [];
    mockListen.mockImplementationOnce((_e: string, h: (event: { payload: string }) => void) => {
      order.push("listen");
      capturedListener = h;
      return Promise.resolve(mockUnlisten);
    });
    mockInvoke.mockImplementation(() => {
      order.push("drain");
      return Promise.resolve([]);
    });
    renderHook(() => useOpenFileEvents({ isReady: true, openFilePath: vi.fn(), onError: vi.fn() }));
    await act(flush);
    expect(order).toEqual(["listen", "drain"]);
  });

  it("opens only the last queued path", async () => {
    mockInvoke.mockResolvedValue(["/a.md", "/b.md"]);
    const openFilePath = vi.fn();
    renderHook(() => useOpenFileEvents({ isReady: true, openFilePath, onError: vi.fn() }));
    await act(flush);
    expect(openFilePath).toHaveBeenCalledTimes(1);
    expect(openFilePath).toHaveBeenCalledWith("/b.md");
  });

  it("opens paths emitted while running", async () => {
    mockInvoke.mockResolvedValue([]);
    const openFilePath = vi.fn();
    renderHook(() => useOpenFileEvents({ isReady: true, openFilePath, onError: vi.fn() }));
    await act(flush);
    act(() => capturedListener?.({ payload: "/live.md" }));
    expect(openFilePath).toHaveBeenCalledWith("/live.md");
  });

  it("reports a failed drain", async () => {
    mockInvoke.mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    renderHook(() => useOpenFileEvents({ isReady: true, openFilePath: vi.fn(), onError }));
    await act(flush);
    expect(onError).toHaveBeenCalled();
  });
});

describe("useOpenFileEvents under StrictMode-style remount", () => {
  it("drains once and still opens the queued path", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(["/new.md"]);
    const openFilePath = vi.fn();
    const { unmount } = renderHook(
      () => useOpenFileEvents({ isReady: true, openFilePath, onError: vi.fn() }),
      { reactStrictMode: true },
    );
    await act(flush);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(openFilePath).toHaveBeenCalledWith("/new.md");
    unmount();
  });
});
