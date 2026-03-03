// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
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
};

const mockNotes: MarginNote[] = [];

describe("HighlightThread", () => {
  afterEach(cleanup);

  it("applies highlight color to excerpt border", () => {
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

    // HighlightThread renders via portal into document.body
    const excerpt = document.body.querySelector(".thread-excerpt");
    expect(excerpt).toBeTruthy();
    expect((excerpt as HTMLElement).style.borderLeftColor).toBe(
      "var(--color-highlight-blue)",
    );
  });

  it("uses yellow color for yellow highlights", () => {
    const yellowHighlight = { ...mockHighlight, color: "yellow" };
    render(
      <HighlightThread
        highlight={yellowHighlight}
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

    const excerpt = document.body.querySelector(".thread-excerpt");
    expect((excerpt as HTMLElement).style.borderLeftColor).toBe(
      "var(--color-highlight-yellow)",
    );
  });

  it("thread header label has thread-header-label class for 11px/0.08em styling", () => {
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

    const label = document.body.querySelector(".thread-header-label");
    expect(label).toBeTruthy();
    expect(label?.textContent).toBe("Notes");
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
});
