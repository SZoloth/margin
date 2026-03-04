import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";

const DB_PATH = join(homedir(), ".margin", "margin.db");

export function openReadDb(path: string = DB_PATH): Database.Database {
  const db = new Database(path, { readonly: true });
  // If the DB isn't already in WAL mode, enabling it requires write access (to create the -wal file).
  // In readonly mode this can fail, but reads should still work.
  try {
    db.pragma("journal_mode = WAL");
  } catch {
    // Ignore: best-effort for better concurrent read performance when the DB is already WAL-enabled.
  }
  db.pragma("busy_timeout = 5000");
  return db;
}

export function openWriteDb(path: string = DB_PATH): Database.Database {
  const db = new Database(path, { fileMustExist: true });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  return db;
}

export function nowMillis(): number {
  return Date.now();
}

export function touchDocument(db: Database.Database, documentId: string): void {
  db.prepare("UPDATE documents SET last_opened_at = ? WHERE id = ?").run(
    nowMillis(),
    documentId,
  );
}

// Schema SQL for creating test databases
export const SCHEMA_SQL = `
  PRAGMA foreign_keys=ON;

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    file_path TEXT,
    keep_local_id TEXT,
    title TEXT,
    author TEXT,
    url TEXT,
    word_count INTEGER DEFAULT 0,
    last_opened_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    access_count INTEGER DEFAULT 0,
    indexed_at INTEGER,
    UNIQUE(file_path),
    UNIQUE(keep_local_id)
  );

  CREATE TABLE IF NOT EXISTS document_tags (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(document_id, tag)
  );

  CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    color TEXT NOT NULL DEFAULT 'yellow',
    text_content TEXT NOT NULL,
    from_pos INTEGER NOT NULL,
    to_pos INTEGER NOT NULL,
    prefix_context TEXT,
    suffix_context TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_highlights_document ON highlights(document_id);

  CREATE TABLE IF NOT EXISTS margin_notes (
    id TEXT PRIMARY KEY,
    highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_margin_notes_highlight ON margin_notes(highlight_id);

  CREATE TABLE IF NOT EXISTS corrections (
    id TEXT PRIMARY KEY,
    highlight_id TEXT NOT NULL UNIQUE,
    document_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    original_text TEXT NOT NULL,
    prefix_context TEXT,
    suffix_context TEXT,
    extended_context TEXT,
    notes_json TEXT NOT NULL,
    document_title TEXT,
    document_source TEXT NOT NULL,
    document_path TEXT,
    category TEXT,
    highlight_color TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    writing_type TEXT,
    polarity TEXT CHECK(polarity IN ('positive', 'corrective'))
  );

  CREATE INDEX IF NOT EXISTS idx_corrections_document ON corrections(document_id);
  CREATE INDEX IF NOT EXISTS idx_corrections_session ON corrections(session_id);

  CREATE TABLE IF NOT EXISTS content_snapshots (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    snapshot_type TEXT NOT NULL DEFAULT 'pre_external_edit'
        CHECK(snapshot_type IN ('pre_external_edit', 'manual')),
    created_at INTEGER NOT NULL,
    UNIQUE(document_id, snapshot_type)
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_document ON content_snapshots(document_id);

  CREATE TABLE IF NOT EXISTS open_tabs (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tab_order INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS writing_rules (
    id TEXT PRIMARY KEY,
    writing_type TEXT NOT NULL DEFAULT 'general'
      CHECK(writing_type IN ('general','email','prd','blog','cover-letter','resume','slack','pitch','outreach')),
    category TEXT NOT NULL,
    rule_text TEXT NOT NULL,
    when_to_apply TEXT,
    why TEXT,
    severity TEXT NOT NULL DEFAULT 'should-fix'
      CHECK(severity IN ('must-fix','should-fix','nice-to-fix')),
    example_before TEXT,
    example_after TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    signal_count INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    UNIQUE(writing_type, category, rule_text)
  );

  CREATE INDEX IF NOT EXISTS idx_writing_rules_type ON writing_rules(writing_type);
`;

export function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  return db;
}
