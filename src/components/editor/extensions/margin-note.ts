import { Mark, mergeAttributes } from "@tiptap/core";

export interface MarginNoteAttributes {
  noteId: string;
  highlightId: string;
}

export const MarginNote = Mark.create({
  name: "marginNote",

  addAttributes() {
    return {
      noteId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.dataset.noteId,
        renderHTML: (attributes: Record<string, string>) => ({
          "data-note-id": attributes.noteId,
        }),
      },
      highlightId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.dataset.highlightId,
        renderHTML: (attributes: Record<string, string>) => ({
          "data-highlight-id": attributes.highlightId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-note-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "margin-note-indicator",
      }),
      0,
    ];
  },
});
