use rusqlite::Connection;
use std::fs;
use std::io::BufRead;
use std::path::PathBuf;
use std::sync::Mutex;

fn db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let margin_dir = home.join(".margin");
    fs::create_dir_all(&margin_dir)?;
    Ok(margin_dir.join("margin.db"))
}

/// Shared database connection pool (single connection behind a mutex).
/// All Tauri commands use this via managed state instead of opening fresh connections.
pub struct DbPool(pub Mutex<Connection>);

impl DbPool {
    pub fn new(conn: Connection) -> Self {
        DbPool(Mutex::new(conn))
    }
}

fn apply_pragmas(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch("PRAGMA busy_timeout=5000;")?;
    conn.execute_batch("PRAGMA synchronous=NORMAL;")?;
    Ok(())
}

pub fn init_db() -> Result<DbPool, Box<dyn std::error::Error>> {
    let path = db_path()?;
    let conn = Connection::open(&path)?;

    apply_pragmas(&conn)?;

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

    // Migration: add access_count and indexed_at columns to documents
    migrate_documents_add_frecency_columns(&conn)?;

    // Migration: create writing_rules table
    migrate_add_writing_rules_table(&conn)?;

    // Migration: create content_snapshots table
    migrate_add_content_snapshots_table(&conn)?;

    // Migration: add polarity column to corrections
    migrate_corrections_add_polarity(&conn)?;

    // Seed: voice calibration + editorial rules into writing_rules table
    seed_voice_and_editorial_rules(&conn)?;

    Ok(DbPool::new(conn))
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
            backfill_corrections_from_dir(conn, &corrections_dir);
        }
        // Always insert sentinel so backfill doesn't re-run, even if dir was empty/missing
        let _ = conn.execute(
            "INSERT OR IGNORE INTO corrections
                (id, highlight_id, document_id, session_id, original_text,
                 notes_json, document_source, highlight_color, created_at, updated_at)
             VALUES ('__backfill_marker__', '__backfill_marker__', '', '__backfilled__',
                     '', '[]', 'system', 'none', 0, 0)",
            [],
        );
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

    // === DbPool tests ===

    #[test]
    fn db_pool_sets_wal_mode() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
        // In-memory databases report "memory" instead of "wal", but the pragma doesn't error.
        // For a real file DB it would be "wal". Just verify it doesn't fail.
        assert!(!mode.is_empty());
    }

    #[test]
    fn db_pool_sets_foreign_keys() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn db_pool_sets_busy_timeout() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        let timeout: i64 = conn.query_row("PRAGMA busy_timeout", [], |r| r.get(0)).unwrap();
        assert_eq!(timeout, 5000);
    }

    #[test]
    fn db_pool_connection_is_reusable() {
        let conn = Connection::open_in_memory().unwrap();
        apply_pragmas(&conn).unwrap();
        let pool = DbPool::new(conn);

        // First use
        {
            let c = pool.0.lock().unwrap();
            c.execute_batch("CREATE TABLE test (id INTEGER PRIMARY KEY)").unwrap();
            c.execute("INSERT INTO test (id) VALUES (1)", []).unwrap();
        }

        // Second use — same connection, data persists
        {
            let c = pool.0.lock().unwrap();
            let count: i64 = c.query_row("SELECT COUNT(*) FROM test", [], |r| r.get(0)).unwrap();
            assert_eq!(count, 1);
        }
    }

    // === Frecency migration tests ===

    #[test]
    fn migrate_adds_access_count_and_indexed_at() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE documents (
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
            );",
        ).unwrap();

        migrate_documents_add_frecency_columns(&conn).unwrap();

        // Verify columns exist
        conn.execute(
            "INSERT INTO documents (id, source, last_opened_at, created_at, access_count, indexed_at)
             VALUES ('d1', 'file', 1000, 1000, 5, 2000)",
            [],
        ).unwrap();

        let (ac, ia): (i64, Option<i64>) = conn.query_row(
            "SELECT access_count, indexed_at FROM documents WHERE id = 'd1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(ac, 5);
        assert_eq!(ia, Some(2000));

        // Idempotent
        migrate_documents_add_frecency_columns(&conn).unwrap();
    }

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
            writing_type TEXT,
            polarity TEXT CHECK(polarity IN ('positive', 'corrective'))
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

    // === Writing rules migration tests ===

    #[test]
    fn migrate_creates_writing_rules_table() {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();

        // Insert a valid rule
        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r1', 'general', 'ai-slop', 'No negative parallelism', 'must-fix', 'manual', 1000, 1000)",
            [],
        ).unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM writing_rules", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migrate_writing_rules_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();
        migrate_add_writing_rules_table(&conn).unwrap(); // should not error
    }

    #[test]
    fn writing_rules_rejects_invalid_writing_type() {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();

        let result = conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r1', 'invalid-type', 'test', 'rule', 'must-fix', 'manual', 1000, 1000)",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn writing_rules_rejects_invalid_severity() {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();

        let result = conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r1', 'general', 'test', 'rule', 'critical', 'manual', 1000, 1000)",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn writing_rules_unique_constraint_prevents_duplicates() {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();

        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r1', 'general', 'ai-slop', 'No negative parallelism', 'must-fix', 'manual', 1000, 1000)",
            [],
        ).unwrap();

        // Same writing_type + category + rule_text should fail
        let result = conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r2', 'general', 'ai-slop', 'No negative parallelism', 'should-fix', 'manual', 2000, 2000)",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn writing_rules_allows_same_rule_different_types() {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();

        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r1', 'general', 'tone', 'Be direct', 'should-fix', 'manual', 1000, 1000)",
            [],
        ).unwrap();

        // Same category + rule_text but different writing_type is fine
        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r2', 'email', 'tone', 'Be direct', 'should-fix', 'manual', 1000, 1000)",
            [],
        ).unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM writing_rules", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn migrate_adds_polarity_column() {
        // Start with a table WITHOUT polarity (but with writing_type)
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
                updated_at INTEGER NOT NULL,
                writing_type TEXT
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
        migrate_corrections_add_polarity(&conn).unwrap();

        // Existing row should have NULL polarity
        let pol: Option<String> = conn
            .query_row(
                "SELECT polarity FROM corrections WHERE id = 'id1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pol, None);

        // Should be able to insert with polarity = 'positive'
        conn.execute(
            "INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, document_source, highlight_color, created_at, updated_at, polarity)
             VALUES ('id2', 'h2', 'd1', 's1', 'text2', '[]', 'file', 'yellow', 2000, 2000, 'positive')",
            [],
        )
        .unwrap();

        let pol2: Option<String> = conn
            .query_row(
                "SELECT polarity FROM corrections WHERE id = 'id2'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pol2, Some("positive".to_string()));

        // Should be able to insert with polarity = 'corrective'
        conn.execute(
            "INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, document_source, highlight_color, created_at, updated_at, polarity)
             VALUES ('id3', 'h3', 'd1', 's1', 'text3', '[]', 'file', 'yellow', 3000, 3000, 'corrective')",
            [],
        )
        .unwrap();

        let pol3: Option<String> = conn
            .query_row(
                "SELECT polarity FROM corrections WHERE id = 'id3'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pol3, Some("corrective".to_string()));

        // Running migration again is idempotent
        migrate_corrections_add_polarity(&conn).unwrap();
    }

    #[test]
    fn writing_rules_stores_all_optional_fields() {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();

        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, when_to_apply, why, severity,
             example_before, example_after, source, signal_count, notes, created_at, updated_at)
             VALUES ('r1', 'blog', 'argument-rigor', 'Expand assertions with proof', 'Bold claims', 'Credibility',
             'must-fix', 'Claim without proof.', 'Claim with example.', 'corrections', 3, 'From blog review', 1000, 1000)",
            [],
        ).unwrap();

        let (when, why, before, after, notes, signal): (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64) = conn.query_row(
            "SELECT when_to_apply, why, example_before, example_after, notes, signal_count FROM writing_rules WHERE id = 'r1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        ).unwrap();
        assert_eq!(when, Some("Bold claims".to_string()));
        assert_eq!(why, Some("Credibility".to_string()));
        assert_eq!(before, Some("Claim without proof.".to_string()));
        assert_eq!(after, Some("Claim with example.".to_string()));
        assert_eq!(notes, Some("From blog review".to_string()));
        assert_eq!(signal, 3);
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

/// Creates the `writing_rules` table if it doesn't exist.
pub fn migrate_add_writing_rules_table(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS writing_rules (
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
            UNIQUE(writing_type, category, rule_text)
        );
        CREATE INDEX IF NOT EXISTS idx_writing_rules_type ON writing_rules(writing_type);",
    )?;
    Ok(())
}

/// Creates the `content_snapshots` table if it doesn't exist.
pub fn migrate_add_content_snapshots_table(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS content_snapshots (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            snapshot_type TEXT NOT NULL DEFAULT 'pre_external_edit'
                CHECK(snapshot_type IN ('pre_external_edit', 'manual')),
            created_at INTEGER NOT NULL,
            UNIQUE(document_id, snapshot_type)
        );
        CREATE INDEX IF NOT EXISTS idx_snapshots_document ON content_snapshots(document_id);",
    )?;
    Ok(())
}

/// Adds a `polarity` column to the corrections table if it doesn't exist.
fn migrate_corrections_add_polarity(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    let has_column: bool = {
        let mut stmt = conn.prepare("PRAGMA table_info(corrections)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();
        columns.iter().any(|c| c == "polarity")
    };

    if !has_column {
        conn.execute_batch(
            "ALTER TABLE corrections ADD COLUMN polarity TEXT CHECK(polarity IN ('positive', 'corrective'));
             CREATE INDEX IF NOT EXISTS idx_corrections_polarity ON corrections(polarity);",
        )?;
    }

    Ok(())
}

/// Seeds voice calibration and editorial rules into the writing_rules table.
/// Idempotent: uses INSERT OR IGNORE so duplicate (writing_type, category, rule_text) combos are skipped.
/// Source content was previously split across ~/.claude/voice-corpus/voice-profile.md and ~/.claude/writing-rules.md.
pub fn seed_voice_and_editorial_rules(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    // Check sentinel to avoid re-running on every startup.
    // To add new seed rules in a future release, bump to 'seed-v2' (new sentinel + new block).
    let already_seeded: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM writing_rules WHERE source = 'seed-v1' LIMIT 1)",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if already_seeded {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    // Each tuple: (writing_type, category, rule_text, severity, when_to_apply, why, signal_count)
    let rules: Vec<(&str, &str, &str, &str, Option<&str>, Option<&str>, i64)> = vec![
        // === Voice calibration (from voice-profile.md) ===

        // Punctuation invariants
        ("general", "voice-calibration", "Almost never end messages with periods (~0.8%). This is the single strongest voice signal.", "must-fix",
         Some("All casual and semi-formal writing"), Some("Periods on short messages are the #1 AI tell for this voice"), 10),
        ("general", "voice-calibration", "Questions get question marks (~13%). Excitement gets exclamation marks (~4%). Everything else just ends.", "should-fix",
         Some("End-of-sentence punctuation"), Some("Matches natural punctuation distribution"), 5),
        ("general", "voice-calibration", "Ellipsis for trailing off or softening. Em-dashes for asides and pivots.", "nice-to-fix",
         Some("Mid-sentence punctuation"), None, 3),
        ("general", "voice-calibration", "Double exclamation (!!) for genuine excitement, not performative energy. Interrobang (!? or ?!) for comedic disbelief.", "nice-to-fix",
         Some("Emphasis punctuation"), None, 2),

        // Capitalization
        ("general", "voice-calibration", "Standard capitalization at sentence start (~99%). Selective ALL CAPS for emphasis on single words, not whole phrases.", "should-fix",
         Some("All writing"), Some("Shifted from lowercase circa 2018, now consistent"), 5),

        // Length and rhythm
        ("general", "voice-calibration", "Median message: 27 characters / 5 words. Short is default. 23.5% of messages are fragments (≤3 words).", "should-fix",
         Some("Casual and logistics registers"), Some("Length calibration from 168k messages"), 8),
        ("general", "voice-calibration", "Prefers sending multiple short messages over one long one. Long messages (80+ chars) reserved for explaining, storytelling, or logistics.", "should-fix",
         Some("Message length decisions"), None, 5),

        // Hedging
        ("general", "voice-calibration", "Hedges 3.6x more than declares. 'I think', 'probably', 'maybe', 'kinda' are load-bearing words — calibrated social softening, not uncertainty.", "must-fix",
         Some("All writing"), Some("The hedge creates room for the other person"), 8),
        ("general", "voice-calibration", "Declaratives reserved for things actually known or felt strongly: 'definitely', 'for sure', '100%'.", "should-fix",
         Some("Strong assertions"), None, 3),

        // Register rules
        ("general", "voice-calibration", "Casual/banter: opens with Yo/Hey/So/Dude/Wait, closes with no punctuation (76%), contractions always (gonna/wanna/kinda), humor through absurd escalation and self-deprecation.", "should-fix",
         Some("Default register"), None, 5),
        ("general", "voice-calibration", "Logistics/planning: direct but warm. Softened asks ('Any chance you could...', 'Mind if I...'). 'Let me know' to close open loops. 'Sweet' as acknowledgment.", "should-fix",
         Some("Scheduling and coordination"), None, 4),
        ("general", "voice-calibration", "Explaining/persuading: longer messages (80-200 chars), 'I mean' as pivot not filler, em-dashes and parentheticals increase, additive structure (also/and/plus).", "should-fix",
         Some("Making arguments or explaining"), None, 4),
        ("general", "voice-calibration", "Emotional/heartfelt: 'I appreciate [specific thing]', vulnerability through understatement not overwrought language, 'Really' as sincerity intensifier.", "should-fix",
         Some("Emotional or supportive contexts"), None, 3),
        ("general", "voice-calibration", "Professional/outreach: capitalization and punctuation more conventional, still avoids periods on casual messages, 'I'd love to' not 'I would love to', specificity over generality.", "should-fix",
         Some("Work contacts and networking"), None, 4),

        // Forbidden patterns
        ("general", "voice-calibration", "Never use 'I hope this message finds you well' or any corporate opener.", "must-fix",
         Some("Message openings"), Some("Corporate-speak tell"), 5),
        ("general", "voice-calibration", "Never write 'utilize' — it's 'use'. Never write 'I wanted to reach out' — just reach out.", "must-fix",
         Some("Word choice"), Some("Inflated language tells"), 5),
        ("general", "voice-calibration", "Never use 'that being said', 'having said that', 'furthermore', 'moreover', 'additionally'.", "must-fix",
         Some("Transitions"), Some("AI transition word tells"), 5),
        ("general", "voice-calibration", "Never use 'folks' — it's 'people', 'y'all', or 'everyone'. Never use 'feel free to' — just tell them they can.", "should-fix",
         Some("Word choice"), None, 3),
        ("general", "voice-calibration", "Never use 'absolutely' as agreement — it's 'yeah', 'for sure', or 'definitely'. Never write 'apologies for the delay' — just respond.", "should-fix",
         Some("Response patterns"), None, 3),
        ("general", "voice-calibration", "'Haha' > 'lol' > 'lmao' for laugh markers. Almost never emoji alone for laughter.", "nice-to-fix",
         Some("Humor markers"), None, 3),
        ("general", "voice-calibration", "No sign-off — messages just end. 'Let me know' to leave the ball in their court. Rarely says goodbye.", "should-fix",
         Some("Message closings"), None, 4),

        // === Editorial rules (from writing-rules.md) ===

        // Voice test
        ("general", "editorial", "Read aloud — would you say this at a coffee shop? If it sounds like a press release, rewrite.", "must-fix",
         Some("All prose"), Some("Core voice authenticity test"), 10),

        // AI content tells
        ("general", "editorial", "Avoid rule of three unless genuine enumeration.", "should-fix",
         Some("Sentence structure"), Some("Common AI rhetorical pattern"), 5),
        ("general", "editorial", "Use em dashes sparingly, not as a crutch.", "nice-to-fix",
         Some("Punctuation"), Some("AI overuses em dashes"), 3),
        ("general", "editorial", "Prefer physical, tactile verbs over abstract process verbs: 'sanded down' not 'improved', 'bolted on' not 'added', 'stripped back' not 'simplified'.", "should-fix",
         Some("Verb choice"), Some("Makes prose concrete and harder to fake"), 6),

        // Editorial rules
        ("general", "editorial", "NEVER modify user/stakeholder quotes — apply kill words only to Claude's prose.", "must-fix",
         Some("When editing text containing quotes"), Some("Quotes are sacrosanct"), 10),
        ("general", "editorial", "Requirements docs: write use cases in user language ('I'm looking for X'), not analyst jargon ('semantic search', 'concept retrieval').", "should-fix",
         Some("PRDs and requirements"), None, 3),

        // Professional content
        ("general", "editorial", "Professional/portfolio content: NO emojis, prefer editorial magazine quality.", "should-fix",
         Some("Cover letters, outreach, portfolio"), None, 3),
        ("general", "editorial", "Run /writing-quality-gate on all professional content before submission.", "should-fix",
         Some("Professional and external-facing writing"), None, 5),

        // Outcome framing
        ("general", "editorial", "Always filter through 'did behavior change?' before claiming an outcome. Artifacts (frameworks, decks) ≠ outcomes.", "should-fix",
         Some("Outcome claims in resumes, case studies, portfolios"), Some("Vanity metrics without behavior explanation = noise"), 4),

        // Argument depth (from corrections — 6 signals)
        ("general", "argument-rigor", "Don't name-drop frameworks you haven't digested. Research first, cite second.", "must-fix",
         Some("Any reference to external frameworks or theories"), Some("Strongest correction signal — 6 instances"), 6),
        ("general", "argument-rigor", "Examples must support the actual thesis, not just a related point.", "should-fix",
         Some("Using examples to support arguments"), None, 4),
        ("general", "argument-rigor", "Don't flatten nuance into a punchline. Say what's actually happening in concrete terms.", "should-fix",
         Some("Conclusions and summaries"), None, 3),
        ("general", "argument-rigor", "Cover the full argument space. Partial coverage weakens the argument.", "should-fix",
         Some("Making comprehensive arguments"), None, 3),

        // Structural craft
        ("general", "structural-craft", "Claims need evidence. Unsupported assertions lose the reader.", "should-fix",
         Some("Making claims in essays and articles"), None, 2),
        ("general", "structural-craft", "Add links for referenced work. Readers who want depth should be able to follow the thread.", "nice-to-fix",
         Some("Citing external frameworks or articles"), None, 2),
    ];

    for (writing_type, category, rule_text, severity, when_to_apply, why, signal_count) in &rules {
        conn.execute(
            "INSERT OR IGNORE INTO writing_rules (id, writing_type, category, rule_text, severity, when_to_apply, why, source, signal_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'seed-v1', ?8, ?9, ?9)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                writing_type,
                category,
                rule_text,
                severity,
                when_to_apply,
                why,
                signal_count,
                now,
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}

/// Adds `access_count` and `indexed_at` columns to the documents table if they don't exist.
fn migrate_documents_add_frecency_columns(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    let columns: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(documents)")?;
        let cols = stmt.query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .collect();
        cols
    };

    if !columns.iter().any(|c| c == "access_count") {
        conn.execute_batch("ALTER TABLE documents ADD COLUMN access_count INTEGER DEFAULT 0;")?;
    }
    if !columns.iter().any(|c| c == "indexed_at") {
        conn.execute_batch("ALTER TABLE documents ADD COLUMN indexed_at INTEGER;")?;
    }
    Ok(())
}
