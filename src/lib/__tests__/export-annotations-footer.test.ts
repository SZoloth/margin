import { describe, it, expect } from "vitest";
import { formatAnnotationsMarkdown } from "../export-annotations";
import type { Highlight, MarginNote } from "@/types/annotations";
import type { Document } from "@/types/document";

// Minimal Editor mock: only needs state.doc.textBetween and state.doc.content.size
function mockEditor(text: string) {
  return {
    state: {
      doc: {
        content: { size: text.length },
        textBetween: (from: number, to: number, separator: string) => {
          return text.slice(from, to).replace(/\n/g, separator);
        },
        resolve: () => ({
          depth: 1,
          node: () => ({ isBlock: true }),
          start: () => 0,
          end: () => text.length,
        }),
      },
    },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const baseDoc: Document = {
  id: "doc-1",
  source: "file",
  file_path: "/test/file.md",
  keep_local_id: null,
  title: "Test Document",
  author: null,
  url: null,
  word_count: 100,
  last_opened_at: 1000,
  created_at: 1000,
};

function highlight(overrides: Partial<Highlight> = {}): Highlight {
  return {
    id: "h1",
    document_id: "doc-1",
    color: "yellow",
    text_content: "highlighted text",
    from_pos: 0,
    to_pos: 16,
    prefix_context: null,
    suffix_context: null,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

function marginNote(overrides: Partial<MarginNote> = {}): MarginNote {
  return {
    id: "n1",
    highlight_id: "h1",
    content: "This needs work",
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

const WQG_MARKER = "/writing-quality-gate editorial";
const RULES_PATH = "~/.margin/writing-rules.md";

describe("formatAnnotationsMarkdown WQG footer", () => {
  it("includes WQG footer when highlights have matching margin notes", async () => {
    const result = await formatAnnotationsMarkdown({
      document: baseDoc,
      editor: mockEditor("highlighted text and more"),
      highlights: [highlight()],
      marginNotes: [marginNote()],
    });

    expect(result).toContain(WQG_MARKER);
    expect(result).toContain(RULES_PATH);
  });

  it("omits WQG footer when no margin notes exist", async () => {
    const result = await formatAnnotationsMarkdown({
      document: baseDoc,
      editor: mockEditor("highlighted text and more"),
      highlights: [highlight()],
      marginNotes: [],
    });

    expect(result).not.toContain(WQG_MARKER);
  });

  it("omits WQG footer when notes exist but no matching highlights (orphaned notes)", async () => {
    const result = await formatAnnotationsMarkdown({
      document: baseDoc,
      editor: mockEditor("highlighted text and more"),
      highlights: [highlight({ id: "h1" })],
      marginNotes: [marginNote({ highlight_id: "h-nonexistent" })],
    });

    expect(result).not.toContain(WQG_MARKER);
  });

  it("omits WQG footer when there are no highlights at all", async () => {
    const result = await formatAnnotationsMarkdown({
      document: baseDoc,
      editor: mockEditor("some text"),
      highlights: [],
      marginNotes: [],
    });

    expect(result).not.toContain(WQG_MARKER);
    expect(result).toContain("No annotations to export");
  });

  it("includes footer when multiple highlights and at least one has a note", async () => {
    const result = await formatAnnotationsMarkdown({
      document: baseDoc,
      editor: mockEditor("highlighted text and more text to highlight"),
      highlights: [
        highlight({ id: "h1", from_pos: 0, to_pos: 16 }),
        highlight({ id: "h2", from_pos: 20, to_pos: 40 }),
      ],
      marginNotes: [marginNote({ highlight_id: "h2" })],
    });

    expect(result).toContain(WQG_MARKER);
  });

  it("footer appears after all annotations", async () => {
    const result = await formatAnnotationsMarkdown({
      document: baseDoc,
      editor: mockEditor("highlighted text and more"),
      highlights: [highlight()],
      marginNotes: [marginNote()],
    });

    const footerIdx = result.indexOf(WQG_MARKER);
    const lastAnnotationIdx = result.lastIndexOf("**Note:**");
    expect(footerIdx).toBeGreaterThan(lastAnnotationIdx);
  });
});
