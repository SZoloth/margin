import type { Editor } from "@tiptap/core";
import type { Highlight, MarginNote } from "@/types/annotations";
import type { Document } from "@/types/document";

interface ExportParams {
  document: Document;
  editor: Editor;
  highlights: Highlight[];
  marginNotes: MarginNote[];
}

function posToLineNumber(editor: Editor, pos: number): number {
  try {
    const docSize = editor.state.doc.content.size;
    const clampedPos = Math.min(pos, docSize);
    const textBefore = editor.state.doc.textBetween(0, clampedPos, "\n");
    return textBefore.split("\n").length;
  } catch {
    return -1;
  }
}

function posToLineRange(editor: Editor, from: number, to: number): string {
  const startLine = posToLineNumber(editor, from);
  const endLine = posToLineNumber(editor, to);

  if (startLine === -1 || endLine === -1) return "Line ?";
  if (startLine === endLine) return `Line ${startLine}`;
  return `Lines ${startLine}-${endLine}`;
}

function quoteText(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

export async function formatAnnotationsMarkdown(
  params: ExportParams,
): Promise<string> {
  const { document: doc, editor, highlights, marginNotes } = params;

  // Build note lookup: highlight_id -> MarginNote[]
  const notesByHighlight = new Map<string, MarginNote[]>();
  for (const note of marginNotes) {
    const existing = notesByHighlight.get(note.highlight_id) ?? [];
    existing.push(note);
    notesByHighlight.set(note.highlight_id, existing);
  }

  // Build items sorted by position
  const items = [...highlights].sort((a, b) => a.from_pos - b.from_pos);

  if (items.length === 0) {
    return "_No annotations to export._";
  }

  // Header
  const lines: string[] = [];
  if (doc.source === "file" && doc.file_path) {
    lines.push(`# Annotations: \`${doc.file_path}\``);
  } else {
    lines.push(`# Annotations: "${doc.title ?? "Untitled"}"`);
    if (doc.url) {
      lines.push(`_Source: ${doc.url}_`);
    }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  lines.push("");
  lines.push(
    `_Exported from Margin — ${dateStr} ${timeStr} — ${items.length} annotations_`,
  );

  // Annotations
  for (const highlight of items) {
    lines.push("");
    lines.push("---");
    lines.push("");

    const lineRange = posToLineRange(editor, highlight.from_pos, highlight.to_pos);
    lines.push(`### ${lineRange} -- ${highlight.color} highlight`);
    lines.push(quoteText(highlight.text_content));

    const notes = notesByHighlight.get(highlight.id);
    if (notes && notes.length > 0) {
      lines.push("");
      for (const note of notes) {
        lines.push(`**Note:** ${note.content}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
