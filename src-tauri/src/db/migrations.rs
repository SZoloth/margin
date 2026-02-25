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

    // Migration: add writing_type column to corrections
    migrate_corrections_add_writing_type(&conn)?;

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

    // Backfill: import corrections from JSONL files that are not already in the DB.
    // Only run once — check if backfill marker exists.
    let backfilled: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM corrections WHERE session_id = '__backfilled__'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(true); // if query fails, skip backfill

    if !backfilled {
        if let Some(home) = dirs::home_dir() {
            let corrections_dir = home.join(".margin").join("corrections");
            let count = backfill_corrections_from_dir(conn, &corrections_dir);
            if count > 0 {
                // Insert a sentinel row so backfill doesn't run again
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO corrections
                        (id, highlight_id, document_id, session_id, original_text,
                         notes_json, document_source, highlight_color, created_at, updated_at)
                     VALUES ('__backfill_marker__', '__backfill_marker__', '', '__backfilled__',
                             '', '[]', 'system', 'none', 0, 0)",
                    [],
                );
            }
        }
    }

    Ok(())
}

/// Import corrections from JSONL files in `dir` that are missing from the DB.
/// Files are processed in sorted order (oldest first) so newer entries win on conflict.
/// Returns the number of corrections imported.
fn backfill_corrections_from_dir(conn: &Connection, dir: &std::path::Path) -> usize {
    if !dir.is_dir() {
        return 0;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };

    // Sort JSONL files by name (date-based filenames → chronological order)
    let mut paths: Vec<_> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
        .collect();
    paths.sort();

    let mut imported = 0;
    for path in &paths {
        let Ok(file) = fs::File::open(path) else {
            eprintln!("backfill: failed to open {}", path.display());
            continue;
        };
        let reader = std::io::BufReader::new(file);
        for line in reader.lines() {
            let Ok(line) = line else { continue };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
                eprintln!("backfill: skipping malformed JSON line");
                continue;
            };
            let Some(highlight_id) = val["highlight_id"].as_str() else {
                continue;
            };

            let id = uuid::Uuid::new_v4().to_string();
            // Use upsert so newer JSONL entries (processed later) overwrite older ones
            match conn.execute(
                "INSERT INTO corrections
                    (id, highlight_id, document_id, session_id, original_text,
                     prefix_context, suffix_context, extended_context, notes_json,
                     document_title, document_source, document_path, category,
                     highlight_color, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
                 ON CONFLICT(highlight_id) DO UPDATE SET
                    original_text = excluded.original_text,
                    notes_json = excluded.notes_json,
                    document_title = excluded.document_title,
                    highlight_color = excluded.highlight_color,
                    updated_at = excluded.updated_at",
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
            ) {
                Ok(_) => imported += 1,
                Err(e) => eprintln!("backfill: failed to insert correction: {e}"),
            }
        }
    }
    imported
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn corrections_table_sql() -> &'static str {
        "CREATE TABLE corrections (
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
            writing_type TEXT
        );"
    }

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(corrections_table_sql()).unwrap();
        conn
    }

    fn count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM corrections", [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn backfill_imports_jsonl_into_empty_db() {
        let conn = setup_db();
        let dir = tempfile::tempdir().unwrap();
        let jsonl_path = dir.path().join("corrections-2026-02-23.jsonl");
        let mut f = fs::File::create(&jsonl_path).unwrap();
        writeln!(f, r#"{{"highlight_id":"h1","document_id":"d1","session_id":"s1","original_text":"bad text","notes":["fix"],"document_source":"file","highlight_color":"yellow","exported_at":1700000000000}}"#).unwrap();
        writeln!(f, r#"{{"highlight_id":"h2","document_id":"d1","session_id":"s1","original_text":"another","notes":["also fix"],"document_source":"file","highlight_color":"green","exported_at":1700000001000}}"#).unwrap();
        f.flush().unwrap();

        backfill_corrections_from_dir(&conn, dir.path());

        assert_eq!(count(&conn), 2);
        let text: String = conn
            .query_row(
                "SELECT original_text FROM corrections WHERE highlight_id = 'h1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(text, "bad text");
    }

    #[test]
    fn backfill_upserts_on_duplicate_highlight_id() {
        let conn = setup_db();
        // Pre-insert one correction
        conn.execute(
            "INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, document_source, highlight_color, created_at, updated_at) VALUES ('existing', 'h1', 'd1', 's1', 'old text', '[]', 'file', 'yellow', 0, 0)",
            [],
        ).unwrap();

        let dir = tempfile::tempdir().unwrap();
        let jsonl_path = dir.path().join("corrections-2026-02-23.jsonl");
        let mut f = fs::File::create(&jsonl_path).unwrap();
        // Same highlight_id as existing — should upsert (update)
        writeln!(f, r#"{{"highlight_id":"h1","document_id":"d1","session_id":"s2","original_text":"new text","notes":["fix"],"document_source":"file","highlight_color":"yellow","exported_at":1700000000000}}"#).unwrap();
        // New highlight_id
        writeln!(f, r#"{{"highlight_id":"h2","document_id":"d1","session_id":"s2","original_text":"fresh","notes":["new"],"document_source":"file","highlight_color":"green","exported_at":1700000001000}}"#).unwrap();
        f.flush().unwrap();

        let imported = backfill_corrections_from_dir(&conn, dir.path());

        assert_eq!(imported, 2); // both processed (1 upsert + 1 insert)
        assert_eq!(count(&conn), 2); // 1 updated + 1 new
        // h1 text should be updated from JSONL
        let text: String = conn
            .query_row(
                "SELECT original_text FROM corrections WHERE highlight_id = 'h1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(text, "new text");
    }

    #[test]
    fn backfill_processes_files_in_sorted_order() {
        let conn = setup_db();
        let dir = tempfile::tempdir().unwrap();

        // Older file
        let old_path = dir.path().join("corrections-2026-02-01.jsonl");
        let mut f = fs::File::create(&old_path).unwrap();
        writeln!(f, r#"{{"highlight_id":"h1","document_id":"d1","session_id":"s1","original_text":"old version","notes":["old"],"document_source":"file","highlight_color":"yellow","exported_at":1000}}"#).unwrap();
        f.flush().unwrap();

        // Newer file (should win on upsert)
        let new_path = dir.path().join("corrections-2026-02-23.jsonl");
        let mut f = fs::File::create(&new_path).unwrap();
        writeln!(f, r#"{{"highlight_id":"h1","document_id":"d1","session_id":"s2","original_text":"new version","notes":["new"],"document_source":"file","highlight_color":"green","exported_at":2000}}"#).unwrap();
        f.flush().unwrap();

        backfill_corrections_from_dir(&conn, dir.path());

        assert_eq!(count(&conn), 1);
        let text: String = conn
            .query_row(
                "SELECT original_text FROM corrections WHERE highlight_id = 'h1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(text, "new version"); // newer file wins
    }

    #[test]
    fn backfill_ignores_non_jsonl_files() {
        let conn = setup_db();
        let dir = tempfile::tempdir().unwrap();
        // Create a .txt file — should be skipped
        let txt_path = dir.path().join("notes.txt");
        fs::write(&txt_path, r#"{"highlight_id":"h1","document_id":"d1","session_id":"s1","original_text":"t","notes":[],"document_source":"file","highlight_color":"yellow","exported_at":0}"#).unwrap();

        backfill_corrections_from_dir(&conn, dir.path());

        assert_eq!(count(&conn), 0);
    }

    #[test]
    fn backfill_skips_malformed_lines() {
        let conn = setup_db();
        let dir = tempfile::tempdir().unwrap();
        let jsonl_path = dir.path().join("corrections-2026-02-23.jsonl");
        let mut f = fs::File::create(&jsonl_path).unwrap();
        writeln!(f, "not json at all").unwrap();
        writeln!(f, r#"{{"no_highlight_id":true}}"#).unwrap();
        writeln!(f, "").unwrap(); // empty line
        writeln!(f, r#"{{"highlight_id":"h1","document_id":"d1","session_id":"s1","original_text":"good","notes":["ok"],"document_source":"file","highlight_color":"yellow","exported_at":0}}"#).unwrap();
        f.flush().unwrap();

        backfill_corrections_from_dir(&conn, dir.path());

        assert_eq!(count(&conn), 1); // only the valid line
    }

    #[test]
    fn backfill_handles_missing_directory() {
        let conn = setup_db();
        let nonexistent = PathBuf::from("/tmp/margin-test-nonexistent-dir-xyz");
        // Should not panic
        backfill_corrections_from_dir(&conn, &nonexistent);
        assert_eq!(count(&conn), 0);
    }

    #[test]
    fn migrate_adds_writing_type_column() {
        // Start with a table WITHOUT writing_type
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE corrections (
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
            );",
        )
        .unwrap();

        // Insert a row before migration
        conn.execute(
            "INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, document_source, highlight_color, created_at, updated_at)
             VALUES ('id1', 'h1', 'd1', 's1', 'text', '[]', 'file', 'yellow', 1000, 1000)",
            [],
        )
        .unwrap();

        // Run migration
        migrate_corrections_add_writing_type(&conn).unwrap();

        // Existing row should have NULL writing_type
        let wt: Option<String> = conn
            .query_row(
                "SELECT writing_type FROM corrections WHERE id = 'id1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(wt, None);

        // Should be able to insert with writing_type
        conn.execute(
            "INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, document_source, highlight_color, created_at, updated_at, writing_type)
             VALUES ('id2', 'h2', 'd1', 's1', 'text2', '[]', 'file', 'yellow', 2000, 2000, 'email')",
            [],
        )
        .unwrap();

        let wt2: Option<String> = conn
            .query_row(
                "SELECT writing_type FROM corrections WHERE id = 'id2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(wt2, Some("email".to_string()));

        // Running migration again is idempotent
        migrate_corrections_add_writing_type(&conn).unwrap();
    }
}

/// Adds a `writing_type` column to the corrections table if it doesn't exist.
fn migrate_corrections_add_writing_type(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    // Check if column already exists
    let has_column: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(corrections)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();
        columns.iter().any(|c| c == "writing_type")
    };

    if !has_column {
        conn.execute_batch(
            "ALTER TABLE corrections ADD COLUMN writing_type TEXT;
             CREATE INDEX IF NOT EXISTS idx_corrections_writing_type ON corrections(writing_type);",
        )?;
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
