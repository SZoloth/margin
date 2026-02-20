import { useState, useEffect, useCallback } from "react";
import type { Document } from "@/types/document";
import {
  openFileDialog,
  readFile,
  saveFile as saveFileCommand,
  upsertDocument,
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
  content: string;
  filePath: string | null;
  isDirty: boolean;
  isLoading: boolean;
  openFile: () => Promise<void>;
  openKeepLocalArticle: (doc: Document, markdown: string) => Promise<void>;
  saveCurrentFile: () => Promise<void>;
  setContent: (newContent: string) => void;
}

export function useDocument(): UseDocumentReturn {
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [content, setContentState] = useState<string>("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setIsDirty(true);
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
    } catch (err) {
      console.error("Failed to open file:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentDoc]);

  const openKeepLocalArticle = useCallback(async (docRecord: Document, markdown: string) => {
    try {
      const saved = await upsertDocument(docRecord);
      setFilePath(null); // keep-local articles have no local file path
      setContentState(markdown);
      setCurrentDoc(saved);
      setIsDirty(false);
    } catch (err) {
      console.error("Failed to open keep-local article:", err);
    }
  }, []);

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
      }
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }, [filePath, isDirty, content, currentDoc]);

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
    content,
    filePath,
    isDirty,
    isLoading,
    openFile,
    openKeepLocalArticle,
    saveCurrentFile,
    setContent,
  };
}
