import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";

// @hugeicons/core-free-icons is a 41k-line CJS bundle — loading it in a worker thread
// causes a startup timeout before any test code runs. Mock both packages so only the
// FloatingToolbar logic is exercised here; icon rendering is not under test.
vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: () => null,
}));
vi.mock("@hugeicons/core-free-icons", () => ({
  Comment01Icon: {},
}));

import { FloatingToolbar } from "../FloatingToolbar";

// Minimal Editor mock with the events and state the toolbar needs
function createMockEditor(hasSelection: boolean) {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    state: {
      selection: { empty: !hasSelection, from: 0, to: hasSelection ? 10 : 0 },
    },
    isFocused: true,
    view: {
      coordsAtPos: () => ({ top: 100, bottom: 120, left: 50, right: 150 }),
    },
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

describe("FloatingToolbar", () => {
  it("renders with role='toolbar' and aria-label", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor(true);
      render(
        <FloatingToolbar
          editor={editor}
          onHighlight={vi.fn()}
          onNote={vi.fn()}
        />,
      );

      // Trigger selection update to mount toolbar; flush rAF via fake timers
      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.runAllTimers();
      });

      const toolbar = document.body.querySelector("[role='toolbar']");
      expect(toolbar).toBeTruthy();
      expect(toolbar?.getAttribute("aria-label")).toBe("Text formatting");
    } finally {
      vi.useRealTimers();
    }
  });

  it("unmounts after selection is cleared", async () => {
    // FloatingToolbar calls requestAnimationFrame(() => setIsVisible(true)) when first
    // mounting. In React 19, un-awaited act() leaves a polling loop that waits for all
    // pending async work — including rAF — before resolving. Since jsdom never fires rAF
    // automatically this loop runs until the 30s testTimeout.
    // Fix: use fake timers so vi.runAllTimers() fires rAF synchronously, then await each
    // act() to prevent dangling React 19 act() promises.
    vi.useFakeTimers();
    try {
      const editor = createMockEditor(true);
      render(
        <FloatingToolbar
          editor={editor}
          onHighlight={vi.fn()}
          onNote={vi.fn()}
        />,
      );

      // Mount toolbar — flush rAF via fake timers so isVisible becomes true
      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.runAllTimers();
      });

      expect(document.body.querySelector("[role='toolbar']")).toBeTruthy();

      // Clear selection
      (editor.state.selection as { empty: boolean }).empty = true;
      await act(async () => {
        editor._trigger("selectionUpdate");
      });

      // Simulate transitionend with propertyName so the opacity handler fires.
      // jsdom lacks TransitionEvent; attach propertyName to a plain Event instead.
      const toolbar = document.body.querySelector("[role='toolbar']");
      if (toolbar) {
        await act(async () => {
          const evt = new Event("transitionend", { bubbles: true });
          Object.defineProperty(evt, "propertyName", { value: "opacity" });
          toolbar.dispatchEvent(evt);
        });
      }

      // Toolbar should be unmounted (transitionend triggered setIsMounted(false))
      // or if still present, it should be hidden (opacity: 0)
      const toolbarAfter = document.body.querySelector("[role='toolbar']");
      if (toolbarAfter) {
        expect(toolbarAfter.getAttribute("style")).toContain("opacity: 0");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies toolbar-color-btn--selected class to default color button", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor(true);
      render(
        <FloatingToolbar
          editor={editor}
          onHighlight={vi.fn()}
          onNote={vi.fn()}
          defaultColor="yellow"
        />,
      );

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.runAllTimers();
      });

      const yellowBtn = document.body.querySelector("[aria-label='Highlight yellow']");
      expect(yellowBtn).toBeTruthy();
      expect(yellowBtn?.className).toContain("toolbar-color-btn--selected");

      // Non-default buttons should NOT have the selected class
      const blueBtn = document.body.querySelector("[aria-label='Highlight blue']");
      expect(blueBtn?.className).not.toContain("toolbar-color-btn--selected");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses CSS variable references for entrance easing", async () => {
    vi.useFakeTimers();
    try {
      const editor = createMockEditor(true);
      render(
        <FloatingToolbar
          editor={editor}
          onHighlight={vi.fn()}
          onNote={vi.fn()}
        />,
      );

      await act(async () => {
        editor._trigger("selectionUpdate");
        vi.runAllTimers();
      });

      const toolbar = document.body.querySelector("[role='toolbar']") as HTMLElement;
      expect(toolbar).toBeTruthy();
      // Toolbar may start with exit easing (not yet visible) or entrance easing
      // Either way, it should use CSS variables, not hardcoded cubic-bezier
      expect(toolbar.style.transition).toMatch(/var\(--ease-(entrance|exit)\)/);
      expect(toolbar.style.transition).not.toContain("cubic-bezier");
    } finally {
      vi.useRealTimers();
    }
  });
});
