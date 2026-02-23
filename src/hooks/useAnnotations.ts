import { useState, useCallback } from "react";
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

  restoreFromCache: (highlights: Highlight[], marginNotes: MarginNote[]) => void;
}

export function useAnnotations(onMutate?: () => void): UseAnnotationsReturn {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadAnnotations = useCallback(async (documentId: string) => {
    setIsLoaded(false);
    const [loadedHighlights, loadedNotes] = await Promise.all([
      invoke<Highlight[]>("get_highlights", { documentId }),
      invoke<MarginNote[]>("get_margin_notes", { documentId }),
    ]);
    setHighlights(loadedHighlights);
    setMarginNotes(loadedNotes);
    setIsLoaded(true);
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
      setHighlights((prev) => [...prev, highlight]);
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

  const restoreFromCache = useCallback((cachedHighlights: Highlight[], cachedMarginNotes: MarginNote[]) => {
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
    restoreFromCache,
  };
}
