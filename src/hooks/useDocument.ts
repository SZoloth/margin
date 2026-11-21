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
import { reportError } from "@/lib/error-bus";

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

export type ContentProvider = () => string | null | false;

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
  /** Resolves false when the write failed; the document stays dirty. */
  saveCurrentFile: () => Promise<boolean>;
  /** Write a non-active tab's draft to its file. Resolves false on failure. */
  saveFileContent: (path: string, body: string) => Promise<boolean>;
  isSelfSave: (path: string) => boolean;
  refreshRecentDocs: () => void;
  renameDocFile: (doc: Document, newName: string) => Promise<void>;
  setContent: (newContent: string) => void;
  markDirty: () => void;
  /**
   * The provider returns the editor's Markdown, null when there's no editor,
   * or false when the editor's content can't be written as Markdown.
   */
  registerContentProvider: (fn: ContentProvider | null) => void;
  setContentExternal: (newContent: string) => void;
  restoreFromCache: (doc: Document | null, content: string, filePath: string | null, isDirty: boolean) => void;
}

export function useDocument(): UseDocumentReturn {
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [content, setContentState] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoadingRaw] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Loads can overlap (cold launch restores a tab while opening the file
  // macOS handed us). Count them so one finishing can't orphan another's
  // timer, which would leave the reader dimmed for good.
  const pendingLoadsRef = useRef(0);

  // Delay showing loading state to avoid flash for fast loads
  const setIsLoading = useCallback((v: boolean) => {
    if (v) {
      pendingLoadsRef.current += 1;
      if (!loadingTimerRef.current) {
        loadingTimerRef.current = setTimeout(() => {
          loadingTimerRef.current = null;
          if (pendingLoadsRef.current > 0) setIsLoadingRaw(true);
        }, 150);
      }
    } else {
      pendingLoadsRef.current = Math.max(0, pendingLoadsRef.current - 1);
      if (pendingLoadsRef.current > 0) return;
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
      setIsLoadingRaw(false);
    }
  }, []);
  // Track self-saves by path + timestamp so the file watcher can skip reloads.
  // Uses a time-window approach: all watcher events for the saved path within
  // the window are suppressed (handles multiple FS events per save).
  const selfSaveRef = useRef<{ path: string; until: number } | null>(null);

  // Every edit bumps the revision. A save clears the dirty flag only if no
  // edit landed and no other document opened while its write was in flight.
  const revisionRef = useRef(0);
  const currentDocIdRef = useRef<string | null>(null);
  currentDocIdRef.current = currentDoc?.id ?? null;
  const filePathRef = useRef<string | null>(null);
  filePathRef.current = filePath;

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
      .catch((err) => reportError("Could not load recent documents", err));
  }, []);

  // User edit — marks dirty
  const setContent = useCallback((newContent: string) => {
    revisionRef.current += 1;
    setContentState(newContent);
    setIsDirty(true);
  }, []);

  // Cheap immediate dirty signal — the editor emits serialized content on a
  // debounce, but save paths key off isDirty and must see edits instantly.
  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setIsDirty(true);
  }, []);

  // Save paths pull content straight from the editor when available, so a
  // pending debounce can never make Cmd+S (or quit-save) write stale text.
  const contentProviderRef = useRef<ContentProvider | null>(null);
  const registerContentProvider = useCallback((fn: ContentProvider | null) => {
    contentProviderRef.current = fn;
  }, []);

  // External update (file watcher) — does NOT mark dirty
  const setContentExternal = useCallback((newContent: string) => {
    setContentState(newContent);
  }, []);

  const refreshRecentDocs = useCallback(() => {
    getRecentDocuments(20)
      .then(setRecentDocs)
      .catch((err) => reportError("Could not load recent documents", err));
  }, []);

  const openFile = useCallback(async () => {
    let started = false;
    try {
      const selectedPath = await openFileDialog();
      if (!selectedPath) return;

      setIsLoading(true);
      started = true;
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
      reportError("Could not open file", err);
    } finally {
      if (started) setIsLoading(false);
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
      reportError(`Could not open "${basename(path)}"`, err);
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
        reportError(`Could not open "${recentDoc.title ?? basename(recentDoc.file_path)}"`, err);
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
      reportError(`Could not open "${docRecord.title ?? "article"}"`, err);
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
      reportError(`Could not rename "${targetDoc.title ?? "file"}"`, err);
      throw err;
    }
  }, [currentDoc, refreshRecentDocs]);

  const writeToDisk = useCallback(async (path: string, body: string): Promise<boolean> => {
    // Mark this path as self-saved for 1s so the file watcher skips the reload
    selfSaveRef.current = { path, until: Date.now() + 1000 };
    try {
      await saveFileCommand(path, body);
      return true;
    } catch (err) {
      selfSaveRef.current = null;
      reportError(`Could not save "${basename(path)}"`, err);
      return false;
    }
  }, []);

  const saveCurrentFile = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;

    // Keep-local articles have no file to write. Annotations are already in
    // SQLite and don't make a document dirty, so dirty means the text changed.
    if (!filePath) {
      reportError(`Margin can't save edits to an article's text. Copy them out before you close "${currentDoc?.title ?? "the article"}".`);
      return false;
    }

    const fresh = contentProviderRef.current?.() ?? null;
    if (fresh === false) {
      reportError(`Finish the review before saving "${basename(filePath)}".`);
      return false;
    }
    const body = fresh ?? content;
    if (fresh !== null && fresh !== content) {
      setContentState(fresh);
    }
    const revision = revisionRef.current;
    const docId = currentDoc?.id ?? null;
    const savedPath = filePath;
    if (!(await writeToDisk(savedPath, body))) return false;
    const stillCurrent = currentDocIdRef.current === docId && filePathRef.current === savedPath;
    if (stillCurrent && revisionRef.current === revision) setIsDirty(false);

    if (currentDoc) {
      try {
        const saved = await upsertDocument({
          ...currentDoc,
          word_count: countWords(body),
          last_opened_at: Date.now(),
        });
        if (currentDocIdRef.current === saved.id) setCurrentDoc(saved);
        refreshRecentDocs();
      } catch (err) {
        reportError(`Saved "${basename(savedPath)}" but could not update its details`, err);
      }
    }
    return true;
  }, [filePath, isDirty, content, currentDoc, refreshRecentDocs, writeToDisk]);

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
    saveFileContent: writeToDisk,
    isSelfSave,
    refreshRecentDocs,
    renameDocFile,
    setContent,
    setContentExternal,
    markDirty,
    registerContentProvider,
    restoreFromCache,
  };
}
