import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  Highlight,
  MarginNote,
} from "@/types/annotations";

export interface UseAnnotationsReturn {
  highlights: Highlight[];
  marginNotes: MarginNote[];
  isLoaded: boolean;

  loadAnnotations: (documentId: string) => Promise<void>;

  createHighlight: (params: {
    documentId: string;
    color: string;
    textContent: string;
    fromPos: number;
    toPos: number;
    prefixContext: string | null;
    suffixContext: string | null;
  }) => Promise<Highlight>;
  updateHighlight: (params: {
    id: string;
    color: string;
    textContent: string;
    fromPos: number;
    toPos: number;
    prefixContext: string | null;
    suffixContext: string | null;
  }) => Promise<void>;
  /** Bulk-sync stored positions after re-anchoring marks to the edited doc. */
  updatePositions: (updates: [string, number, number][]) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;

  createMarginNote: (highlightId: string, content: string) => Promise<MarginNote>;
  createMarginNoteWithIntent: (
    highlightId: string,
    content: string,
    intent: MarginNote["intent"],
  ) => Promise<MarginNote>;
  updateMarginNote: (id: string, content: string) => Promise<void>;
  deleteMarginNote: (id: string) => Promise<void>;

  clearAnnotations: (documentId: string) => Promise<void>;

  restoreFromCache: (documentId: string, highlights: Highlight[], marginNotes: MarginNote[]) => void;
  /** Drop all local annotation state — used when the last tab closes. */
  reset: () => void;
}

export function useAnnotations(
  onMutate?: () => void,
  captureFeedback = false,
): UseAnnotationsReturn {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const currentDocumentIdRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);

  const loadAnnotations = useCallback(async (documentId: string) => {
    const seq = ++loadSeqRef.current;
    const prevDocId = currentDocumentIdRef.current;
    currentDocumentIdRef.current = documentId;
    setIsLoaded(false);
    if (prevDocId !== documentId) {
      setHighlights([]);
      setMarginNotes([]);
    }
    try {
      const [loadedHighlights, loadedNotes] = await Promise.all([
        invoke<Highlight[]>("get_highlights", { documentId }),
        invoke<MarginNote[]>("get_margin_notes", { documentId }),
      ]);
      if (loadSeqRef.current !== seq || currentDocumentIdRef.current !== documentId) {
        return;
      }
      setHighlights(loadedHighlights);
      setMarginNotes(loadedNotes);
    } finally {
      if (loadSeqRef.current === seq && currentDocumentIdRef.current === documentId) {
        setIsLoaded(true);
      }
    }
  }, []);

  const createHighlight = useCallback(
    async (params: {
      documentId: string;
      color: string;
      textContent: string;
      fromPos: number;
      toPos: number;
      prefixContext: string | null;
      suffixContext: string | null;
    }): Promise<Highlight> => {
      const highlight = await invoke<Highlight>("create_highlight", {
        documentId: params.documentId,
        color: params.color,
        textContent: params.textContent,
        fromPos: params.fromPos,
        toPos: params.toPos,
        prefixContext: params.prefixContext,
        suffixContext: params.suffixContext,
      });
      if (currentDocumentIdRef.current === highlight.document_id) {
        setHighlights((prev) => [...prev, highlight]);
      }
      onMutate?.();
      return highlight;
    },
    [onMutate],
  );

  const updateHighlight = useCallback(
    async (params: {
      id: string;
      color: string;
      textContent: string;
      fromPos: number;
      toPos: number;
      prefixContext: string | null;
      suffixContext: string | null;
    }): Promise<void> => {
      await invoke("update_highlight", {
        id: params.id,
        color: params.color,
        textContent: params.textContent,
        fromPos: params.fromPos,
        toPos: params.toPos,
        prefixContext: params.prefixContext,
        suffixContext: params.suffixContext,
      });
      const updated_at = Date.now();
      setHighlights((prev) =>
        prev.map((h) =>
          h.id === params.id
            ? {
                ...h,
                color: params.color,
                text_content: params.textContent,
                from_pos: params.fromPos,
                to_pos: params.toPos,
                prefix_context: params.prefixContext,
                suffix_context: params.suffixContext,
                updated_at,
              }
            : h,
        ),
      );
      onMutate?.();
    },
    [onMutate],
  );

  const updatePositions = useCallback(
    async (updates: [string, number, number][]) => {
      if (updates.length === 0) return;
      await invoke("update_highlight_positions", { updates });
      const positions = new Map(updates.map(([id, from, to]) => [id, { from, to }]));
      setHighlights((prev) =>
        prev.map((h) => {
          const p = positions.get(h.id);
          return p ? { ...h, from_pos: p.from, to_pos: p.to } : h;
        }),
      );
    },
    [],
  );

  const deleteHighlight = useCallback(async (id: string) => {
    await invoke("delete_highlight", { id });
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setMarginNotes((prev) => prev.filter((n) => n.highlight_id !== id));
    onMutate?.();
  }, [onMutate]);

  const createMarginNoteWithIntent = useCallback(
    async (
      highlightId: string,
      content: string,
      intent: MarginNote["intent"],
    ): Promise<MarginNote> => {
      const note = await invoke<MarginNote>("create_margin_note", {
        highlightId,
        content,
        intent,
        captureFeedback,
      });
      setMarginNotes((prev) => [...prev, note]);
      onMutate?.();
      return note;
    },
    [onMutate, captureFeedback],
  );

  const createMarginNote = useCallback(
    (highlightId: string, content: string): Promise<MarginNote> =>
      createMarginNoteWithIntent(highlightId, content, "correction"),
    [createMarginNoteWithIntent],
  );

  const updateMarginNote = useCallback(
    async (id: string, content: string) => {
      await invoke("update_margin_note", { id, content, captureFeedback });
      setMarginNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, content, updated_at: Date.now() } : n,
        ),
      );
      onMutate?.();
    },
    [onMutate, captureFeedback],
  );

  const deleteMarginNote = useCallback(async (id: string) => {
    await invoke("delete_margin_note", { id, captureFeedback });
    setMarginNotes((prev) => prev.filter((n) => n.id !== id));
    onMutate?.();
  }, [onMutate, captureFeedback]);

  const clearAnnotations = useCallback(async (documentId: string) => {
    await invoke("delete_all_highlights_for_document", { documentId });
    if (currentDocumentIdRef.current !== documentId) return;
    setHighlights([]);
    setMarginNotes([]);
    setIsLoaded(true);
  }, []);

  const restoreFromCache = useCallback((documentId: string, cachedHighlights: Highlight[], cachedMarginNotes: MarginNote[]) => {
    currentDocumentIdRef.current = documentId;
    // Invalidate any in-flight loads for a previous document.
    loadSeqRef.current += 1;
    setHighlights(cachedHighlights);
    setMarginNotes(cachedMarginNotes);
    setIsLoaded(true);
  }, []);

  const reset = useCallback(() => {
    currentDocumentIdRef.current = null;
    loadSeqRef.current += 1;
    setHighlights([]);
    setMarginNotes([]);
    setIsLoaded(false);
  }, []);

  return {
    highlights,
    marginNotes,
    isLoaded,
    loadAnnotations,
    createHighlight,
    updateHighlight,
    updatePositions,
    deleteHighlight,
    createMarginNote,
    createMarginNoteWithIntent,
    updateMarginNote,
    deleteMarginNote,
    clearAnnotations,
    restoreFromCache,
    reset,
  };
}
