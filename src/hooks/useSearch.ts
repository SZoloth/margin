import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
}

interface FileSearchResult {
  path: string;
  filename: string;
}

export interface FileResult {
  path: string;
  filename: string;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);

  const searchIdRef = useRef(0);
  const mdfindTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);

    // Clear pending mdfind timeout from previous keystroke
    if (mdfindTimeoutRef.current !== null) {
      clearTimeout(mdfindTimeoutRef.current);
      mdfindTimeoutRef.current = null;
    }

    // Increment search ID to cancel previous in-flight results
    const thisSearchId = ++searchIdRef.current;

    if (!q.trim()) {
      setResults([]);
      setFileResults([]);
      setIsSearching(false);
      return;
    }

    // FTS5 search — no debounce, fires on every keystroke (<5ms for local FTS)
    setIsSearching(true);
    invoke<SearchResult[]>("search_documents", {
      query: q.trim(),
      limit: 20,
    })
      .then((ftsResults) => {
        if (searchIdRef.current !== thisSearchId) return;
        setResults(ftsResults);
        setIsSearching(false);
      })
      .catch((err) => {
        if (searchIdRef.current !== thisSearchId) return;
        console.error("FTS search failed:", err);
        setResults([]);
        setIsSearching(false);
      });

    // Debounced mdfind fallback (200ms) — secondary file-on-disk discovery
    mdfindTimeoutRef.current = setTimeout(async () => {
      if (searchIdRef.current !== thisSearchId) return;
      try {
        const files = await invoke<FileSearchResult[]>("search_files_on_disk", {
          query: q.trim(),
          limit: 20,
        });
        if (searchIdRef.current !== thisSearchId) return;
        setFileResults(files);
      } catch (err) {
        if (searchIdRef.current !== thisSearchId) return;
        console.error("File search failed:", err);
        setFileResults([]);
      }
    }, 200);
  }, []);

  const indexDocument = useCallback(
    async (documentId: string, title: string, content: string) => {
      try {
        await invoke("index_document", { documentId, title, content });
      } catch (err) {
        console.error("Index failed:", err);
      }
    },
    []
  );

  const removeIndex = useCallback(async (documentId: string) => {
    try {
      await invoke("remove_document_index", { documentId });
    } catch (err) {
      console.error("Remove index failed:", err);
    }
  }, []);

  // Background indexing on mount
  useEffect(() => {
    let cancelled = false;
    setIsIndexing(true);
    invoke<{ indexed: number; skipped: number; errors: number }>(
      "index_all_documents"
    )
      .then((result) => {
        if (cancelled) return;
        if (result.indexed > 0) {
          console.log(
            `Indexed ${result.indexed} documents (${result.skipped} skipped, ${result.errors} errors)`
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Background indexing failed:", err);
      })
      .finally(() => {
        if (cancelled) return;
        setIsIndexing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up mdfind timeout on unmount
  useEffect(() => {
    return () => {
      if (mdfindTimeoutRef.current !== null) {
        clearTimeout(mdfindTimeoutRef.current);
      }
    };
  }, []);

  return {
    results,
    fileResults,
    isSearching,
    isIndexing,
    query,
    search,
    indexDocument,
    removeIndex,
  };
}
