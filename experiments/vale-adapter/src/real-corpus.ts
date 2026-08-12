import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import type { Detection, ValeAlert } from "./types.ts";

export interface CatalogDocument {
  id: string;
  filePath: string | null;
  wordCount: number;
  createdAt: number;
  correctionCount: number;
  writingType: string;
}

export interface SelectedDocument {
  id: string;
  filePath: string;
  content: string;
  contentSha256: string;
  wordCount: number;
  writingType: string;
  correctionCount: number;
  labelStatus: "correction-history-only" | "unlabeled";
}

export interface SelectionResult {
  documents: SelectedDocument[];
  skips: Array<{ id: string; reason: "missing-file" | "duplicate-content" }>;
}

export interface DocumentValidation {
  documentId: string;
  path: string;
  content: string;
  raw: Detection[];
  vale: ValeAlert[];
  correctionCount: number;
  labelStatus: SelectedDocument["labelStatus"];
}

export interface AggregateValidation {
  documents: number;
  documentsWithCorrectionHistory: number;
  humanLabeledDocuments: number;
  rawAlerts: number;
  valeAlerts: number;
  sharedAlerts: number;
  rawOnlyAlerts: number;
  valeOnlyAlerts: number;
  adjudicationRequired: number;
}

export interface PrivateReviewItem {
  documentId: string;
  documentPath: string;
  ruleId: string;
  rawDetected: boolean;
  valeDetected: boolean;
  matchedText: string;
  excerpt: string;
  rawOffset: [number, number] | null;
  valeLocation: { line: number; span: [number, number] } | null;
  correctionHistoryAvailable: boolean;
  humanLabel: "violation" | "acceptable" | "uncertain" | null;
  note: string;
}

interface SelectionOptions {
  limit: number;
  read: (path: string) => string | undefined;
}

export function assertPrivateOutputPath(outputPath: string, homeDirectory: string): string {
  const output = resolve(outputPath);
  const privateRoot = resolve(homeDirectory, ".margin", "experiments");
  if (output !== privateRoot && !output.startsWith(`${privateRoot}${sep}`)) {
    throw new Error(`private output must stay under ${privateRoot}`);
  }
  return output;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function selectRealDocuments(
  rows: readonly CatalogDocument[],
  options: SelectionOptions,
): SelectionResult {
  const ordered = [...rows]
    .filter((row) => row.filePath?.toLowerCase().endsWith(".md") && row.wordCount >= 100)
    .sort(
      (a, b) =>
        Number(b.correctionCount > 0) - Number(a.correctionCount > 0) ||
        b.correctionCount - a.correctionCount ||
        b.createdAt - a.createdAt ||
        a.id.localeCompare(b.id),
    );
  const documents: SelectedDocument[] = [];
  const skips: SelectionResult["skips"] = [];
  const seenHashes = new Set<string>();

  for (const row of ordered) {
    const filePath = row.filePath;
    if (!filePath) continue;
    const content = options.read(filePath);
    if (content == null) {
      skips.push({ id: row.id, reason: "missing-file" });
      continue;
    }
    const contentSha256 = sha256(content);
    if (seenHashes.has(contentSha256)) {
      skips.push({ id: row.id, reason: "duplicate-content" });
      continue;
    }
    seenHashes.add(contentSha256);
    documents.push({
      id: row.id,
      filePath,
      content,
      contentSha256,
      wordCount: row.wordCount,
      writingType: row.writingType || "general",
      correctionCount: row.correctionCount,
      labelStatus: row.correctionCount > 0 ? "correction-history-only" : "unlabeled",
    });
    if (documents.length === options.limit) break;
  }

  return { documents, skips };
}

function keys(ruleIds: readonly string[]): Set<string> {
  return new Set(ruleIds);
}

export function summarizeRealValidation(
  results: readonly DocumentValidation[],
): AggregateValidation {
  let rawAlerts = 0;
  let valeAlerts = 0;
  let sharedAlerts = 0;
  let rawOnlyAlerts = 0;
  let valeOnlyAlerts = 0;

  for (const result of results) {
    const raw = keys(result.raw.map((alert) => alert.ruleId));
    const vale = keys(result.vale.map((alert) => alert.ruleId));
    rawAlerts += raw.size;
    valeAlerts += vale.size;
    for (const ruleId of raw) {
      if (vale.has(ruleId)) sharedAlerts += 1;
      else rawOnlyAlerts += 1;
    }
    for (const ruleId of vale) {
      if (!raw.has(ruleId)) valeOnlyAlerts += 1;
    }
  }

  return {
    documents: results.length,
    documentsWithCorrectionHistory: results.filter((result) => result.correctionCount > 0).length,
    humanLabeledDocuments: 0,
    rawAlerts,
    valeAlerts,
    sharedAlerts,
    rawOnlyAlerts,
    valeOnlyAlerts,
    adjudicationRequired: sharedAlerts + rawOnlyAlerts + valeOnlyAlerts,
  };
}

function excerptFor(content: string, match: string): string {
  const index = match ? content.indexOf(match) : -1;
  if (index < 0) return "";
  const start = Math.max(0, index - 100);
  const end = Math.min(content.length, index + match.length + 100);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

export function buildPrivateReview(
  results: readonly DocumentValidation[],
): PrivateReviewItem[] {
  const items: PrivateReviewItem[] = [];
  for (const result of results) {
    const raw = new Map(result.raw.map((alert) => [alert.ruleId, alert]));
    const vale = new Map(result.vale.map((alert) => [alert.ruleId, alert]));
    const ruleIds = [...new Set([...raw.keys(), ...vale.keys()])].sort();
    for (const ruleId of ruleIds) {
      const rawAlert = raw.get(ruleId);
      const valeAlert = vale.get(ruleId);
      const matchedText = valeAlert?.match || rawAlert?.match || "";
      items.push({
        documentId: result.documentId,
        documentPath: result.path,
        ruleId,
        rawDetected: rawAlert != null,
        valeDetected: valeAlert != null,
        matchedText,
        excerpt: excerptFor(result.content, matchedText),
        rawOffset: rawAlert ? [rawAlert.start, rawAlert.end] : null,
        valeLocation: valeAlert ? { line: valeAlert.line, span: valeAlert.span } : null,
        correctionHistoryAvailable: result.correctionCount > 0,
        humanLabel: null,
        note: "",
      });
    }
  }
  return items;
}
