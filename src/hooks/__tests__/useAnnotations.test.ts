// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnnotations } from "../useAnnotations";

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fakeHighlight = (id: string, docId: string) => ({
  id,
  document_id: docId,
  color: "yellow",
  text_content: "test",
  from_pos: 0,
  to_pos: 4,
  prefix_context: null,
  suffix_context: null,
  created_at: 1000,
  updated_at: 1000,
});

const fakeNote = (id: string, highlightId: string) => ({
  id,
  highlight_id: highlightId,
  content: "a note",
  created_at: 1000,
  updated_at: 1000,
});

describe("useAnnotations", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe("loadAnnotations", () => {
    it("ignores out-of-order responses when switching documents quickly", async () => {
      const doc1Highlights = deferred<ReturnType<typeof fakeHighlight>[]>();
      const doc1Notes = deferred<ReturnType<typeof fakeNote>[]>();
      const doc2Highlights = deferred<ReturnType<typeof fakeHighlight>[]>();
      const doc2Notes = deferred<ReturnType<typeof fakeNote>[]>();

      mockInvoke.mockImplementation((command: unknown, args: unknown) => {
        const cmd = String(command);
        const a = (args ?? {}) as { documentId?: string };
        if (cmd === "get_highlights" && a.documentId === "doc1") return doc1Highlights.promise;
        if (cmd === "get_margin_notes" && a.documentId === "doc1") return doc1Notes.promise;
        if (cmd === "get_highlights" && a.documentId === "doc2") return doc2Highlights.promise;
        if (cmd === "get_margin_notes" && a.documentId === "doc2") return doc2Notes.promise;
        throw new Error(`Unexpected invoke: ${cmd} ${JSON.stringify(args)}`);
      });

      const { result } = renderHook(() => useAnnotations());

      let p1: Promise<void>;
      let p2: Promise<void>;
      act(() => {
        p1 = result.current.loadAnnotations("doc1");
      });
      act(() => {
        p2 = result.current.loadAnnotations("doc2");
      });

      await act(async () => {
        doc2Highlights.resolve([fakeHighlight("h2", "doc2")]);
        doc2Notes.resolve([fakeNote("n2", "h2")]);
        await p2;
      });
      expect(result.current.isLoaded).toBe(true);
      expect(result.current.highlights.map((h) => h.document_id)).toEqual(["doc2"]);
      expect(result.current.marginNotes.map((n) => n.highlight_id)).toEqual(["h2"]);

      await act(async () => {
        doc1Highlights.resolve([fakeHighlight("h1", "doc1")]);
        doc1Notes.resolve([fakeNote("n1", "h1")]);
        await p1;
      });
      // Late doc1 response should not clobber doc2 state.
      expect(result.current.highlights.map((h) => h.document_id)).toEqual(["doc2"]);
      expect(result.current.marginNotes.map((n) => n.highlight_id)).toEqual(["h2"]);
    });
  });

  describe("clearAnnotations", () => {
    it("invokes delete_all_highlights_for_document and clears state", async () => {
      // Setup: load some annotations first
      mockInvoke
        .mockResolvedValueOnce([fakeHighlight("h1", "doc1")]) // get_highlights
        .mockResolvedValueOnce([fakeNote("n1", "h1")])         // get_margin_notes
        .mockResolvedValueOnce(1);                              // delete_all_highlights_for_document

      const onMutate = vi.fn();
      const { result } = renderHook(() => useAnnotations(onMutate));

      // Load annotations
      await act(async () => {
        await result.current.loadAnnotations("doc1");
      });
      expect(result.current.highlights).toHaveLength(1);
      expect(result.current.marginNotes).toHaveLength(1);

      // Clear
      await act(async () => {
        await result.current.clearAnnotations("doc1");
      });

      // Verify invoke was called with correct command
      expect(mockInvoke).toHaveBeenCalledWith(
        "delete_all_highlights_for_document",
        { documentId: "doc1" },
      );

      // State is cleared
      expect(result.current.highlights).toEqual([]);
      expect(result.current.marginNotes).toEqual([]);

      // onMutate was NOT called for clear
      expect(onMutate).not.toHaveBeenCalled();
    });

    it("does not clear local state when clearing a different document", async () => {
      // Load doc2 into local state
      mockInvoke
        .mockResolvedValueOnce([fakeHighlight("h2", "doc2")]) // get_highlights
        .mockResolvedValueOnce([fakeNote("n2", "h2")]) // get_margin_notes
        .mockResolvedValueOnce(1); // delete_all_highlights_for_document (doc1)

      const { result } = renderHook(() => useAnnotations());
      await act(async () => {
        await result.current.loadAnnotations("doc2");
      });

      expect(result.current.highlights).toHaveLength(1);
      expect(result.current.highlights[0]?.document_id).toBe("doc2");

      await act(async () => {
        await result.current.clearAnnotations("doc1");
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "delete_all_highlights_for_document",
        { documentId: "doc1" },
      );
      // Local state should still reflect doc2
      expect(result.current.highlights).toHaveLength(1);
      expect(result.current.highlights[0]?.document_id).toBe("doc2");
      expect(result.current.marginNotes).toHaveLength(1);
      expect(result.current.marginNotes[0]?.highlight_id).toBe("h2");
    });
  });
});
