import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ExportAnnotationsPopover } from "../ExportAnnotationsPopover";

describe("ExportAnnotationsPopover", () => {
  it("shows an error state when export fails (does not claim clipboard success)", async () => {
    // useAnimatedPresence calls requestAnimationFrame twice on mount. In React 19,
    // act() waits for pending rAF callbacks before resolving — jsdom never fires rAF
    // automatically, so the test hangs until the 30s testTimeout fires.
    // Fix: fake timers so vi.runAllTimers() fires rAF synchronously (same pattern as
    // FloatingToolbar.test.tsx).
    vi.useFakeTimers();
    try {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const onExport = vi.fn().mockRejectedValue(new Error("clipboard failed"));
      const onClose = vi.fn();
      const onOpenSettings = vi.fn();

      render(
        <ExportAnnotationsPopover
          isOpen
          onExport={onExport}
          onClose={onClose}
          persistCorrections={false}
          onOpenSettings={onOpenSettings}
        />,
      );

      // Flush rAF callbacks from useAnimatedPresence
      await act(async () => {
        vi.runAllTimers();
      });
      // Flush microtasks: allows the rejected onExport promise to settle and
      // setErrorMessage() to trigger a React re-render
      await act(async () => {});

      expect(onExport).toHaveBeenCalledTimes(1);

      // Error description is in its own element — query it directly
      expect(screen.getByText("Export failed. Please try again.")).toBeTruthy();
      expect(screen.queryByText(/copied to clipboard/i)).toBeNull();
      expect(screen.queryByText(/sent to claude/i)).toBeNull();

      consoleError.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
