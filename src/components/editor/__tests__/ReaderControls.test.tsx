import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ReaderControls } from "../ReaderControls";
import { DEFAULT_SETTINGS } from "@/hooks/useSettings";

// The popover mounts via useAnimatedPresence which needs two rAF ticks —
// fake timers let runAllTimers() fire them synchronously (same pattern as
// ExportAnnotationsPopover.test.tsx).
function renderControls(setSetting = vi.fn()) {
  const utils = render(
    <ReaderControls settings={DEFAULT_SETTINGS} setSetting={setSetting} />,
  );
  return { setSetting, ...utils };
}

describe("ReaderControls", () => {
  it("opens the popover and applies settings changes via setSetting", async () => {
    vi.useFakeTimers();
    try {
      const setSetting = vi.fn();
      renderControls(setSetting);

      await act(async () => {
        screen.getByRole("button", { name: "Reading settings" }).click();
        vi.runAllTimers();
      });

      const dialog = screen.getByRole("dialog", { name: "Reading settings" });
      expect(dialog).toBeTruthy();

      await act(async () => {
        screen.getByRole("radio", { name: "Large" }).click();
      });
      expect(setSetting).toHaveBeenCalledWith("fontSize", "large");

      await act(async () => {
        screen.getByRole("radio", { name: "Wide" }).click();
      });
      expect(setSetting).toHaveBeenCalledWith("readerWidth", "wide");
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes on Escape", async () => {
    vi.useFakeTimers();
    try {
      renderControls();

      await act(async () => {
        screen.getByRole("button", { name: "Reading settings" }).click();
        vi.runAllTimers();
      });
      expect(screen.getByRole("dialog", { name: "Reading settings" })).toBeTruthy();

      // Escape runs in its own act so the presence-unmount effect (scheduled
      // on the state change) is registered before timers fire.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      await act(async () => {
        vi.runAllTimers();
      });

      expect(screen.queryByRole("dialog", { name: "Reading settings" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
