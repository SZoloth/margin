/**
 * Thesis distillation tools for Margin.
 *
 * These tools help a writer move from an accumulated annotation corpus to
 * candidate thesis statements, grounded in their own highlights and notes.
 *
 * Design: MCP stays a pure data layer. `distillTheses` returns the annotation
 * cluster plus a synthesis prompt. The calling agent performs the
 * LLM reasoning and presents candidate theses to the user. The user can then
 * call `saveThesis` to persist a thesis for later review.
 */
import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { nowMillis } from "../db.js";

// --- Types ---

export interface HighlightWithContext {
  id: string;
  color: string;
  text: string;
  prefixContext: string | null;
  suffixContext: string | null;
  createdAt: number;
  notes: string[];
  corrections: Array<{
    originalText: string;
    notes: string[];
    polarity: string | null;
    writingType: string | null;
  }>;
}

export interface DocumentCluster {
  documentId: string;
  title: string | null;
  highlights: HighlightWithContext[];
}

export interface AnnotationCluster {
  documents: DocumentCluster[];
  totalHighlights: number;
  totalNotes: number;
  totalCorrections: number;
}

export interface ThesisCandidate {
  id: string;
  statement: string;
  /** Array of evidence objects: [{ highlightId, text, relevance }] */
  evidenceJson: string;
  confidence: string | null;
  /** Array of source document IDs */
  sourceDocumentIdsJson: string;
  status: "draft" | "accepted" | "rejected";
  createdAt: number;
  updatedAt: number;
}

// --- Data functions ---

/**
 * Gather all highlights, margin notes, and corrections for one or more documents,
 * grouped by document. Pass either documentIds or writingType as a filter.
 */
export function gatherAnnotationCluster(
  db: Database.Database,
  params: {
    documentIds?: string[];
    writingType?: string;
  },
): AnnotationCluster {
  const { documentIds, writingType } = params;

  // Determine which document IDs to query
  let docIds: string[];
  if (documentIds && documentIds.length > 0) {
    docIds = documentIds;
  } else if (writingType) {
    // Collect document IDs that have corrections of this writing type
    const rows = db
      .prepare(
        `SELECT DISTINCT document_id FROM corrections
         WHERE writing_type = ? AND session_id != '__backfilled__'`,
      )
      .all(writingType) as Array<{ document_id: string }>;
    docIds = rows.map((r) => r.document_id);
  } else {
    // All documents with at least one highlight
    const rows = db
      .prepare(`SELECT DISTINCT document_id FROM highlights`)
      .all() as Array<{ document_id: string }>;
    docIds = rows.map((r) => r.document_id);
  }

  if (docIds.length === 0) {
    return { documents: [], totalHighlights: 0, totalNotes: 0, totalCorrections: 0 };
  }

  // Fetch document metadata
  const placeholders = docIds.map(() => "?").join(",");
  const docs = db
    .prepare(
      `SELECT id, title FROM documents WHERE id IN (${placeholders})`,
    )
    .all(...docIds) as Array<{ id: string; title: string | null }>;

  const docMap = new Map(docs.map((d) => [d.id, d.title]));

  let totalHighlights = 0;
  let totalNotes = 0;
  let totalCorrections = 0;

  const documents: DocumentCluster[] = docIds
    .filter((id) => docMap.has(id))
    .map((docId) => {
      // Highlights
      const highlights = db
        .prepare(
          `SELECT id, color, text_content, prefix_context, suffix_context, created_at
           FROM highlights WHERE document_id = ? ORDER BY from_pos`,
        )
        .all(docId) as Array<{
          id: string;
          color: string;
          text_content: string;
          prefix_context: string | null;
          suffix_context: string | null;
          created_at: number;
        }>;

      // Notes for this document's highlights
      const notes = db
        .prepare(
          `SELECT mn.highlight_id, mn.content
           FROM margin_notes mn
           JOIN highlights h ON mn.highlight_id = h.id
           WHERE h.document_id = ?
           ORDER BY mn.created_at`,
        )
        .all(docId) as Array<{ highlight_id: string; content: string }>;

      const notesByHighlight = new Map<string, string[]>();
      for (const note of notes) {
        const existing = notesByHighlight.get(note.highlight_id) ?? [];
        existing.push(note.content);
        notesByHighlight.set(note.highlight_id, existing);
      }

      // Corrections for this document
      const rawCorrections = db
        .prepare(
          `SELECT highlight_id, original_text, notes_json, polarity, writing_type
           FROM corrections
           WHERE document_id = ? AND session_id != '__backfilled__'
           ORDER BY created_at`,
        )
        .all(docId) as Array<{
          highlight_id: string;
          original_text: string;
          notes_json: string;
          polarity: string | null;
          writing_type: string | null;
        }>;

      const correctionsByHighlight = new Map<
        string,
        Array<{ originalText: string; notes: string[]; polarity: string | null; writingType: string | null }>
      >();
      for (const c of rawCorrections) {
        const notes: string[] = (() => {
          try {
            return JSON.parse(c.notes_json) as string[];
          } catch {
            return [];
          }
        })();
        const entry = {
          originalText: c.original_text,
          notes,
          polarity: c.polarity,
          writingType: c.writing_type,
        };
        const existing = correctionsByHighlight.get(c.highlight_id) ?? [];
        existing.push(entry);
        correctionsByHighlight.set(c.highlight_id, existing);
      }

      // Apply writingType filter to highlights if specified (only include highlights
      // that have at least one correction of that type, or any highlight if no type filter)
      const filteredHighlights = writingType
        ? highlights.filter((h) => correctionsByHighlight.has(h.id))
        : highlights;

      const highlightData: HighlightWithContext[] = filteredHighlights.map((h) => ({
        id: h.id,
        color: h.color,
        text: h.text_content,
        prefixContext: h.prefix_context,
        suffixContext: h.suffix_context,
        createdAt: h.created_at,
        notes: notesByHighlight.get(h.id) ?? [],
        corrections: correctionsByHighlight.get(h.id) ?? [],
      }));

      totalHighlights += highlightData.length;
      totalNotes += notes.length;
      totalCorrections += rawCorrections.length;

      return {
        documentId: docId,
        title: docMap.get(docId) ?? null,
        highlights: highlightData,
      };
    })
    .filter((d) => d.highlights.length > 0);

  return { documents, totalHighlights, totalNotes, totalCorrections };
}

const SYNTHESIS_PROMPT = `You have been given an annotation cluster from the user's reading history in Margin.

Your task is to identify 3 candidate thesis statements that this body of annotations supports.

Rules:
- Each thesis must be a single sentence — no multi-sentence theses.
- Each thesis must be grounded in specific highlights from the cluster. Cite highlight IDs.
- Do not generate generic observations or advice not supported by the annotations.
- Do not draft paragraphs, outlines, or prose. Thesis statements only.
- For each thesis, note which highlights support it (by ID) and how strong the evidence is.
- If the annotations are too thin to support 3 distinct theses, return fewer with a note.

Return your response as JSON with this shape:
{
  "theses": [
    {
      "statement": "<one-sentence thesis>",
      "evidence": [
        { "highlightId": "<id>", "text": "<highlight text excerpt>", "relevance": "<why this supports the thesis>" }
      ],
      "confidence": "<high|medium|low> — <brief rationale>"
    }
  ]
}`;

/**
 * Return the annotation cluster for given documents, plus a synthesis prompt.
 * The calling agent uses these together to distill candidate theses.
 * No LLM call is made here — the MCP server stays a pure data layer.
 */
export function distillTheses(
  db: Database.Database,
  params: {
    documentIds?: string[];
    writingType?: string;
  },
): { cluster: AnnotationCluster; synthesisPrompt: string } {
  const cluster = gatherAnnotationCluster(db, params);
  return { cluster, synthesisPrompt: SYNTHESIS_PROMPT };
}

// --- Persistence ---

export function saveThesis(
  db: Database.Database,
  params: {
    statement: string;
    evidenceJson: string;
    confidence?: string;
    sourceDocumentIdsJson: string;
  },
): ThesisCandidate {
  const id = randomUUID();
  const now = nowMillis();
  db.prepare(
    `INSERT INTO thesis_candidates
       (id, statement, evidence_json, confidence, source_document_ids_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
  ).run(
    id,
    params.statement,
    params.evidenceJson,
    params.confidence ?? null,
    params.sourceDocumentIdsJson,
    now,
    now,
  );
  return getThesisById(db, id)!;
}

export function getTheses(db: Database.Database, status?: string): ThesisCandidate[] {
  if (status) {
    return db
      .prepare(
        `SELECT id, statement, evidence_json as evidenceJson, confidence,
                source_document_ids_json as sourceDocumentIdsJson,
                status, created_at as createdAt, updated_at as updatedAt
         FROM thesis_candidates WHERE status = ? ORDER BY created_at DESC`,
      )
      .all(status) as ThesisCandidate[];
  }
  return db
    .prepare(
      `SELECT id, statement, evidence_json as evidenceJson, confidence,
              source_document_ids_json as sourceDocumentIdsJson,
              status, created_at as createdAt, updated_at as updatedAt
       FROM thesis_candidates ORDER BY created_at DESC`,
    )
    .all() as ThesisCandidate[];
}

export function getThesisById(db: Database.Database, id: string): ThesisCandidate | null {
  return (
    (db
      .prepare(
        `SELECT id, statement, evidence_json as evidenceJson, confidence,
                source_document_ids_json as sourceDocumentIdsJson,
                status, created_at as createdAt, updated_at as updatedAt
         FROM thesis_candidates WHERE id = ?`,
      )
      .get(id) as ThesisCandidate | undefined) ?? null
  );
}

export function updateThesisStatus(
  db: Database.Database,
  id: string,
  status: "draft" | "accepted" | "rejected",
): ThesisCandidate | { error: string } {
  const existing = getThesisById(db, id);
  if (!existing) {
    return { error: `Thesis not found: ${id}` };
  }
  db.prepare(
    `UPDATE thesis_candidates SET status = ?, updated_at = ? WHERE id = ?`,
  ).run(status, nowMillis(), id);
  return getThesisById(db, id)!;
}
