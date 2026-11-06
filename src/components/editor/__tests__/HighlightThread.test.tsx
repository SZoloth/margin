import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
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
    const remove = top?.querySelector(".thread-icon-btn--destructive");
    expect(remove?.getAttribute("aria-label")).toBe("Remove highlight and notes");
    const close = top?.querySelector(".thread-icon-btn:not(.thread-icon-btn--destructive)");
    expect(close).toBeTruthy();
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
    expect(line.style.top).toBe("123px"); // inter-line leading below the mark — underlines no text
    expect(parseFloat(line.style.width)).toBeGreaterThanOrEqual(8);
  });

  describe("Never write this", () => {
    const renderWith = (props: Partial<React.ComponentProps<typeof HighlightThread>>) =>
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
          {...props}
        />,
      );

    it("makes a Hard rule from the highlighted phrase and says so", async () => {
      const onNeverWrite = vi.fn().mockResolvedValue(undefined);
      renderWith({ onNeverWrite });
      const button = document.body.querySelector(".thread-never-btn") as HTMLButtonElement;
      expect(button.textContent).toBe("Never write this");
      await act(async () => {
        fireEvent.click(button);
      });
      expect(onNeverWrite).toHaveBeenCalledWith(mockHighlight);
      expect(document.body.querySelector(".thread-never-done")?.textContent).toContain(
        "Hard rule: never write “test excerpt”",
      );
    });

    it("echoes the rule in the reader's own casing, not the guard's lowercase", async () => {
      const onNeverWrite = vi.fn().mockResolvedValue(undefined);
      renderWith({ onNeverWrite, highlight: { ...mockHighlight, text_content: "I hope this finds you well" } });
      await act(async () => {
        fireEvent.click(document.body.querySelector(".thread-never-btn")!);
      });
      expect(document.body.querySelector(".thread-never-done")?.textContent).toContain(
        "never write “I hope this finds you well”",
      );
    });

    it("says nothing was saved when the rule fails", async () => {
      const onNeverWrite = vi.fn().mockRejectedValue(new Error("disk full"));
      renderWith({ onNeverWrite });
      await act(async () => {
        fireEvent.click(document.body.querySelector(".thread-never-btn")!);
      });
      expect(document.body.querySelector(".thread-never-done")).toBeNull();
      expect(document.body.querySelector(".thread-never-error")?.textContent).toContain("disk full");
    });

    it("isn't offered for a selection too long to ban word for word", () => {
      renderWith({
        onNeverWrite: vi.fn(),
        highlight: { ...mockHighlight, text_content: "a whole sentence ".repeat(6) },
      });
      expect(document.body.querySelector(".thread-never-btn")).toBeNull();
    });
  });
});
