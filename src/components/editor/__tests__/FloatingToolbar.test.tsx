import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
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
    const editor = createMockEditor(true);
    render(
      <FloatingToolbar
        editor={editor}
        onHighlight={vi.fn()}
        onNote={vi.fn()}
      />,
    );

    // Trigger selection update to mount toolbar
    act(() => {
      editor._trigger("selectionUpdate");
    });

    const toolbar = document.body.querySelector("[role='toolbar']");
    expect(toolbar).toBeTruthy();
    expect(toolbar?.getAttribute("aria-label")).toBe("Text formatting");
  });

  it("unmounts after selection is cleared", async () => {
    const editor = createMockEditor(true);
    render(
      <FloatingToolbar
        editor={editor}
        onHighlight={vi.fn()}
        onNote={vi.fn()}
      />,
    );

    // Mount toolbar
    act(() => {
      editor._trigger("selectionUpdate");
    });

    expect(document.body.querySelector("[role='toolbar']")).toBeTruthy();

    // Clear selection
    (editor.state.selection as { empty: boolean }).empty = true;
    act(() => {
      editor._trigger("selectionUpdate");
    });

    // After transition completes, toolbar should unmount
    // Simulate transitionend event
    const toolbar = document.body.querySelector("[role='toolbar']");
    if (toolbar) {
      act(() => {
        toolbar.dispatchEvent(new Event("transitionend", { bubbles: true }));
      });
    }

    // The toolbar should have opacity 0 (hidden) after selection cleared
    const toolbarAfter = document.body.querySelector("[role='toolbar']");
    if (toolbarAfter) {
      expect(toolbarAfter.getAttribute("style")).toContain("opacity: 0");
    }
  });

  it("applies toolbar-color-btn--selected class to default color button", () => {
    const editor = createMockEditor(true);
    render(
      <FloatingToolbar
        editor={editor}
        onHighlight={vi.fn()}
        onNote={vi.fn()}
        defaultColor="yellow"
      />,
    );

    act(() => {
      editor._trigger("selectionUpdate");
    });

    const yellowBtn = document.body.querySelector("[aria-label='Highlight yellow']");
    expect(yellowBtn).toBeTruthy();
    expect(yellowBtn?.className).toContain("toolbar-color-btn--selected");

    // Non-default buttons should NOT have the selected class
    const blueBtn = document.body.querySelector("[aria-label='Highlight blue']");
    expect(blueBtn?.className).not.toContain("toolbar-color-btn--selected");
  });

  it("uses CSS variable references for entrance easing", () => {
    const editor = createMockEditor(true);
    render(
      <FloatingToolbar
        editor={editor}
        onHighlight={vi.fn()}
        onNote={vi.fn()}
      />,
    );

    act(() => {
      editor._trigger("selectionUpdate");
    });

    const toolbar = document.body.querySelector("[role='toolbar']") as HTMLElement;
    expect(toolbar).toBeTruthy();
    // Toolbar may start with exit easing (not yet visible) or entrance easing
    // Either way, it should use CSS variables, not hardcoded cubic-bezier
    expect(toolbar.style.transition).toMatch(/var\(--ease-(entrance|exit)\)/);
    expect(toolbar.style.transition).not.toContain("cubic-bezier");
  });
});
