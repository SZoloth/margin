import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent, cleanup } from "@testing-library/react";

import { SelectionToolbar } from "../SelectionToolbar";
import { allowedMarkRanges, rangeFullyMarked } from "@/lib/highlight-ranges";

vi.mock("@/lib/highlight-ranges", () => ({
  allowedMarkRanges: vi.fn(() => [{ from: 1, to: 11 }]),
  rangeFullyMarked: vi.fn(() => false),
}));

const SETTLE_MS = 250;

type MockEditor = import("@tiptap/core").Editor & {
  _trigger: (e: string) => void;
  _select: (from: number, to: number, text?: string) => void;
};

// The surface the toolbar reads: selection, schema, doc text, focus, coords.
function createMockEditor(): MockEditor {
  const listeners: Record<string, Array<() => void>> = {};
  const dom = document.createElement("div");
  document.body.appendChild(dom);
  let text = "fast-paced";
  const editor = {
    state: {
      selection: { empty: false, from: 1, to: 11 },
      schema: { marks: { highlight: { name: "highlight" } } },
      doc: { textBetween: () => text },
    },
    isFocused: true,
    isDestroyed: false,
    view: {
      dom,
      coordsAtPos: (pos: number) => ({ left: pos * 8, right: pos * 8 + 8, top: 300, bottom: 320 }),
    },
    on: (event: string, fn: () => void) => {
      (listeners[event] ??= []).push(fn);
    },
    off: (event: string, fn: () => void) => {
      const arr = listeners[event];
      if (arr) arr.splice(arr.indexOf(fn), 1);
    },
    _trigger: (event: string) => {
      for (const fn of [...(listeners[event] ?? [])]) fn();
    },
    _select(from: number, to: number, t = "fast-paced") {
      text = t;
      Object.assign(editor.state.selection, { from, to, empty: from === to });
      editor._trigger("selectionUpdate");
    },
  };
  return editor as unknown as MockEditor;
}

function handlers() {
  return {
    onHighlight: vi.fn(),
    onNote: vi.fn(),
    onOpenHighlight: vi.fn(),
    onRemoveHighlight: vi.fn(),
    onNeverWrite: vi.fn(),
  };
}

// A mouse drag: press in the editor, move the selection, release.
async function drag(editor: MockEditor, from = 1, to = 11, text?: string) {
  await act(async () => {
    fireEvent.mouseDown(editor.view.dom);
    editor._select(from, to, text);
    fireEvent.mouseUp(window);
    vi.advanceTimersByTime(20);
  });
}

const toolbar = () => screen.queryByRole("toolbar", { name: "Selection" });

describe("SelectionToolbar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(allowedMarkRanges).mockReturnValue([{ from: 1, to: 11 }]);
    vi.mocked(rangeFullyMarked).mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    document.body.innerHTML = "";
  });

  it("selecting text never highlights by itself; it shows the toolbar", async () => {
    const editor = createMockEditor();
    const h = handlers();
    render(<SelectionToolbar editor={editor} canNeverWrite {...h} />);
    await drag(editor);
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_MS * 4);
    });
    expect(h.onHighlight).not.toHaveBeenCalled();
    expect(h.onNote).not.toHaveBeenCalled();
    expect(toolbar()).not.toBeNull();
    for (const name of ["Highlight", "Note", "Never write this", "Copy"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("stays hidden mid-drag and appears on mouse-up", async () => {
    const editor = createMockEditor();
    render(<SelectionToolbar editor={editor} canNeverWrite {...handlers()} />);
    await act(async () => {
      fireEvent.mouseDown(editor.view.dom);
      editor._select(1, 6);
      vi.advanceTimersByTime(SETTLE_MS * 2);
    });
    expect(toolbar()).toBeNull();
    await act(async () => {
      fireEvent.mouseUp(window);
      vi.advanceTimersByTime(20);
    });
    expect(toolbar()).not.toBeNull();
  });

  it("appears after a keyboard selection settles", async () => {
    const editor = createMockEditor();
    render(<SelectionToolbar editor={editor} canNeverWrite {...handlers()} />);
    await act(async () => {
      editor._select(1, 6);
      vi.advanceTimersByTime(100);
    });
    expect(toolbar()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_MS);
    });
    expect(toolbar()).not.toBeNull();
  });

  it("Highlight, Note and Never write this call their handlers and close", async () => {
    const editor = createMockEditor();
    const h = handlers();
    render(<SelectionToolbar editor={editor} canNeverWrite {...h} />);
    for (const [name, fn] of [
      ["Highlight", h.onHighlight],
      ["Note", h.onNote],
      ["Never write this", h.onNeverWrite],
    ] as const) {
      await drag(editor);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name }));
      });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(toolbar()).toBeNull();
    }
  });

  it("keeps editor focus: pressing a toolbar button doesn't take the selection", async () => {
    const editor = createMockEditor();
    render(<SelectionToolbar editor={editor} canNeverWrite {...handlers()} />);
    await drag(editor);
    const btn = screen.getByRole("button", { name: "Highlight" });
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    btn.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("Copy copies the selection and says so", async () => {
    const editor = createMockEditor();
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    render(<SelectionToolbar editor={editor} canNeverWrite {...handlers()} />);
    await drag(editor);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(toolbar()).toBeNull();
  });

  it("⌘⌥M adds a note to the selection", async () => {
    const editor = createMockEditor();
    const h = handlers();
    render(<SelectionToolbar editor={editor} canNeverWrite {...h} />);
    await drag(editor);
    await act(async () => {
      fireEvent.keyDown(window, { key: "µ", code: "KeyM", metaKey: true, altKey: true });
    });
    expect(h.onNote).toHaveBeenCalledTimes(1);
  });

  it("hides Never write this for long selections and without a file", async () => {
    const editor = createMockEditor();
    const { rerender } = render(<SelectionToolbar editor={editor} canNeverWrite {...handlers()} />);
    await drag(editor, 1, 120, "x".repeat(119));
    expect(screen.queryByRole("button", { name: "Never write this" })).toBeNull();
    rerender(<SelectionToolbar editor={editor} canNeverWrite={false} {...handlers()} />);
    await drag(editor, 1, 11);
    expect(screen.queryByRole("button", { name: "Never write this" })).toBeNull();
  });

  it("inside an existing highlight offers Note and Remove highlight instead", async () => {
    vi.mocked(rangeFullyMarked).mockReturnValue(true);
    // A highlight excludes another highlight, so no range is "allowed" here.
    vi.mocked(allowedMarkRanges).mockReturnValue([]);
    const editor = createMockEditor();
    const h = handlers();
    render(<SelectionToolbar editor={editor} canNeverWrite {...h} />);
    await drag(editor);
    expect(screen.queryByRole("button", { name: "Highlight" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Note" }));
    });
    expect(h.onOpenHighlight).toHaveBeenCalledTimes(1);
    expect(h.onNote).not.toHaveBeenCalled();
    await drag(editor);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove highlight" }));
    });
    expect(h.onRemoveHighlight).toHaveBeenCalledTimes(1);
  });

  it("offers only Copy where highlights aren't allowed (code)", async () => {
    vi.mocked(allowedMarkRanges).mockReturnValue([]);
    const editor = createMockEditor();
    render(<SelectionToolbar editor={editor} canNeverWrite {...handlers()} />);
    await drag(editor);
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Highlight" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Note" })).toBeNull();
  });

  it("Esc, a collapsed selection, blur and suppression all hide it", async () => {
    const editor = createMockEditor();
    const { rerender } = render(<SelectionToolbar editor={editor} canNeverWrite {...handlers()} />);
    await drag(editor);
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(toolbar()).toBeNull();

    await drag(editor);
    await act(async () => {
      editor._select(5, 5);
    });
    expect(toolbar()).toBeNull();

    await drag(editor);
    await act(async () => {
      (editor as unknown as { isFocused: boolean }).isFocused = false;
      editor._trigger("blur");
    });
    expect(toolbar()).toBeNull();
    (editor as unknown as { isFocused: boolean }).isFocused = true;

    await drag(editor);
    rerender(<SelectionToolbar editor={editor} canNeverWrite suppressed {...handlers()} />);
    expect(toolbar()).toBeNull();
  });
});
