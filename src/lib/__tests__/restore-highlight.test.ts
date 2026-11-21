import { describe, it, expect, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { MultiColorHighlight } from "@/components/editor/extensions/highlight";
import { restoreHighlightWithNotes } from "../restore-highlight";
import type { Highlight } from "@/types/annotations";

function highlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    id: "h-old",
    document_id: "doc-a",
    color: "yellow",
    text_content: "hello",
    from_pos: 1,
    to_pos: 6,
    prefix_context: null,
    suffix_context: null,
    created_at: 1,
    updated_at: 1,
    exported_at: null,
    ...overrides,
  } as Highlight;
}

function api() {
  return {
    createHighlight: vi.fn().mockImplementation(async (p: { documentId: string }) =>
      highlight({ id: "h-new", document_id: p.documentId })),
    createMarginNoteWithIntent: vi.fn().mockResolvedValue({}),
  };
}

function marked(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((n) => {
    for (const m of n.marks) if (m.type.name === "highlight") ids.push(m.attrs.highlightId);
  });
  return ids;
}

const notes = [{ content: "too vague", intent: "correction" as const }];

describe("restoreHighlightWithNotes", () => {
  it("restores the mark and notes when the document is still open", async () => {
    const editor = new Editor({ extensions: [StarterKit, MultiColorHighlight.configure({ multicolor: true })], content: "<p>hello world</p>" });
    const a = api();
    await restoreHighlightWithNotes({ highlight: highlight(), notes, editor, currentDocId: "doc-a", annotations: a });
    expect(marked(editor)).toContain("h-new");
    expect(a.createMarginNoteWithIntent).toHaveBeenCalledWith("h-new", "too vague", "correction");
    editor.destroy();
  });

  it("after a switch to another document, restores notes without marking that document", async () => {
    const editor = new Editor({ extensions: [StarterKit, MultiColorHighlight.configure({ multicolor: true })], content: "<p>other text here</p>" });
    const a = api();
    await restoreHighlightWithNotes({ highlight: highlight(), notes, editor, currentDocId: "doc-b", annotations: a });
    expect(marked(editor)).toEqual([]);
    expect(a.createHighlight).toHaveBeenCalledWith(expect.objectContaining({ documentId: "doc-a" }));
    expect(a.createMarginNoteWithIntent).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it("restores notes even when the old range no longer fits the document", async () => {
    const editor = new Editor({ extensions: [StarterKit, MultiColorHighlight.configure({ multicolor: true })], content: "<p>hi</p>" });
    const a = api();
    await restoreHighlightWithNotes({ highlight: highlight({ from_pos: 40, to_pos: 60 }), notes, editor, currentDocId: "doc-a", annotations: a });
    expect(a.createMarginNoteWithIntent).toHaveBeenCalledTimes(1);
    expect(marked(editor)).toEqual([]);
    editor.destroy();
  });
});
