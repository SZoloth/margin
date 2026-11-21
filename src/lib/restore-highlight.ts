import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import type { Highlight, MarginNote } from "@/types/annotations";

export interface RestoreHighlightArgs {
  highlight: Highlight;
  notes: { content: string; intent: MarginNote["intent"] }[];
  editor: Editor | null;
  /** The document the editor is showing now, which may not be the highlight's. */
  currentDocId: string | null;
  dispatch?: (editor: Editor, tr: Transaction) => void;
  annotations: {
    createHighlight: (p: {
      documentId: string;
      color: string;
      textContent: string;
      fromPos: number;
      toPos: number;
      prefixContext: string | null;
      suffixContext: string | null;
    }) => Promise<Highlight>;
    createMarginNoteWithIntent: (
      highlightId: string,
      content: string,
      intent: MarginNote["intent"],
    ) => Promise<unknown>;
  };
}

/**
 * Undo a highlight delete. The row and its notes go back under the
 * highlight's own document first; the editor mark is redrawn only if that
 * document is still on screen and its old range still holds the same text.
 * Otherwise the mark comes back when the document next loads its highlights.
 */
export async function restoreHighlightWithNotes({
  highlight: h,
  notes,
  editor,
  currentDocId,
  dispatch = (ed, tr) => ed.view.dispatch(tr),
  annotations,
}: RestoreHighlightArgs): Promise<Highlight> {
  const restored = await annotations.createHighlight({
    documentId: h.document_id,
    color: h.color,
    textContent: h.text_content,
    fromPos: h.from_pos,
    toPos: h.to_pos,
    prefixContext: h.prefix_context,
    suffixContext: h.suffix_context,
  });
  for (const n of notes) {
    await annotations.createMarginNoteWithIntent(restored.id, n.content, n.intent);
  }

  if (!editor || editor.isDestroyed || currentDocId !== h.document_id) return restored;
  const markType = editor.state.schema.marks.highlight;
  const doc = editor.state.doc;
  if (!markType || h.to_pos > doc.content.size || h.from_pos >= h.to_pos) return restored;
  if (doc.textBetween(h.from_pos, h.to_pos, "\n") !== h.text_content) return restored;
  dispatch(
    editor,
    editor.state.tr.addMark(
      h.from_pos,
      h.to_pos,
      markType.create({ color: h.color, highlightId: restored.id }),
    ),
  );
  return restored;
}
