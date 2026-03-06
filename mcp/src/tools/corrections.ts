import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { nowMillis } from "../db.js";
import { findTextInDocument, createHighlight } from "./annotations.js";
import { getDocument } from "./documents.js";
import { createWritingRule } from "./writing-rules.js";

export interface CorrectionRecord {
  originalText: string;
  notes: string[];
  highlightColor: string;
  documentTitle: string | null;
  documentId: string;
  createdAt: number;
  writingType: string | null;
  polarity: string | null;
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
                writing_type as writingType, polarity, prefix_context as prefixContext,
                suffix_context as suffixContext, extended_context as extendedContext
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
              writing_type as writingType, polarity, prefix_context as prefixContext,
              suffix_context as suffixContext, extended_context as extendedContext
       FROM corrections
       WHERE session_id != '__backfilled__'
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(clampedLimit) as RawCorrectionRow[];
  return rows.map(parseRow);
}

/** Uncapped fetch for profile export — matches Rust's fetch_all_corrections_for_profile. */
export function getAllCorrectionsForProfile(
  db: Database.Database,
): CorrectionRecord[] {
  const rows = db
    .prepare(
      `SELECT original_text as originalText, notes_json as notesJson, highlight_color as highlightColor,
              document_title as documentTitle, document_id as documentId, created_at as createdAt,
              writing_type as writingType, polarity, prefix_context as prefixContext,
              suffix_context as suffixContext, extended_context as extendedContext
       FROM corrections
       WHERE session_id != '__backfilled__'
       ORDER BY created_at DESC`,
    )
    .all() as RawCorrectionRow[];
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
  polarity: string | null;
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

const VALID_POLARITIES = ["positive", "corrective"] as const;

export function setCorrectionPolarity(
  db: Database.Database,
  highlightId: string,
  polarity: string,
): { success: true } | { error: string } {
  if (!VALID_POLARITIES.includes(polarity as (typeof VALID_POLARITIES)[number])) {
    return { error: `Invalid polarity "${polarity}". Allowed: ${VALID_POLARITIES.join(", ")}` };
  }

  const result = db
    .prepare("UPDATE corrections SET polarity = ?, updated_at = ? WHERE highlight_id = ?")
    .run(polarity, nowMillis(), highlightId);

  if (result.changes === 0) {
    return { error: `Correction not found for highlight: ${highlightId}` };
  }

  return { success: true };
}

export interface VoiceSignalRecord {
  highlightId: string;
  originalText: string;
  notes: string[];
  extendedContext: string | null;
  highlightColor: string;
  writingType: string | null;
  polarity: string;
  documentTitle: string | null;
  createdAt: number;
}

export function getVoiceSignals(
  db: Database.Database,
  polarity?: string,
  limit: number = 500,
): VoiceSignalRecord[] {
  const clampedLimit = Math.min(Math.max(limit, 1), 2000);

  if (polarity) {
    const rows = db
      .prepare(
        `SELECT highlight_id as highlightId, original_text as originalText, notes_json as notesJson,
                extended_context as extendedContext, highlight_color as highlightColor,
                writing_type as writingType, polarity, document_title as documentTitle,
                created_at as createdAt
         FROM corrections
         WHERE session_id != '__backfilled__' AND polarity = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(polarity, clampedLimit) as RawVoiceSignalRow[];
    return rows.map(parseVoiceSignalRow);
  }

  const rows = db
    .prepare(
      `SELECT highlight_id as highlightId, original_text as originalText, notes_json as notesJson,
              extended_context as extendedContext, highlight_color as highlightColor,
              writing_type as writingType, polarity, document_title as documentTitle,
              created_at as createdAt
       FROM corrections
       WHERE session_id != '__backfilled__' AND polarity IS NOT NULL
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(clampedLimit) as RawVoiceSignalRow[];
  return rows.map(parseVoiceSignalRow);
}

interface RawVoiceSignalRow {
  highlightId: string;
  originalText: string;
  notesJson: string;
  extendedContext: string | null;
  highlightColor: string;
  writingType: string | null;
  polarity: string;
  documentTitle: string | null;
  createdAt: number;
}

function parseNotesJson(notesJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(notesJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // ignore
  }
  return [];
}

function parseVoiceSignalRow(row: RawVoiceSignalRow): VoiceSignalRecord {
  return {
    highlightId: row.highlightId,
    originalText: row.originalText,
    notes: parseNotesJson(row.notesJson),
    extendedContext: row.extendedContext,
    highlightColor: row.highlightColor,
    writingType: row.writingType,
    polarity: row.polarity,
    documentTitle: row.documentTitle,
    createdAt: row.createdAt,
  };
}

export function autoSynthesizeRule(
  db: Database.Database,
  params: {
    highlight_id: string;
    original_text: string;
    notes: string[];
    writing_type?: string | null;
  },
): void {
  if (!params.notes.length) return;

  const ruleText = params.notes.join("; ");
  const exampleBefore = params.original_text.length > 200
    ? params.original_text.slice(0, 200)
    : params.original_text;

  createWritingRule(db, {
    rule_text: ruleText,
    writing_type: params.writing_type ?? "general",
    category: "auto-synthesized",
    severity: "must-fix",
    example_before: exampleBefore,
    source: "auto-synthesis",
    signal_count: 1,
  });

  db.prepare("UPDATE corrections SET synthesized_at = ? WHERE highlight_id = ?")
    .run(nowMillis(), params.highlight_id);
}

function parseRow(row: RawCorrectionRow): CorrectionRecord {
  return {
    originalText: row.originalText,
    notes: parseNotesJson(row.notesJson),
    highlightColor: row.highlightColor,
    documentTitle: row.documentTitle,
    documentId: row.documentId,
    createdAt: row.createdAt,
    writingType: row.writingType,
    polarity: row.polarity,
    prefixContext: row.prefixContext,
    suffixContext: row.suffixContext,
    extendedContext: row.extendedContext,
  };
}
