import { invoke } from "@tauri-apps/api/core";
import type { Document, FileEntry } from "@/types/document";
import type { CorrectionInput, CorrectionRecord, DocumentCorrections } from "@/types/annotations";
import type { PersistedTab } from "@/types/tab";

export async function openFileDialog(): Promise<string | null> {
  return invoke<string | null>("open_file_dialog");
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export async function saveFile(path: string, content: string): Promise<void> {
  return invoke<void>("save_file", { path, content });
}

export async function listMarkdownFiles(dir: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_markdown_files", { dir });
}

export async function getRecentDocuments(limit?: number): Promise<Document[]> {
  return invoke<Document[]>("get_recent_documents", { limit });
}

export async function upsertDocument(doc: Document): Promise<Document> {
  return invoke<Document>("upsert_document", { doc });
}

export async function renameFile(oldPath: string, newName: string): Promise<Document> {
  return invoke<Document>("rename_file", { oldPath, newName });
}

export async function drainPendingOpenFiles(): Promise<string[]> {
  return invoke<string[]>("drain_pending_open_files");
}

export async function getOpenTabs(): Promise<PersistedTab[]> {
  return invoke<PersistedTab[]>("get_open_tabs");
}

export async function saveOpenTabs(tabs: PersistedTab[]): Promise<void> {
  return invoke<void>("save_open_tabs", { tabs });
}

export async function persistCorrections(
  corrections: CorrectionInput[],
  documentId: string,
  documentTitle: string | null,
  documentSource: string,
  documentPath: string | null,
  exportDate: string,
): Promise<string> {
  return invoke<string>("persist_corrections", {
    corrections,
    documentId,
    documentTitle,
    documentSource,
    documentPath,
    exportDate,
  });
}

export async function getAllCorrections(limit?: number): Promise<CorrectionRecord[]> {
  return invoke<CorrectionRecord[]>(
    "get_all_corrections",
    limit === undefined ? {} : { limit },
  );
}

export async function getCorrectionsCount(): Promise<number> {
  return invoke<number>("get_corrections_count");
}

export async function getCorrectionsByDocument(limit?: number): Promise<DocumentCorrections[]> {
  return invoke<DocumentCorrections[]>(
    "get_corrections_by_document",
    limit === undefined ? {} : { limit },
  );
}

export async function updateCorrectionWritingType(highlightId: string, writingType: string): Promise<void> {
  return invoke<void>("update_correction_writing_type", { highlightId, writingType });
}

export async function deleteCorrection(highlightId: string): Promise<void> {
  return invoke<void>("delete_correction", { highlightId });
}

export async function exportCorrectionsJson(path?: string): Promise<number> {
  return invoke<number>(
    "export_corrections_json",
    path === undefined ? {} : { path },
  );
}
