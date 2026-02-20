import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      // FTS5 needs proper query format - wrap terms for prefix matching
      const ftsQuery = q
        .trim()
        .split(/\s+/)
        .map((t) => `"${t}"*`)
        .join(" ");
      const results = await invoke<SearchResult[]>("search_documents", {
        query: ftsQuery,
        limit: 20,
      });
      setResults(results);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
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

  return { results, isSearching, query, search, indexDocument, removeIndex };
}
