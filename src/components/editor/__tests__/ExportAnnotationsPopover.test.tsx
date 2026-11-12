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

  it("waits for a writing type before exporting when corrections persist", async () => {
    vi.useFakeTimers();
    try {
      const onExport = vi.fn().mockResolvedValue({
        highlightCount: 2,
        noteCount: 1,
        snippets: [],
        correctionsSaved: true,
        correctionsFile: "corrections-2026-09-12.jsonl",
        correctionHighlightIds: ["h1"],
      });

      render(
        <ExportAnnotationsPopover
          isOpen
          onExport={onExport}
          onClose={vi.fn()}
          persistCorrections
          hasMarginNotes
          onOpenSettings={vi.fn()}
          onRetag={vi.fn()}
        />,
      );

      await act(async () => {
        vi.runAllTimers();
      });
      await act(async () => {});

      // No auto-export — the picker must come first
      expect(onExport).not.toHaveBeenCalled();
      expect(screen.getByText("Export annotations")).toBeTruthy();

      await act(async () => {
        screen.getByText("Export").click();
        await vi.runAllTimersAsync();
      });

      expect(onExport).toHaveBeenCalledTimes(1);
      expect(onExport).toHaveBeenCalledWith("general");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-tags persisted corrections when a post-export chip is clicked", async () => {
    vi.useFakeTimers();
    try {
      const onRetag = vi.fn();
      const onExport = vi.fn().mockResolvedValue({
        highlightCount: 2,
        noteCount: 1,
        snippets: [],
        correctionsSaved: true,
        correctionsFile: "corrections-2026-09-12.jsonl",
        correctionHighlightIds: ["h1", "h2"],
      });

      render(
        <ExportAnnotationsPopover
          isOpen
          onExport={onExport}
          onClose={vi.fn()}
          persistCorrections
          hasMarginNotes
          onOpenSettings={vi.fn()}
          onRetag={onRetag}
        />,
      );

      await act(async () => {
        vi.runAllTimers();
      });
      await act(async () => {
        screen.getByText("Export").click();
        await vi.runAllTimersAsync();
      });
      await act(async () => {});

      const blogChip = screen.getByText("Blog");
      await act(async () => {
        blogChip.click();
      });

      expect(onRetag).toHaveBeenCalledWith(["h1", "h2"], "blog");
    } finally {
      vi.useRealTimers();
    }
  });
});
