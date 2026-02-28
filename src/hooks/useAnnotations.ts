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
  deleteHighlight: (id: string) => Promise<void>;

  createMarginNote: (highlightId: string, content: string) => Promise<MarginNote>;
  updateMarginNote: (id: string, content: string) => Promise<void>;
  deleteMarginNote: (id: string) => Promise<void>;

  clearAnnotations: (documentId: string) => Promise<void>;

  restoreFromCache: (documentId: string, highlights: Highlight[], marginNotes: MarginNote[]) => void;
}

export function useAnnotations(onMutate?: () => void): UseAnnotationsReturn {
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

  const deleteHighlight = useCallback(async (id: string) => {
    await invoke("delete_highlight", { id });
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setMarginNotes((prev) => prev.filter((n) => n.highlight_id !== id));
    onMutate?.();
  }, [onMutate]);

  const createMarginNote = useCallback(
    async (highlightId: string, content: string): Promise<MarginNote> => {
      const note = await invoke<MarginNote>("create_margin_note", {
        highlightId,
        content,
      });
      setMarginNotes((prev) => [...prev, note]);
      onMutate?.();
      return note;
    },
    [onMutate],
  );

  const updateMarginNote = useCallback(
    async (id: string, content: string) => {
      await invoke("update_margin_note", { id, content });
      setMarginNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, content, updated_at: Date.now() } : n,
        ),
      );
      onMutate?.();
    },
    [onMutate],
  );

  const deleteMarginNote = useCallback(async (id: string) => {
    await invoke("delete_margin_note", { id });
    setMarginNotes((prev) => prev.filter((n) => n.id !== id));
    onMutate?.();
  }, [onMutate]);

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

  return {
    highlights,
    marginNotes,
    isLoaded,
    loadAnnotations,
    createHighlight,
    deleteHighlight,
    createMarginNote,
    updateMarginNote,
    deleteMarginNote,
    clearAnnotations,
    restoreFromCache,
  };
}
