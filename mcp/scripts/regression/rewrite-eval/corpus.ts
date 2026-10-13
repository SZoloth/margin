/**
 * Draft corpus: read-only access to ~/.margin/margin.db plus the draft files it
 * points at. Everything written lands OUTSIDE the repo (private writing).
 */
import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { CORRECTION_FILTER } from "../../shared.ts";

const require = createRequire(import.meta.url);

export interface CorpusSpan {
  id: string;
  text: string;
  notes: string[];
  createdAt: number;
}

export interface CorpusDoc {
  /** unit id: the document id in files mode, "<document id>#<n>" in passages mode */
  id: string;
  /** the document this unit came from; resampling and splitting happen at this level */
  documentId: string;
  type: string;
  title: string | null;
  words: number;
  firstCorrectionAt: number;
  spans: CorpusSpan[];
  split: "train" | "heldout";
  hasFinal: boolean;
}

export interface Manifest {
  created: string;
  cutoff: number;
  heldoutFraction: number;
  skipped: Array<{ id: string; reason: string }>;
  docs: CorpusDoc[];
}

/** Writers disagree on units (Go and MCP use ms; older rows may be seconds). */
export function toMs(t: number): number {
  return t < 1e11 ? t * 1000 : t;
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function normWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function parseNotes(notesJson: string): string[] {
  try {
    const p: unknown = JSON.parse(notesJson);
    if (Array.isArray(p)) return p.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  } catch {
    /* fall through */
  }
  return [];
}

export interface RawCorrection {
  id: string;
  document_id: string;
  original_text: string;
  notes_json: string;
  writing_type: string | null;
  created_at: number;
  extended_context?: string | null;
}

export interface RawDocument {
  id: string;
  title: string | null;
  file_path: string | null;
}

export function readCorrectionRows(dbPath: string): { corrections: RawCorrection[]; documents: Map<string, RawDocument> } {
  if (!existsSync(dbPath)) throw new Error(`database not found: ${dbPath}`);
  const Database = require("better-sqlite3");
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const corrections = db
      .prepare(
        `SELECT id, document_id, original_text, notes_json, writing_type, created_at, extended_context
         FROM corrections WHERE ${CORRECTION_FILTER} ORDER BY created_at`,
      )
      .all() as RawCorrection[];
    const docs = db.prepare(`SELECT id, title, file_path FROM documents`).all() as RawDocument[];
    return { corrections, documents: new Map(docs.map((d) => [d.id, d])) };
  } finally {
    db.close();
  }
}

export interface DraftCandidate {
  id: string;
  documentId: string;
  type: string;
  title: string | null;
  text: string;
  spans: CorpusSpan[];
  firstCorrectionAt: number;
}

export const MIN_WORDS = 50;
export const MAX_WORDS = 1200;

/** Group correction rows into candidate drafts, logging every document we drop and why. */
export function buildCandidates(
  corrections: RawCorrection[],
  documents: Map<string, RawDocument>,
  readFile: (p: string) => string | null = (p) => (existsSync(p) ? readFileSync(p, "utf-8") : null),
): { candidates: DraftCandidate[]; skipped: Array<{ id: string; reason: string }> } {
  const byDoc = new Map<string, RawCorrection[]>();
  for (const c of corrections) {
    const list = byDoc.get(c.document_id) ?? [];
    list.push(c);
    byDoc.set(c.document_id, list);
  }
  const candidates: DraftCandidate[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const [docId, rows] of byDoc) {
    const doc = documents.get(docId);
    if (!doc?.file_path) {
      skipped.push({ id: docId, reason: "no file_path (not a local file)" });
      continue;
    }
    const text = readFile(doc.file_path);
    if (text === null) {
      skipped.push({ id: docId, reason: "file missing on disk" });
      continue;
    }
    const w = wordCount(text);
    if (w < MIN_WORDS || w > MAX_WORDS) {
      skipped.push({ id: docId, reason: `word count ${w} outside ${MIN_WORDS}-${MAX_WORDS}` });
      continue;
    }
    const hay = normWs(text);
    const spans: CorpusSpan[] = rows
      .filter((r) => hay.includes(normWs(r.original_text)))
      .map((r) => ({ id: r.id, text: normWs(r.original_text), notes: parseNotes(r.notes_json), createdAt: toMs(r.created_at) }))
      .filter((s) => s.notes.length > 0);
    if (spans.length === 0) {
      skipped.push({ id: docId, reason: "no flagged span found in the current file text (edited since?)" });
      continue;
    }
    const typeCounts = new Map<string, number>();
    for (const r of rows) typeCounts.set(r.writing_type ?? "general", (typeCounts.get(r.writing_type ?? "general") ?? 0) + 1);
    const type = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    candidates.push({
      id: docId,
      documentId: docId,
      type,
      title: doc.title,
      text,
      spans,
      firstCorrectionAt: Math.min(...spans.map((s) => s.createdAt)),
    });
  }
  return { candidates, skipped };
}

export const MIN_PASSAGE_WORDS = 40;
export const MAX_PASSAGE_WORDS = 300;

function majorityType(rows: RawCorrection[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.writing_type ?? "general", (counts.get(r.writing_type ?? "general") ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/**
 * Passages mode, for when the source files are gone: use the saved context
 * around each flagged span (extended_context) as the unit to rewrite. Passages
 * that sit inside a longer passage of the same document are folded into it, and
 * every flagged row whose text lies inside a kept passage becomes a span of it.
 * Rows that fit no passage are counted, not silently dropped.
 */
export function buildPassageCandidates(corrections: RawCorrection[]): {
  candidates: DraftCandidate[];
  skipped: Array<{ id: string; reason: string }>;
  unplacedRows: number;
} {
  const byDoc = new Map<string, RawCorrection[]>();
  for (const c of corrections) byDoc.set(c.document_id, [...(byDoc.get(c.document_id) ?? []), c]);
  const candidates: DraftCandidate[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  let unplacedRows = 0;
  for (const [docId, rows] of byDoc) {
    const texts = [
      ...new Set(
        rows
          .map((r) => normWs(r.extended_context ?? ""))
          .filter((t) => wordCount(t) >= MIN_PASSAGE_WORDS && wordCount(t) <= MAX_PASSAGE_WORDS),
      ),
    ].sort((a, b) => b.length - a.length || a.localeCompare(b));
    const kept: Array<{ text: string; rows: RawCorrection[] }> = [];
    for (const t of texts) if (!kept.some((k) => k.text.includes(t))) kept.push({ text: t, rows: [] });
    for (const r of rows) {
      const needle = normWs(r.original_text);
      const home = needle ? kept.find((k) => k.text.includes(needle)) : undefined;
      if (home) home.rows.push(r);
      else unplacedRows++;
    }
    let n = 0;
    for (const k of kept) {
      const spans: CorpusSpan[] = k.rows
        .map((r) => ({ id: r.id, text: normWs(r.original_text), notes: parseNotes(r.notes_json), createdAt: toMs(r.created_at) }))
        .filter((s) => s.notes.length > 0);
      if (spans.length === 0) continue;
      candidates.push({
        id: `${docId}#${++n}`,
        documentId: docId,
        type: majorityType(k.rows),
        title: null,
        text: k.text,
        spans,
        firstCorrectionAt: Math.min(...spans.map((s) => s.createdAt)),
      });
    }
    if (n === 0) skipped.push({ id: docId, reason: `no saved context of ${MIN_PASSAGE_WORDS}-${MAX_PASSAGE_WORDS} words around a flagged span` });
  }
  return { candidates, skipped, unplacedRows };
}

export interface RuleRow {
  writing_type: string;
  category: string;
  rule_text: string;
  severity: string;
  example_before: string | null;
  example_after: string | null;
  register: string | null;
  updated_at: number;
}

/**
 * Rules visible to A3: production filters, plus updated_at strictly before the
 * cutoff so nothing built from held-out corrections can leak in.
 */
export function selectRulesAsOf(dbPath: string, cutoffMs: number, type: string, register: string): RuleRow[] {
  const Database = require("better-sqlite3");
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const cols = (db.prepare("PRAGMA table_info(writing_rules)").all() as Array<{ name: string }>).map((c) => c.name);
    const archived = cols.includes("archived_at") ? "AND archived_at IS NULL" : "";
    return (db
      .prepare(
        `SELECT writing_type, category, rule_text, severity, example_before, example_after, register, updated_at
         FROM writing_rules
         WHERE category != 'auto-synthesized'
           AND NOT (source = 'synthesis-candidate' AND reviewed_at IS NULL)
           ${archived}
           AND (writing_type = ? OR writing_type = 'general' OR register = ?)
         ORDER BY signal_count DESC, created_at DESC`,
      )
      .all(type, register) as RuleRow[]).filter((r) => toMs(r.updated_at) < cutoffMs);
  } finally {
    db.close();
  }
}

export function loadRulesAsOf(dbPath: string, cutoffMs: number, type: string, register: string): string {
  return formatRules(selectRulesAsOf(dbPath, cutoffMs, type, register), type, register);
}

export function formatRules(rows: RuleRow[], type: string, register: string): string {
  if (rows.length === 0) return `# Writing Rules (${type}, ${register})\n\n(no rules visible before the cutoff)`;
  const lines = [`# Writing Rules (filtered for: ${type}, register: ${register})`];
  const byCat = new Map<string, RuleRow[]>();
  for (const r of rows) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  for (const [cat, rs] of byCat) {
    lines.push("", `## ${cat}`);
    for (const r of rs) {
      lines.push(`- [${r.severity}] ${r.rule_text}`);
      if (r.example_before && r.example_after) lines.push(`  - before: ${r.example_before}`, `  - after: ${r.example_after}`);
    }
  }
  return lines.join("\n");
}
