import { invoke } from "@tauri-apps/api/core";
import type { Document, FileEntry } from "@/types/document";
import type { CorrectionInput, CorrectionRecord, CorrectionDetail, DocumentCorrections } from "@/types/annotations";
import type { PersistedTab } from "@/types/tab";
import type { WritingType } from "@/lib/writing-types";

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

export async function updateCorrectionWritingType(highlightId: string, writingType: WritingType): Promise<void> {
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

export interface IndexAllResult {
  indexed: number;
  skipped: number;
  errors: number;
}

export async function indexAllDocuments(): Promise<IndexAllResult> {
  return invoke<IndexAllResult>("index_all_documents");
}

export type WritingRuleSeverity = "must-fix" | "should-fix" | "nice-to-fix";

export interface WritingRule {
  id: string;
  writingType: WritingType;
  category: string;
  ruleText: string;
  whenToApply: string | null;
  why: string | null;
  severity: WritingRuleSeverity;
  exampleBefore: string | null;
  exampleAfter: string | null;
  source: string;
  signalCount: number;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WritingRulesExportResult {
  markdownPath: string;
  hookPath: string;
  ruleCount: number;
}

export async function getWritingRules(writingType?: WritingType): Promise<WritingRule[]> {
  return invoke<WritingRule[]>(
    "get_writing_rules",
    writingType === undefined ? {} : { writingType },
  );
}

export async function exportWritingRules(): Promise<WritingRulesExportResult> {
  return invoke<WritingRulesExportResult>("export_writing_rules");
}

export async function getCorrectionsFlat(limit?: number): Promise<CorrectionDetail[]> {
  return invoke<CorrectionDetail[]>(
    "get_corrections_flat",
    limit === undefined ? {} : { limit },
  );
}

export async function bulkDeleteCorrections(highlightIds: string[]): Promise<number> {
  return invoke<number>("bulk_delete_corrections", { highlightIds });
}

export async function bulkTagCorrections(highlightIds: string[], writingType: string): Promise<number> {
  return invoke<number>("bulk_tag_corrections", { highlightIds, writingType });
}

export async function updateWritingRule(
  id: string,
  updates: {
    ruleText?: string;
    severity?: WritingRuleSeverity;
    whenToApply?: string;
    why?: string;
    exampleBefore?: string;
    exampleAfter?: string;
    notes?: string;
  },
): Promise<void> {
  return invoke<void>("update_writing_rule", {
    id,
    ruleText: updates.ruleText,
    severity: updates.severity,
    whenToApply: updates.whenToApply,
    why: updates.why,
    exampleBefore: updates.exampleBefore,
    exampleAfter: updates.exampleAfter,
    notes: updates.notes,
  });
}

export async function deleteWritingRule(id: string): Promise<void> {
  return invoke<void>("delete_writing_rule", { id });
}

export type SnapshotType = "pre_external_edit" | "manual";

export async function saveContentSnapshot(
  documentId: string,
  content: string,
  snapshotType: SnapshotType = "pre_external_edit",
): Promise<string> {
  return invoke<string>("save_content_snapshot", { documentId, content, snapshotType });
}

export async function getContentSnapshot(
  documentId: string,
  snapshotType: SnapshotType = "pre_external_edit",
): Promise<string | null> {
  return invoke<string | null>("get_content_snapshot", { documentId, snapshotType });
}

export async function deleteContentSnapshot(
  documentId: string,
  snapshotType: SnapshotType = "pre_external_edit",
): Promise<void> {
  return invoke<void>("delete_content_snapshot", { documentId, snapshotType });
}

export async function updateHighlightPositions(
  updates: [string, number, number][],
): Promise<void> {
  return invoke<void>("update_highlight_positions", { updates });
}
