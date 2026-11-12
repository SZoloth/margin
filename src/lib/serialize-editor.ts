import type { Editor } from "@tiptap/core";

/**
 * Serialize the editor to markdown, refusing while diff marks are present.
 * If diff marks leak into markdown, deleted text persists as plain text
 * (or ~~text~~ if Strike claims <del> tags) — so callers must treat `null`
 * as "not safe to serialize right now" and keep their previous content.
 */
export function serializeEditorMarkdown(editor: Editor): string | null {
  let hasDiffMarks = false;
  editor.state.doc.descendants((node) => {
    if (hasDiffMarks) return false;
    if (node.marks.some((m) => m.type.name === "diffMark")) {
      hasDiffMarks = true;
      return false;
    }
  });
  if (hasDiffMarks) return null;
  return editor.storage.markdown.getMarkdown() as string;
}
