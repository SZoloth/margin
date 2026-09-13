import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { HighlightThread } from "../HighlightThread";
import type { Highlight, MarginNote } from "@/types/annotations";

const mockHighlight: Highlight = {
  id: "h1",
  document_id: "doc1",
  color: "blue",
  text_content: "test excerpt",
  from_pos: 0,
  to_pos: 12,
  prefix_context: "",
  suffix_context: "",
  created_at: Date.now(),
  updated_at: Date.now(),
  exported_at: null,
};

const mockNotes: MarginNote[] = [];

describe("HighlightThread", () => {
  // HighlightThread's close-on-click-outside useEffect uses setTimeout(..., 0) to
  // defer adding the mousedown listener. In React 19, this pending macrotask keeps
  // the act() work loop running indefinitely when the worker thread processes multiple
  // test files sequentially (fileParallelism: false). Fake timers prevent the setTimeout
  // from creating a pending macrotask that bleeds act() work into subsequent test files,
  // causing the first test in downstream files to hang for minutes.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders the unified top row with a Remove action", () => {
    render(
      <HighlightThread
        highlight={mockHighlight}
        notes={mockNotes}
        onAddNote={vi.fn()}
        onUpdateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onDeleteHighlight={vi.fn()}
        onClose={vi.fn()}
        anchorRect={new DOMRect(100, 100, 200, 20)}
        isVisible={true}
      />,
    );

    const top = document.body.querySelector(".thread-top");
    expect(top).toBeTruthy();
    const remove = top?.querySelector(".note-action-btn--delete");
    expect(remove?.textContent).toBe("Remove");
  });

  it("save button has note-action-btn--primary class", () => {
    render(
      <HighlightThread
        highlight={mockHighlight}
        notes={mockNotes}
        onAddNote={vi.fn()}
        onUpdateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onDeleteHighlight={vi.fn()}
        onClose={vi.fn()}
        anchorRect={new DOMRect(100, 100, 200, 20)}
        isVisible={true}
      />,
    );

    // Type into the textarea to reveal the Save button
    const textarea = document.body.querySelector(".thread-textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "test note" } });

    const saveBtn = document.body.querySelector(".note-action-btn--primary");
    expect(saveBtn).toBeTruthy();
    expect(saveBtn?.textContent).toBe("Save");
  });

  it("renders in-thread color swatches that recolor via onRecolor", () => {
    const onRecolor = vi.fn();
    render(
      <HighlightThread
        highlight={mockHighlight}
        notes={mockNotes}
        onAddNote={vi.fn()}
        onUpdateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onDeleteHighlight={vi.fn()}
        onRecolor={onRecolor}
        onClose={vi.fn()}
        anchorRect={new DOMRect(100, 100, 200, 20)}
        isVisible={true}
      />,
    );

    const group = document.body.querySelector("[role='radiogroup'][aria-label='Highlight color']");
    expect(group).toBeTruthy();

    // Current color (blue) is the checked radio — ring hugs the dot, not the button
    const blue = group?.querySelector("[aria-label='Highlight blue']") as HTMLButtonElement;
    expect(blue.getAttribute("aria-checked")).toBe("true");
    expect(blue.querySelector(".thread-color-dot--selected")).toBeTruthy();

    const pink = group?.querySelector("[aria-label='Highlight pink']") as HTMLButtonElement;
    fireEvent.click(pink);
    expect(onRecolor).toHaveBeenCalledWith("h1", "pink");
  });

  it("hides the swatch row when onRecolor is not provided", () => {
    render(
      <HighlightThread
        highlight={mockHighlight}
        notes={mockNotes}
        onAddNote={vi.fn()}
        onUpdateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onDeleteHighlight={vi.fn()}
        onClose={vi.fn()}
        anchorRect={new DOMRect(100, 100, 200, 20)}
        isVisible={true}
      />,
    );

    expect(document.body.querySelector(".thread-colors")).toBeNull();
  });

  it("renders an anchor hairline from the highlight edge to the thread", () => {
    render(
      <HighlightThread
        highlight={mockHighlight}
        notes={mockNotes}
        onAddNote={vi.fn()}
        onUpdateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onDeleteHighlight={vi.fn()}
        onClose={vi.fn()}
        anchorRect={new DOMRect(100, 100, 200, 20)}
        isVisible={true}
      />,
    );

    const line = document.body.querySelector(".thread-anchor-line") as HTMLElement;
    expect(line).toBeTruthy();
    // Starts at the highlight's right edge (x=300), ends at the popover's left
    expect(line.style.left).toBe("300px");
    expect(line.style.top).toBe("110px"); // passage midline
    expect(parseFloat(line.style.width)).toBeGreaterThanOrEqual(8);
  });
});
