import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { nowMillis, touchDocument } from "../db.js";
import { readDocument, getDocument } from "./documents.js";

export interface HighlightRecord {
  id: string;
  document_id: string;
  color: string;
  text_content: string;
  from_pos: number;
  to_pos: number;
  prefix_context: string | null;
  suffix_context: string | null;
  created_at: number;
  updated_at: number;
}

export interface MarginNoteRecord {
  id: string;
  highlight_id: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface AnnotationEntry {
  highlight: HighlightRecord;
  notes: MarginNoteRecord[];
}

const ALLOWED_COLORS = [
  "yellow",
  "green",
  "blue",
  "pink",
  "purple",
  "orange",
] as const;

export function getAnnotations(
  db: Database.Database,
  documentId: string,
): AnnotationEntry[] {
  const highlights = db
    .prepare(
      `SELECT id, document_id, color, text_content, from_pos, to_pos,
              prefix_context, suffix_context, created_at, updated_at
       FROM highlights
       WHERE document_id = ?
       ORDER BY from_pos`,
    )
    .all(documentId) as HighlightRecord[];

  if (highlights.length === 0) return [];

  const allNotes = db
    .prepare(
      `SELECT mn.id, mn.highlight_id, mn.content, mn.created_at, mn.updated_at
       FROM margin_notes mn
       JOIN highlights h ON mn.highlight_id = h.id
       WHERE h.document_id = ?
       ORDER BY h.from_pos, mn.created_at`,
    )
    .all(documentId) as MarginNoteRecord[];

  // Group notes by highlight_id
  const notesByHighlight = new Map<string, MarginNoteRecord[]>();
  for (const note of allNotes) {
    const existing = notesByHighlight.get(note.highlight_id);
    if (existing) {
      existing.push(note);
    } else {
      notesByHighlight.set(note.highlight_id, [note]);
    }
  }

  return highlights.map((highlight) => ({
    highlight,
    notes: notesByHighlight.get(highlight.id) ?? [],
  }));
}

export function createHighlight(
  db: Database.Database,
  params: {
    document_id: string;
    color: string;
    text_content: string;
    from_pos: number;
    to_pos: number;
    prefix_context?: string;
    suffix_context?: string;
  },
): HighlightRecord | { error: string } {
  if (!ALLOWED_COLORS.includes(params.color as (typeof ALLOWED_COLORS)[number])) {
    return {
      error: `Invalid color "${params.color}". Allowed: ${ALLOWED_COLORS.join(", ")}`,
    };
  }

  if (
    !Number.isInteger(params.from_pos) ||
    !Number.isInteger(params.to_pos) ||
    params.from_pos < 0 ||
    params.from_pos >= params.to_pos
  ) {
    return {
      error: `Invalid position range: from_pos (${params.from_pos}) must be a non-negative integer less than to_pos (${params.to_pos}).`,
    };
  }

  // Verify document exists
  const doc = db
    .prepare("SELECT id FROM documents WHERE id = ?")
    .get(params.document_id);
  if (!doc) {
    return { error: `Document not found: ${params.document_id}` };
  }

  const id = randomUUID();
  const now = nowMillis();

  db.prepare(
    `INSERT INTO highlights
       (id, document_id, color, text_content, from_pos, to_pos,
        prefix_context, suffix_context, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.document_id,
    params.color,
    params.text_content,
    params.from_pos,
    params.to_pos,
    params.prefix_context ?? null,
    params.suffix_context ?? null,
    now,
    now,
  );

  touchDocument(db, params.document_id);

  return {
    id,
    document_id: params.document_id,
    color: params.color,
    text_content: params.text_content,
    from_pos: params.from_pos,
    to_pos: params.to_pos,
    prefix_context: params.prefix_context ?? null,
    suffix_context: params.suffix_context ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function createMarginNote(
  db: Database.Database,
  highlightId: string,
  content: string,
): MarginNoteRecord | { error: string } {
  // Verify highlight exists and get document_id for touch
  const highlight = db
    .prepare("SELECT id, document_id FROM highlights WHERE id = ?")
    .get(highlightId) as { id: string; document_id: string } | undefined;

  if (!highlight) {
    return { error: `Highlight not found: ${highlightId}` };
  }

  const id = randomUUID();
  const now = nowMillis();

  db.prepare(
    `INSERT INTO margin_notes (id, highlight_id, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, highlightId, content, now, now);

  touchDocument(db, highlight.document_id);

  return {
    id,
    highlight_id: highlightId,
    content,
    created_at: now,
    updated_at: now,
  };
}

export function deleteHighlight(
  db: Database.Database,
  highlightId: string,
): { success: true } | { error: string } {
  // Get document_id before delete for touch
  const highlight = db
    .prepare("SELECT document_id FROM highlights WHERE id = ?")
    .get(highlightId) as { document_id: string } | undefined;

  if (!highlight) {
    return { error: `Highlight not found: ${highlightId}` };
  }

  // Cascading delete removes attached margin notes
  db.prepare("DELETE FROM highlights WHERE id = ?").run(highlightId);
  touchDocument(db, highlight.document_id);

  return { success: true };
}

export function updateMarginNote(
  db: Database.Database,
  noteId: string,
  content: string,
): MarginNoteRecord | { error: string } {
  const existing = db
    .prepare(
      `SELECT mn.id, mn.highlight_id, mn.created_at, h.document_id
       FROM margin_notes mn
       JOIN highlights h ON mn.highlight_id = h.id
       WHERE mn.id = ?`,
    )
    .get(noteId) as { id: string; highlight_id: string; created_at: number; document_id: string } | undefined;

  if (!existing) {
    return { error: `Margin note not found: ${noteId}` };
  }

  const now = nowMillis();
  db.prepare("UPDATE margin_notes SET content = ?, updated_at = ? WHERE id = ?").run(
    content,
    now,
    noteId,
  );

  touchDocument(db, existing.document_id);

  return {
    id: noteId,
    highlight_id: existing.highlight_id,
    content,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export function deleteMarginNote(
  db: Database.Database,
  noteId: string,
): { success: true } | { error: string } {
  const existing = db
    .prepare(
      `SELECT mn.id, h.document_id
       FROM margin_notes mn
       JOIN highlights h ON mn.highlight_id = h.id
       WHERE mn.id = ?`,
    )
    .get(noteId) as { id: string; document_id: string } | undefined;

  if (!existing) {
    return { error: `Margin note not found: ${noteId}` };
  }

  db.prepare("DELETE FROM margin_notes WHERE id = ?").run(noteId);
  touchDocument(db, existing.document_id);

  return { success: true };
}

export function updateHighlightColor(
  db: Database.Database,
  highlightId: string,
  color: string,
): { success: true } | { error: string } {
  if (!ALLOWED_COLORS.includes(color as (typeof ALLOWED_COLORS)[number])) {
    return {
      error: `Invalid color "${color}". Allowed: ${ALLOWED_COLORS.join(", ")}`,
    };
  }

  const highlight = db
    .prepare("SELECT document_id FROM highlights WHERE id = ?")
    .get(highlightId) as { document_id: string } | undefined;

  if (!highlight) {
    return { error: `Highlight not found: ${highlightId}` };
  }

  db.prepare("UPDATE highlights SET color = ?, updated_at = ? WHERE id = ?").run(
    color,
    nowMillis(),
    highlightId,
  );

  touchDocument(db, highlight.document_id);

  return { success: true };
}

export interface TextLocation {
  from_pos: number;
  to_pos: number;
  text_content: string;
  prefix_context: string;
  suffix_context: string;
}

export function findTextInDocument(
  db: Database.Database,
  documentId: string,
  textToHighlight: string,
): TextLocation | { error: string } {
  const result = readDocument(db, documentId);
  if ("error" in result) {
    return result;
  }

  const content = result.content;
  const idx = content.indexOf(textToHighlight);
  if (idx === -1) {
    return { error: `Text not found in document: "${textToHighlight.slice(0, 80)}"` };
  }

  const fromPos = idx;
  const toPos = idx + textToHighlight.length;
  const prefixStart = Math.max(0, fromPos - 50);
  const suffixEnd = Math.min(content.length, toPos + 50);

  return {
    from_pos: fromPos,
    to_pos: toPos,
    text_content: textToHighlight,
    prefix_context: content.slice(prefixStart, fromPos),
    suffix_context: content.slice(toPos, suffixEnd),
  };
}

export interface HighlightByTextResult {
  highlight: HighlightRecord;
  note?: MarginNoteRecord;
}

export function highlightByText(
  db: Database.Database,
  params: {
    document_id: string;
    text_to_highlight: string;
    color: string;
    note?: string;
  },
): HighlightByTextResult | { error: string } {
  const location = findTextInDocument(db, params.document_id, params.text_to_highlight);
  if ("error" in location) {
    return location;
  }

  const highlight = createHighlight(db, {
    document_id: params.document_id,
    color: params.color,
    text_content: location.text_content,
    from_pos: location.from_pos,
    to_pos: location.to_pos,
    prefix_context: location.prefix_context,
    suffix_context: location.suffix_context,
  });
  if ("error" in highlight) {
    return highlight;
  }

  const result: HighlightByTextResult = { highlight };

  if (params.note) {
    const noteResult = createMarginNote(db, highlight.id, params.note);
    if ("error" in noteResult) {
      return noteResult;
    }
    result.note = noteResult;
  }

  return result;
}
