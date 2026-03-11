import { describe, it, expect, vi } from "vitest";
import { render, waitFor, screen } from "@testing-library/react";
import { ExportAnnotationsPopover } from "../ExportAnnotationsPopover";

if (!globalThis.requestAnimationFrame) {
  // useAnimatedPresence relies on requestAnimationFrame.
  // jsdom doesn't always provide it depending on test setup.
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 0) as unknown as number;
  };
}

describe("ExportAnnotationsPopover", () => {
  it("shows an error state when export fails (does not claim clipboard success)", async () => {
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

    await waitFor(() => {
      expect(onExport).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/^export failed$/i)).toBeTruthy();
    });

    expect(screen.queryByText(/copied to clipboard/i)).toBeNull();
    expect(screen.queryByText(/sent to claude/i)).toBeNull();

    consoleError.mockRestore();
  });
});
