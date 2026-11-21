import type Database from "better-sqlite3";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "fs";
import { extname } from "path";

export interface DocumentRecord {
  id: string;
  source: string;
  file_path: string | null;
  keep_local_id: string | null;
  title: string | null;
  author: string | null;
  url: string | null;
  word_count: number;
  last_opened_at: number;
  created_at: number;
}

export interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB safety limit

// Same list as DOCUMENT_EXTENSIONS in src-tauri/src/commands/file_access.rs.
const DOCUMENT_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd", ".txt"]);

function isDocumentPath(path: string): boolean {
  return DOCUMENT_EXTENSIONS.has(extname(path).toLowerCase());
}

/**
 * Reads a recorded document without trusting what is at the path now: a link
 * must still lead to a document file, the opened descriptor must be a regular
 * file (a pipe would block forever), and at most 5 MB is read from it.
 */
function readRecordedFile(path: string): { content: string } | { error: string } {
  if (lstatSync(path).isSymbolicLink() && !isDocumentPath(realpathSync(path))) {
    return { error: `Refusing to read ${path}: it links to a file that isn't a document.` };
  }
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      return { error: `Refusing to read ${path}: it isn't a regular file.` };
    }
    const buf = Buffer.alloc(MAX_FILE_SIZE + 1);
    let total = 0;
    for (;;) {
      const n = readSync(fd, buf, total, buf.length - total, null);
      if (n === 0) break;
      total += n;
      if (total > MAX_FILE_SIZE) {
        return { error: "File too large. Maximum supported size is 5MB." };
      }
    }
    return { content: buf.subarray(0, total).toString("utf-8") };
  } finally {
    closeSync(fd);
  }
}

export function listDocuments(
  db: Database.Database,
  limit: number = 20,
): DocumentRecord[] {
  const clampedLimit = Math.min(Math.max(limit, 1), 100);
  return db
    .prepare(
      `SELECT id, source, file_path, keep_local_id, title, author, url,
              word_count, last_opened_at, created_at
       FROM documents
       ORDER BY last_opened_at DESC
       LIMIT ?`,
    )
    .all(clampedLimit) as DocumentRecord[];
}

export function getDocument(
  db: Database.Database,
  documentId: string,
): DocumentRecord | null {
  return (
    (db
      .prepare(
        `SELECT id, source, file_path, keep_local_id, title, author, url,
              word_count, last_opened_at, created_at
       FROM documents WHERE id = ?`,
      )
      .get(documentId) as DocumentRecord | undefined) ?? null
  );
}

export function readDocument(
  db: Database.Database,
  documentId: string,
): { content: string } | { error: string } {
  const doc = getDocument(db, documentId);
  if (!doc) {
    return { error: `Document not found: ${documentId}` };
  }
  if (!doc.file_path) {
    return {
      error: `Document "${doc.title ?? documentId}" is a keep-local article without a file path. Content is only available in the Margin app.`,
    };
  }
  try {
    return readRecordedFile(doc.file_path);
  } catch (e) {
    return {
      error: `Failed to read file at ${doc.file_path}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Port of sanitize_fts_query from search.rs:89-132.
 * Strips FTS5 operators, escapes quotes, appends * for prefix matching.
 */
export function sanitizeFtsQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "";

  const hasAlphaNumeric = (value: string) => /[\p{L}\p{N}]/u.test(value);

  // Remove FTS5 operators and special chars
  const cleaned = trimmed
    .replace(/"/g, "")
    .replace(/'/g, "")
    .replace(/[(){}:^]/g, "");

  const terms = cleaned
    .split(/\s+/)
    .filter((word) => {
      const upper = word.toUpperCase();
      return (
        upper !== "AND" && upper !== "OR" && upper !== "NOT" && upper !== "NEAR"
      );
    })
    .filter((word) => hasAlphaNumeric(word))
    .map((word) => {
      const safe = word.replace(/[^\p{L}\p{N}\-_]/gu, "");
      return safe ? `"${safe}"*` : "";
    })
    .filter(Boolean);

  return terms.join(" ");
}

export function searchDocuments(
  db: Database.Database,
  query: string,
  limit: number = 20,
): SearchResult[] | { error: string } {
  const clampedLimit = Math.min(Math.max(limit, 1), 50);
  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];

  // Check if FTS table exists
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'",
    )
    .get();
  if (!tableExists) {
    return {
      error:
        "Full-text search index not yet created. Open Margin and perform a search to build the index.",
    };
  }

  try {
    return db
      .prepare(
        `SELECT f.document_id as documentId, f.title as title,
                snippet(documents_fts, 1, '<mark>', '</mark>', '…', 32) as snippet,
                bm25(documents_fts, 10.0, 1.0) as rank
         FROM documents_fts f
         LEFT JOIN documents d ON d.id = f.document_id
         WHERE documents_fts MATCH ?
         ORDER BY bm25(documents_fts, 10.0, 1.0)
                  - (COALESCE(d.access_count, 0) * 1.0 /
                     (1.0 + MAX(0, julianday('now') - julianday(datetime(COALESCE(d.last_opened_at, 0) / 1000, 'unixepoch'))) * 0.1))
                  * 0.3
         LIMIT ?`,
      )
      .all(ftsQuery, clampedLimit) as SearchResult[];
  } catch (e) {
    return {
      error: `Search failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
