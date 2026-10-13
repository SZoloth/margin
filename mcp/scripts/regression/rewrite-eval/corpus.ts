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
  id: string;
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
        `SELECT id, document_id, original_text, notes_json, writing_type, created_at
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
      type,
      title: doc.title,
      text,
      spans,
      firstCorrectionAt: Math.min(...spans.map((s) => s.createdAt)),
    });
  }
  return { candidates, skipped };
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
export function loadRulesAsOf(dbPath: string, cutoffMs: number, type: string, register: string): string {
  const Database = require("better-sqlite3");
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const cols = (db.prepare("PRAGMA table_info(writing_rules)").all() as Array<{ name: string }>).map((c) => c.name);
    const archived = cols.includes("archived_at") ? "AND archived_at IS NULL" : "";
    const rows = (db
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
    return formatRules(rows, type, register);
  } finally {
    db.close();
  }
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
