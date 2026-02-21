import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  Highlight,
  HighlightColor,
  MarginNote,
} from "@/types/annotations";

export interface UseAnnotationsReturn {
  highlights: Highlight[];
  marginNotes: MarginNote[];
  isLoaded: boolean;

  loadAnnotations: (documentId: string) => Promise<void>;

  createHighlight: (params: {
    documentId: string;
    color: HighlightColor;
    textContent: string;
    fromPos: number;
    toPos: number;
    prefixContext: string | null;
    suffixContext: string | null;
  }) => Promise<Highlight>;
  updateHighlightColor: (id: string, color: HighlightColor) => Promise<void>;
  deleteHighlight: (id: string) => Promise<void>;

  createMarginNote: (highlightId: string, content: string) => Promise<MarginNote>;
  updateMarginNote: (id: string, content: string) => Promise<void>;
  deleteMarginNote: (id: string) => Promise<void>;
}

export function useAnnotations(): UseAnnotationsReturn {
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
      color: HighlightColor;
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
      return highlight;
    },
    [],
  );

  const updateHighlightColor = useCallback(
    async (id: string, color: HighlightColor) => {
      await invoke("update_highlight_color", { id, color });
      setHighlights((prev) =>
        prev.map((h) =>
          h.id === id ? { ...h, color, updated_at: Date.now() } : h,
        ),
      );
    },
    [],
  );

  const deleteHighlight = useCallback(async (id: string) => {
    await invoke("delete_highlight", { id });
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    setMarginNotes((prev) => prev.filter((n) => n.highlight_id !== id));
  }, []);

  const createMarginNote = useCallback(
    async (highlightId: string, content: string): Promise<MarginNote> => {
      const note = await invoke<MarginNote>("create_margin_note", {
        highlightId,
        content,
      });
      setMarginNotes((prev) => [...prev, note]);
      return note;
    },
    [],
  );

  const updateMarginNote = useCallback(
    async (id: string, content: string) => {
      await invoke("update_margin_note", { id, content });
      setMarginNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, content, updated_at: Date.now() } : n,
        ),
      );
    },
    [],
  );

  const deleteMarginNote = useCallback(async (id: string) => {
    await invoke("delete_margin_note", { id });
    setMarginNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return {
    highlights,
    marginNotes,
    isLoaded,
    loadAnnotations,
    createHighlight,
    updateHighlightColor,
    deleteHighlight,
    createMarginNote,
    updateMarginNote,
    deleteMarginNote,
  };
}
