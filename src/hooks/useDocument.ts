import { useState, useEffect, useCallback, useRef } from "react";
import type { Document } from "@/types/document";
import {
  openFileDialog,
  readFile,
  saveFile as saveFileCommand,
  upsertDocument,
  getRecentDocuments,
} from "@/lib/tauri-commands";

function basename(filePath: string): string {
  const segments = filePath.split(/[/\\]/);
  const filename = segments[segments.length - 1] ?? "";
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0) return filename;
  return filename.slice(0, dotIndex);
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

export interface UseDocumentReturn {
  currentDoc: Document | null;
  recentDocs: Document[];
  content: string;
  filePath: string | null;
  isDirty: boolean;
  isLoading: boolean;
  openFile: () => Promise<void>;
  openKeepLocalArticle: (doc: Document, markdown: string) => Promise<void>;
  saveCurrentFile: () => Promise<void>;
  setContent: (newContent: string) => void;
  setContentExternal: (newContent: string) => void;
}

export function useDocument(): UseDocumentReturn {
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [content, setContentState] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Track keep-local doc IDs so we can reuse them
  const keepLocalDocMapRef = useRef<Map<string, Document>>(new Map());

  // Load recent documents on mount
  useEffect(() => {
    getRecentDocuments(20)
      .then((docs) => {
        setRecentDocs(docs);
        // Populate keep-local doc map from recent docs
        for (const d of docs) {
          if (d.source === "keep-local" && d.keep_local_id) {
            keepLocalDocMapRef.current.set(d.keep_local_id, d);
          }
        }
      })
      .catch(console.error);
  }, []);

  // User edit — marks dirty
  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setIsDirty(true);
  }, []);

  // External update (file watcher) — does NOT mark dirty
  const setContentExternal = useCallback((newContent: string) => {
    setContentState(newContent);
  }, []);

  const refreshRecentDocs = useCallback(() => {
    getRecentDocuments(20).then(setRecentDocs).catch(console.error);
  }, []);

  const openFile = useCallback(async () => {
    try {
      const selectedPath = await openFileDialog();
      if (!selectedPath) return;

      setIsLoading(true);
      const fileContent = await readFile(selectedPath);
      const title = basename(selectedPath);
      const now = Date.now();

      const doc: Document = {
        id: currentDoc?.file_path === selectedPath ? currentDoc.id : crypto.randomUUID(),
        source: "file",
        file_path: selectedPath,
        keep_local_id: null,
        title,
        author: null,
        url: null,
        word_count: countWords(fileContent),
        last_opened_at: now,
        created_at: currentDoc?.file_path === selectedPath ? currentDoc.created_at : now,
      };

      const saved = await upsertDocument(doc);

      setFilePath(selectedPath);
      setContentState(fileContent);
      setCurrentDoc(saved);
      setIsDirty(false);
      refreshRecentDocs();
    } catch (err) {
      console.error("Failed to open file:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentDoc, refreshRecentDocs]);

  const openKeepLocalArticle = useCallback(async (docRecord: Document, markdown: string) => {
    try {
      // Reuse existing document ID if this keep-local article was opened before
      const existingDoc = docRecord.keep_local_id
        ? keepLocalDocMapRef.current.get(docRecord.keep_local_id)
        : null;

      const finalDoc: Document = existingDoc
        ? { ...existingDoc, last_opened_at: Date.now(), word_count: docRecord.word_count }
        : docRecord;

      const saved = await upsertDocument(finalDoc);

      // Cache for future lookups
      if (saved.keep_local_id) {
        keepLocalDocMapRef.current.set(saved.keep_local_id, saved);
      }

      setFilePath(null);
      setContentState(markdown);
      setCurrentDoc(saved);
      setIsDirty(false);
      refreshRecentDocs();
    } catch (err) {
      console.error("Failed to open keep-local article:", err);
    }
  }, [refreshRecentDocs]);

  const saveCurrentFile = useCallback(async () => {
    if (!filePath || !isDirty) return;

    try {
      await saveFileCommand(filePath, content);
      setIsDirty(false);

      if (currentDoc) {
        const updated: Document = {
          ...currentDoc,
          word_count: countWords(content),
          last_opened_at: Date.now(),
        };
        const saved = await upsertDocument(updated);
        setCurrentDoc(saved);
        refreshRecentDocs();
      }
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, [filePath, isDirty, content, currentDoc, refreshRecentDocs]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === "s") {
        e.preventDefault();
        void saveCurrentFile();
      }

      if (isMod && e.key === "o") {
        e.preventDefault();
        void openFile();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveCurrentFile, openFile]);

  return {
    currentDoc,
    recentDocs,
    content,
    filePath,
    isDirty,
    isLoading,
    openFile,
    openKeepLocalArticle,
    saveCurrentFile,
    setContent,
    setContentExternal,
  };
}
