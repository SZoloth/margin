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
  isSelfSave: (path: string) => boolean;
  refreshRecentDocs: () => void;
  renameDocFile: (doc: Document, newName: string) => Promise<void>;
  setContent: (newContent: string) => void;
  setContentExternal: (newContent: string) => void;
  restoreFromCache: (doc: Document | null, content: string, filePath: string | null, isDirty: boolean) => void;
  triggerAutosave: () => void;
}

export function useDocument(autosaveEnabled = false): UseDocumentReturn {
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
  // Track self-saves by path + timestamp so the file watcher can skip reloads.
  // Uses a time-window approach: all watcher events for the saved path within
  // the window are suppressed (handles multiple FS events per save).
  const selfSaveRef = useRef<{ path: string; until: number } | null>(null);

  const isSelfSave = useCallback((path: string): boolean => {
    const entry = selfSaveRef.current;
    if (!entry) return false;
    if (entry.path !== path) return false;
    if (Date.now() > entry.until) {
      selfSaveRef.current = null;
      return false;
    }
    return true;
  }, []);

  // Track keep-local doc IDs so we can reuse them
  const keepLocalDocMapRef = useRef<Map<string, Document>>(new Map());
  // Track docs by file path so we can preserve last_opened_at on re-open
  const fileDocMapRef = useRef<Map<string, Document>>(new Map());

  // Load recent documents on mount
  useEffect(() => {
    getRecentDocuments(20)
      .then((docs) => {
        setRecentDocs(docs);
        // Populate lookup maps from recent docs
        for (const d of docs) {
          if (d.source === "keep-local" && d.keep_local_id) {
            keepLocalDocMapRef.current.set(d.keep_local_id, d);
          }
          if (d.file_path) {
            fileDocMapRef.current.set(d.file_path, d);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Autosave: debounced 2s after edit
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveCurrentFileRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const scheduleAutosave = useCallback(() => {
    if (!autosaveEnabled) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void saveCurrentFileRef.current?.();
    }, 2000);
  }, [autosaveEnabled]);

  // Clean up autosave timer on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // User edit — marks dirty
  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setIsDirty(true);
    scheduleAutosave();
  }, [scheduleAutosave]);

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
      const existing = currentDoc?.file_path === selectedPath
        ? currentDoc
        : fileDocMapRef.current.get(selectedPath);

      const doc: Document = {
        id: existing?.id ?? crypto.randomUUID(),
        source: "file",
        file_path: selectedPath,
        keep_local_id: null,
        title,
        author: null,
        url: null,
        word_count: countWords(fileContent),
        last_opened_at: existing?.last_opened_at ?? now,
        created_at: existing?.created_at ?? now,
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
      const existing = currentDoc?.file_path === path
        ? currentDoc
        : fileDocMapRef.current.get(path);

      const doc: Document = {
        id: existing?.id ?? crypto.randomUUID(),
        source: "file",
        file_path: path,
        keep_local_id: null,
        title,
        author: null,
        url: null,
        word_count: countWords(fileContent),
        last_opened_at: existing?.last_opened_at ?? now,
        created_at: existing?.created_at ?? now,
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
        const updated: Document = {
          ...recentDoc,
          word_count: countWords(fileContent),
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
        ? { ...existingDoc, word_count: docRecord.word_count }
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
    if (!isDirty) return;

    // Keep-local articles have no file path — annotations are already in SQLite,
    // so just clear the dirty flag.
    if (!filePath) {
      setIsDirty(false);
      return;
    }

    try {
      // Strip any <mark> tags that TipTap's serializer may leak into markdown
      const clean = content.replace(/<\/?mark[^>]*>/g, "");
      // Mark this path as self-saved for 1s so the file watcher skips the reload
      selfSaveRef.current = { path: filePath, until: Date.now() + 1000 };
      await saveFileCommand(filePath, clean);
      setIsDirty(false);

      if (currentDoc) {
        const updated: Document = {
          ...currentDoc,
          word_count: countWords(clean),
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

  // Keep saveCurrentFileRef in sync
  saveCurrentFileRef.current = saveCurrentFile;

  // Trigger autosave from external sources (e.g. margin note edits)
  const triggerAutosave = useCallback(() => {
    scheduleAutosave();
  }, [scheduleAutosave]);

  const restoreFromCache = useCallback((
    cachedDoc: Document | null,
    cachedContent: string,
    cachedFilePath: string | null,
    cachedIsDirty: boolean,
  ) => {
    setCurrentDoc(cachedDoc);
    setContentState(cachedContent);
    setFilePath(cachedFilePath);
    setIsDirty(cachedIsDirty);
  }, []);

  // Cmd+S to save (Cmd+O moved to useTabs)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === "s") {
        e.preventDefault();
        void saveCurrentFile();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveCurrentFile]);

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
    isSelfSave,
    refreshRecentDocs,
    renameDocFile,
    setContent,
    setContentExternal,
    restoreFromCache,
    triggerAutosave,
  };
}
