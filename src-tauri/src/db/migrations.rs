use rusqlite::Connection;
use std::fs;
use std::io::BufRead;
use std::path::PathBuf;

fn db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let margin_dir = home.join(".margin");
    fs::create_dir_all(&margin_dir)?;
    Ok(margin_dir.join("margin.db"))
}

pub fn init_db() -> Result<(), Box<dyn std::error::Error>> {
    let path = db_path()?;
    let conn = Connection::open(&path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS documents (
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

        CREATE TABLE IF NOT EXISTS margin_notes (
            id TEXT PRIMARY KEY,
            highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_highlights_document ON highlights(document_id);
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
            updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_corrections_document ON corrections(document_id);
        CREATE INDEX IF NOT EXISTS idx_corrections_session ON corrections(session_id);

        CREATE TABLE IF NOT EXISTS open_tabs (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            tab_order INTEGER NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );

        DROP TABLE IF EXISTS comments;
        DROP TABLE IF EXISTS comment_threads;",
    )?;

    // Migration: rebuild corrections table without foreign keys and backfill from JSONL
    migrate_corrections_drop_fks(&conn)?;

    Ok(())
}

/// Rebuilds the corrections table without foreign key constraints.
/// Also backfills any corrections from JSONL files that are missing from the DB.
fn migrate_corrections_drop_fks(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    // Check if migration is needed: does the corrections table have FK constraints?
    let has_fks: bool = {
        let mut stmt = conn.prepare("PRAGMA foreign_key_list(corrections)")?;
        let count: usize = stmt.query_map([], |_| Ok(()))?.count();
        count > 0
    };

    if has_fks {
        // Must disable FKs to rebuild the table
        conn.execute_batch("PRAGMA foreign_keys=OFF;")?;

        conn.execute_batch(
            "BEGIN;

             CREATE TABLE corrections_new (
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
                 updated_at INTEGER NOT NULL
             );

             INSERT INTO corrections_new SELECT * FROM corrections;

             DROP TABLE corrections;

             ALTER TABLE corrections_new RENAME TO corrections;

             CREATE INDEX IF NOT EXISTS idx_corrections_document ON corrections(document_id);
             CREATE INDEX IF NOT EXISTS idx_corrections_session ON corrections(session_id);

             COMMIT;",
        )?;

        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    }

    // Backfill: import corrections from JSONL files that are not already in the DB
    if let Some(home) = dirs::home_dir() {
        let corrections_dir = home.join(".margin").join("corrections");
        if corrections_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&corrections_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                        continue;
                    }
                    if let Ok(file) = fs::File::open(&path) {
                        let reader = std::io::BufReader::new(file);
                        for line in reader.lines() {
                            let Ok(line) = line else { continue };
                            let line = line.trim();
                            if line.is_empty() {
                                continue;
                            }
                            let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
                                continue;
                            };
                            let Some(highlight_id) = val["highlight_id"].as_str() else {
                                continue;
                            };

                            // Skip if already in DB
                            let exists: bool = conn
                                .query_row(
                                    "SELECT COUNT(*) > 0 FROM corrections WHERE highlight_id = ?1",
                                    [highlight_id],
                                    |row| row.get(0),
                                )
                                .unwrap_or(false);
                            if exists {
                                continue;
                            }

                            let id = uuid::Uuid::new_v4().to_string();
                            let _ = conn.execute(
                                "INSERT OR IGNORE INTO corrections
                                    (id, highlight_id, document_id, session_id, original_text,
                                     prefix_context, suffix_context, extended_context, notes_json,
                                     document_title, document_source, document_path, category,
                                     highlight_color, created_at, updated_at)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                                rusqlite::params![
                                    id,
                                    highlight_id,
                                    val["document_id"].as_str().unwrap_or(""),
                                    val["session_id"].as_str().unwrap_or(""),
                                    val["original_text"].as_str().unwrap_or(""),
                                    val["prefix_context"].as_str(),
                                    val["suffix_context"].as_str(),
                                    val["extended_context"].as_str(),
                                    serde_json::to_string(&val["notes"]).unwrap_or_else(|_| "[]".into()),
                                    val["document_title"].as_str(),
                                    val["document_source"].as_str().unwrap_or("unknown"),
                                    val["document_path"].as_str(),
                                    Option::<String>::None,
                                    val["highlight_color"].as_str().unwrap_or("yellow"),
                                    val["exported_at"].as_i64().unwrap_or(0),
                                    val["exported_at"].as_i64().unwrap_or(0),
                                ],
                            );
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

pub fn get_db() -> Result<Connection, String> {
    let path = db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}
