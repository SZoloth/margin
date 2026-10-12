import { describe, it, expect, vi, beforeEach } from "vitest";

const logFrontendError = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/tauri-commands", () => ({
  logFrontendError: (...a: unknown[]) => logFrontendError(...a),
  getDiagnostics: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));

import { backupLabel, installGlobalErrorLogging, reportToLog } from "../crash-reporting";

describe("crash-reporting", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs Error objects with their stack", () => {
    reportToLog("ui", new TypeError("bad"));
    expect(logFrontendError).toHaveBeenCalledWith("ui", "TypeError: bad", expect.any(String));
  });

  it("wraps non-Error values", () => {
    reportToLog("ui", "just a string");
    expect(logFrontendError).toHaveBeenCalledWith("ui", "Error: just a string", expect.any(String));
  });

  it("ignores the benign ResizeObserver warning", () => {
    reportToLog("window.onerror", "ResizeObserver loop completed with undelivered notifications.");
    expect(logFrontendError).not.toHaveBeenCalled();
  });

  it("does not throw when the backend call fails", async () => {
    logFrontendError.mockRejectedValueOnce(new Error("ipc down"));
    expect(() => reportToLog("ui", new Error("x"))).not.toThrow();
    await Promise.resolve();
  });

  it("logs window errors and unhandled rejections until cleaned up", () => {
    const cleanup = installGlobalErrorLogging();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("from window"), message: "from window" }));
    expect(logFrontendError).toHaveBeenCalledWith("window.onerror", "Error: from window", expect.any(String));
    const rejection = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(rejection, "reason", { value: new Error("from promise") });
    window.dispatchEvent(rejection);
    expect(logFrontendError).toHaveBeenCalledWith("unhandledrejection", "Error: from promise", expect.any(String));
    const remove = vi.spyOn(window, "removeEventListener");
    cleanup();
    expect(remove).toHaveBeenCalledWith("error", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
  });

  it("turns a backup file name into a readable date", () => {
    expect(backupLabel("margin-20261012-205213-daily.db")).toMatch(/Oct/);
    expect(backupLabel("margin-20261012-205213-pre-migration-v1.17.1.db")).toMatch(/12/);
    expect(backupLabel("notes.txt")).toBeNull();
  });
});
