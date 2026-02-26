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

  // AbortController ref for cancelling in-flight searches
  const searchIdRef = useRef(0);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      setFileResults([]);
      setIsSearching(false);
      return;
    }

    // Increment search ID to cancel previous in-flight search
    const thisSearchId = ++searchIdRef.current;

    // FTS5 search — no debounce, fires on every keystroke (<5ms for local FTS)
    setIsSearching(true);
    invoke<SearchResult[]>("search_documents", {
      query: q.trim(),
      limit: 20,
    })
      .then((ftsResults) => {
        // Only update if this is still the latest search
        if (searchIdRef.current !== thisSearchId) return;
        setResults(ftsResults);
      })
      .catch((err) => {
        if (searchIdRef.current !== thisSearchId) return;
        console.error("FTS search failed:", err);
        setResults([]);
      })
      .finally(() => {
        if (searchIdRef.current !== thisSearchId) return;
        // If FTS returned results, no need for mdfind
        // Only fall back to mdfind if no FTS results
      });

    // Debounced mdfind fallback (200ms) — only for file-on-disk discovery
    // This is secondary to FTS5 and runs in the background
    const mdfindTimeout = setTimeout(async () => {
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
      } finally {
        if (searchIdRef.current !== thisSearchId) return;
        setIsSearching(false);
      }
    }, 200);

    // Cleanup timeout if search is cancelled
    return () => clearTimeout(mdfindTimeout);
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
