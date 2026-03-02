import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { nowMillis } from "../db.js";
import { findTextInDocument, createHighlight } from "./annotations.js";
import { getDocument } from "./documents.js";

export interface CorrectionRecord {
  originalText: string;
  notes: string[];
  highlightColor: string;
  documentTitle: string | null;
  documentId: string;
  createdAt: number;
  writingType: string | null;
  prefixContext: string | null;
  suffixContext: string | null;
  extendedContext: string | null;
}

export interface CorrectionsSummary {
  total: number;
  byWritingType: { writingType: string | null; count: number }[];
  byDocument: { documentId: string; documentTitle: string | null; count: number }[];
}

export function getCorrections(
  db: Database.Database,
  documentId?: string,
  limit: number = 200,
): CorrectionRecord[] {
  const clampedLimit = Math.min(Math.max(limit, 1), 2000);

  if (documentId) {
    const rows = db
      .prepare(
        `SELECT original_text as originalText, notes_json as notesJson, highlight_color as highlightColor,
                document_title as documentTitle, document_id as documentId, created_at as createdAt,
                writing_type as writingType, prefix_context as prefixContext, suffix_context as suffixContext,
                extended_context as extendedContext
         FROM corrections
         WHERE document_id = ? AND session_id != '__backfilled__'
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(documentId, clampedLimit) as RawCorrectionRow[];
    return rows.map(parseRow);
  }

  const rows = db
    .prepare(
      `SELECT original_text as originalText, notes_json as notesJson, highlight_color as highlightColor,
              document_title as documentTitle, document_id as documentId, created_at as createdAt,
              writing_type as writingType, prefix_context as prefixContext, suffix_context as suffixContext,
              extended_context as extendedContext
       FROM corrections
       WHERE session_id != '__backfilled__'
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(clampedLimit) as RawCorrectionRow[];
  return rows.map(parseRow);
}

export function getCorrectionsSummary(
  db: Database.Database,
): CorrectionsSummary {
  const total = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM corrections WHERE session_id != '__backfilled__'",
      )
      .get() as { count: number }
  ).count;

  const byType = db
    .prepare(
      `SELECT writing_type as writingType, COUNT(*) as count
       FROM corrections
       WHERE session_id != '__backfilled__'
       GROUP BY writing_type
       ORDER BY count DESC`,
    )
    .all() as { writingType: string | null; count: number }[];

  const byDoc = db
    .prepare(
      `SELECT document_id as documentId, document_title as documentTitle, COUNT(*) as count
       FROM corrections
       WHERE session_id != '__backfilled__'
       GROUP BY document_id
       ORDER BY count DESC`,
    )
    .all() as { documentId: string; documentTitle: string | null; count: number }[];

  return {
    total,
    byWritingType: byType,
    byDocument: byDoc,
  };
}

interface RawCorrectionRow {
  originalText: string;
  notesJson: string;
  highlightColor: string;
  documentTitle: string | null;
  documentId: string;
  createdAt: number;
  writingType: string | null;
  prefixContext: string | null;
  suffixContext: string | null;
  extendedContext: string | null;
}

export interface CreateCorrectionResult {
  correction_id: string;
  highlight_id: string;
  session_id: string;
}

export function createCorrection(
  db: Database.Database,
  params: {
    document_id: string;
    original_text: string;
    notes: string[];
    writing_type?: string;
    color?: string;
  },
): CreateCorrectionResult | { error: string } {
  const color = params.color ?? "yellow";
  const location = findTextInDocument(db, params.document_id, params.original_text);
  if ("error" in location) {
    return location;
  }

  const highlight = createHighlight(db, {
    document_id: params.document_id,
    color,
    text_content: location.text_content,
    from_pos: location.from_pos,
    to_pos: location.to_pos,
    prefix_context: location.prefix_context,
    suffix_context: location.suffix_context,
  });
  if ("error" in highlight) {
    return highlight;
  }

  const doc = getDocument(db, params.document_id);
  const correctionId = randomUUID();
  const sessionId = randomUUID();
  const now = nowMillis();

  db.prepare(
    `INSERT INTO corrections
       (id, highlight_id, document_id, session_id, original_text,
        prefix_context, suffix_context, notes_json,
        document_title, document_source, document_path,
        highlight_color, created_at, updated_at, writing_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    correctionId,
    highlight.id,
    params.document_id,
    sessionId,
    params.original_text,
    location.prefix_context,
    location.suffix_context,
    JSON.stringify(params.notes),
    doc?.title ?? null,
    doc?.source ?? "file",
    doc?.file_path ?? null,
    color,
    now,
    now,
    params.writing_type ?? null,
  );

  return {
    correction_id: correctionId,
    highlight_id: highlight.id,
    session_id: sessionId,
  };
}

export function deleteCorrection(
  db: Database.Database,
  highlightId: string,
): { success: true } | { error: string } {
  const correction = db
    .prepare("SELECT id FROM corrections WHERE highlight_id = ?")
    .get(highlightId) as { id: string } | undefined;

  if (!correction) {
    return { error: `Correction not found for highlight: ${highlightId}` };
  }

  db.prepare("DELETE FROM corrections WHERE highlight_id = ?").run(highlightId);
  // Also delete the highlight (cascades to margin_notes)
  db.prepare("DELETE FROM highlights WHERE id = ?").run(highlightId);

  return { success: true };
}

export function updateCorrectionWritingType(
  db: Database.Database,
  highlightId: string,
  writingType: string,
): { success: true } | { error: string } {
  const result = db
    .prepare("UPDATE corrections SET writing_type = ?, updated_at = ? WHERE highlight_id = ?")
    .run(writingType, nowMillis(), highlightId);

  if (result.changes === 0) {
    return { error: `Correction not found for highlight: ${highlightId}` };
  }

  return { success: true };
}

function parseRow(row: RawCorrectionRow): CorrectionRecord {
  let notes: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.notesJson);
    if (Array.isArray(parsed)) {
      notes = parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // ignore
  }
  return {
    originalText: row.originalText,
    notes,
    highlightColor: row.highlightColor,
    documentTitle: row.documentTitle,
    documentId: row.documentId,
    createdAt: row.createdAt,
    writingType: row.writingType,
    prefixContext: row.prefixContext,
    suffixContext: row.suffixContext,
    extendedContext: row.extendedContext,
  };
}
