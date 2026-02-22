import { useState, useEffect, useCallback, useRef } from "react";
import type { Document } from "@/types/document";
import {
  openFileDialog,
  readFile,
  saveFile as saveFileCommand,
  upsertDocument,
  getRecentDocuments,
  renameFile,
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
  openFilePath: (path: string) => Promise<void>;
  openRecentDocument: (doc: Document) => Promise<void>;
  openKeepLocalArticle: (doc: Document, markdown: string) => Promise<void>;
  saveCurrentFile: () => Promise<void>;
  renameDocFile: (doc: Document, newName: string) => Promise<void>;
  setContent: (newContent: string) => void;
  setContentExternal: (newContent: string) => void;
}

export function useDocument(): UseDocumentReturn {
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [content, setContentState] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoadingRaw] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delay showing loading state to avoid flash for fast loads
  const setIsLoading = useCallback((v: boolean) => {
    if (v) {
      loadingTimerRef.current = setTimeout(() => setIsLoadingRaw(true), 150);
    } else {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
      setIsLoadingRaw(false);
    }
  }, []);
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

  const openFilePath = useCallback(async (path: string) => {
    try {
      setIsLoading(true);
      const fileContent = await readFile(path);
      const title = basename(path);
      const now = Date.now();

      const doc: Document = {
        id: currentDoc?.file_path === path ? currentDoc.id : crypto.randomUUID(),
        source: "file",
        file_path: path,
        keep_local_id: null,
        title,
        author: null,
        url: null,
        word_count: countWords(fileContent),
        last_opened_at: now,
        created_at: currentDoc?.file_path === path ? currentDoc.created_at : now,
      };

      const saved = await upsertDocument(doc);

      setFilePath(path);
      setContentState(fileContent);
      setCurrentDoc(saved);
      setIsDirty(false);
      refreshRecentDocs();
    } catch (err) {
      console.error("Failed to open file path:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentDoc, refreshRecentDocs]);

  const openRecentDocument = useCallback(async (recentDoc: Document) => {
    // Skip if already viewing this document
    if (currentDoc?.id === recentDoc.id) return;

    if (recentDoc.source === "file" && recentDoc.file_path) {
      try {
        setIsLoading(true);
        const fileContent = await readFile(recentDoc.file_path);
        const now = Date.now();
        const updated: Document = {
          ...recentDoc,
          word_count: countWords(fileContent),
          last_opened_at: now,
        };
        const saved = await upsertDocument(updated);
        setFilePath(recentDoc.file_path);
        setContentState(fileContent);
        setCurrentDoc(saved);
        setIsDirty(false);
        refreshRecentDocs();
      } catch (err) {
        console.error("Failed to open recent file:", err);
      } finally {
        setIsLoading(false);
      }
    }
    // keep-local docs need external content fetch — handled by App.tsx
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

  const renameDocFile = useCallback(async (targetDoc: Document, newName: string) => {
    if (!targetDoc.file_path) return;
    try {
      const updated = await renameFile(targetDoc.file_path, newName);
      // If renaming the currently open document, update local state
      if (currentDoc?.id === targetDoc.id) {
        setCurrentDoc(updated);
        setFilePath(updated.file_path);
      }
      refreshRecentDocs();
    } catch (err) {
      console.error("Failed to rename file:", err);
      throw err;
    }
  }, [currentDoc, refreshRecentDocs]);

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
    openFilePath,
    openRecentDocument,
    openKeepLocalArticle,
    saveCurrentFile,
    renameDocFile,
    setContent,
    setContentExternal,
  };
}
