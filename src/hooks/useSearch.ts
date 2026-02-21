import { useState, useCallback, useRef } from "react";
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      setFileResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);

    // Debounce filesystem search (Spotlight can be slow on first call)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const files = await invoke<FileSearchResult[]>("search_files_on_disk", {
          query: q.trim(),
          limit: 20,
        });
        setFileResults(files);
      } catch (err) {
        console.error("File search failed:", err);
        setFileResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 150);
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

  return { results, fileResults, isSearching, query, search, indexDocument, removeIndex };
}
