import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

import { FloatingToolbar } from "../FloatingToolbar";
import { allowedMarkRanges } from "@/lib/highlight-ranges";

vi.mock("@/lib/highlight-ranges", () => ({
  allowedMarkRanges: vi.fn(() => [{ from: 0, to: 10 }]),
}));

const SETTLE_MS = 250;

// Minimal Editor mock with the state surface the selection watcher reads
function createMockEditor(opts: { hasSelection?: boolean; hasMark?: boolean; focused?: boolean } = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const markType = { name: "highlight" };
  const hasSelection = opts.hasSelection ?? true;
  return {
    state: {
      selection: { empty: !hasSelection, from: 0, to: hasSelection ? 10 : 0 },
      schema: { marks: { highlight: markType } },
      doc: { rangeHasMark: vi.fn(() => opts.hasMark ?? false) },
    },
    isFocused: opts.focused ?? true,
    on: (event: string, fn: () => void) => {
      (listeners[event] ??= []).push(fn);
    },
    off: (event: string, fn: () => void) => {
      const arr = listeners[event];
      if (arr) {
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      }
    },
    _trigger: (event: string) => {
      for (const fn of listeners[event] ?? []) fn();
    },
  } as unknown as import("@tiptap/core").Editor & { _trigger: (e: string) => void };
}

describe("FloatingToolbar (selection watcher)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(allowedMarkRanges).mockReturnValue([{ from: 0, to: 10 }]);
  });

  it("renders nothing — selection is the gesture, no toolbar UI", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor();
      render(<FloatingToolbar editor={editor} onHighlight={vi.fn()} />);
      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(document.body.querySelector("[role='toolbar']")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-applies the highlight once a selection settles", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor();
      const onHighlight = vi.fn();
      render(<FloatingToolbar editor={editor} onHighlight={onHighlight} />);

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });

      expect(onHighlight).toHaveBeenCalledTimes(1);
      expect(onHighlight).toHaveBeenCalledWith();
    } finally {
      vi.useRealTimers();
    }
  });

  it("debounces mid-drag updates — fires only after the selection settles", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor();
      const onHighlight = vi.fn();
      render(<FloatingToolbar editor={editor} onHighlight={onHighlight} />);

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(100);
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(100);
      });
      expect(onHighlight).not.toHaveBeenCalled();

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire for an empty selection", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor({ hasSelection: false });
      const onHighlight = vi.fn();
      render(<FloatingToolbar editor={editor} onHighlight={onHighlight} />);

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires only once while a selection is held", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor();
      const onHighlight = vi.fn();
      render(<FloatingToolbar editor={editor} onHighlight={onHighlight} />);

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-arms after the selection collapses and a new one is made", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor();
      const onHighlight = vi.fn();
      render(<FloatingToolbar editor={editor} onHighlight={onHighlight} />);

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).toHaveBeenCalledTimes(1);

      // Collapse, then select again — the mark is gone so it should refire
      (editor.state.selection as { empty: boolean }).empty = true;
      await act(async () => {
        editor._trigger("selectionUpdate");
      });
      (editor.state.selection as { empty: boolean }).empty = false;
      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-arms when a different range is selected without collapsing first", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor();
      const onHighlight = vi.fn();
      render(<FloatingToolbar editor={editor} onHighlight={onHighlight} />);

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).toHaveBeenCalledTimes(1);

      // Selection moves to a different range without an empty intermediate state
      const sel = editor.state.selection as { from: number; to: number };
      sel.from = 20;
      sel.to = 30;
      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips selections fully covered by an existing highlight", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor({ hasMark: true });
      const onHighlight = vi.fn();
      render(<FloatingToolbar editor={editor} onHighlight={onHighlight} />);

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips selections where the mark is not allowed (code blocks)", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(allowedMarkRanges).mockReturnValue([]);
      const editor = createMockEditor();
      const onHighlight = vi.fn();
      render(<FloatingToolbar editor={editor} onHighlight={onHighlight} />);

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.advanceTimersByTime(SETTLE_MS + 50);
      });
      expect(onHighlight).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
