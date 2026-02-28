use crate::db::migrations::DbPool;
use crate::db::models::CorrectionInput;
use rusqlite::Connection;
use std::fs;
use std::io::Write;
use std::time::SystemTime;
use uuid::Uuid;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionRecord {
    pub original_text: String,
    pub notes: Vec<String>,
    pub highlight_color: String,
    pub document_title: Option<String>,
    pub document_id: String,
    pub created_at: i64,
    pub writing_type: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentCorrections {
    pub document_id: String,
    pub document_title: Option<String>,
    pub document_path: Option<String>,
    pub corrections: Vec<CorrectionDetail>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionDetail {
    pub highlight_id: String,
    pub original_text: String,
    pub notes: Vec<String>,
    pub extended_context: Option<String>,
    pub highlight_color: String,
    pub writing_type: Option<String>,
    pub document_title: Option<String>,
    pub created_at: i64,
}

fn sanitize_filename_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len().min(64));
    for ch in input.chars() {
        if out.len() >= 64 {
            break;
        }
        let keep = ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.');
        out.push(if keep { ch } else { '_' });
    }
    if out.is_empty() {
        "unknown".to_string()
    } else {
        out
    }
}

fn now_millis() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|e| e.to_string())
        .map(|d| d.as_millis() as i64)
}

fn fetch_corrections(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<CorrectionRecord>> {
    let mut stmt = conn.prepare(
        "SELECT original_text, notes_json, highlight_color, document_title, document_id, created_at, writing_type
         FROM corrections
         ORDER BY created_at DESC
         LIMIT ?1",
    )?;

    let rows = stmt.query_map([limit], |row| {
        let original_text: String = row.get(0)?;
        let notes_json: String = row.get(1)?;
        let highlight_color: String = row.get(2)?;
        let document_title: Option<String> = row.get(3)?;
        let document_id: String = row.get(4)?;
        let created_at: i64 = row.get(5)?;
        let writing_type: Option<String> = row.get(6)?;

        let notes: Vec<String> = serde_json::from_str(&notes_json).unwrap_or_default();

        Ok(CorrectionRecord {
            original_text,
            notes,
            highlight_color,
            document_title,
            document_id,
            created_at,
            writing_type,
        })
    })?;

    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn count_corrections(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM corrections", [], |row| row.get(0))
}

#[tauri::command]
pub async fn get_all_corrections(state: tauri::State<'_, DbPool>, limit: Option<i64>) -> Result<Vec<CorrectionRecord>, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let limit = limit.unwrap_or(200).max(1).min(2000);
    fetch_corrections(&conn, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_corrections_count(state: tauri::State<'_, DbPool>) -> Result<i64, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    count_corrections(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn persist_corrections(
    state: tauri::State<'_, DbPool>,
    corrections: Vec<CorrectionInput>,
    document_id: String,
    document_title: Option<String>,
    document_source: String,
    document_path: Option<String>,
    export_date: String,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let session_id = Uuid::new_v4().to_string();
    let now = now_millis()?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    let safe_export_date = sanitize_filename_component(&export_date);
    let mut jsonl_file = dirs::home_dir()
        .map(|home| home.join(".margin").join("corrections"))
        .and_then(|dir| {
            if let Err(e) = fs::create_dir_all(&dir) {
                eprintln!("Failed to create corrections directory: {e}");
                return None;
            }
            Some(dir.join(format!("corrections-{}.jsonl", safe_export_date)))
        })
        .and_then(|jsonl_path| {
            fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&jsonl_path)
                .map_err(|e| {
                    eprintln!("Failed to open corrections JSONL file: {e}");
                    e
                })
                .ok()
        });

    for input in &corrections {
        let id = Uuid::new_v4().to_string();
        let notes_json = serde_json::to_string(&input.notes).map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text,
                 prefix_context, suffix_context, extended_context, notes_json,
                 document_title, document_source, document_path, category,
                 highlight_color, created_at, updated_at, writing_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
             ON CONFLICT(highlight_id) DO UPDATE SET
                session_id = excluded.session_id,
                original_text = excluded.original_text,
                prefix_context = excluded.prefix_context,
                suffix_context = excluded.suffix_context,
                extended_context = excluded.extended_context,
                notes_json = excluded.notes_json,
                document_title = excluded.document_title,
                document_source = excluded.document_source,
                document_path = excluded.document_path,
                highlight_color = excluded.highlight_color,
                updated_at = excluded.updated_at,
                writing_type = COALESCE(excluded.writing_type, corrections.writing_type)",
            rusqlite::params![
                id,
                input.highlight_id,
                document_id,
                session_id,
                input.original_text,
                input.prefix_context,
                input.suffix_context,
                input.extended_context,
                notes_json,
                document_title,
                document_source,
                document_path,
                Option::<String>::None, // category
                input.highlight_color,
                now,
                now,
                input.writing_type,
            ],
        )
        .map_err(|e| e.to_string())?;

        // Append JSONL record
        if let Some(file) = jsonl_file.as_mut() {
            let jsonl_record = serde_json::json!({
            "highlight_id": input.highlight_id,
            "session_id": session_id,
            "original_text": input.original_text,
            "prefix_context": input.prefix_context,
            "suffix_context": input.suffix_context,
            "extended_context": input.extended_context,
            "notes": input.notes,
            "document_id": document_id,
            "document_title": document_title,
            "document_source": document_source,
            "document_path": document_path,
            "highlight_color": input.highlight_color,
            "writing_type": input.writing_type,
            "exported_at": now,
        });

            if let Err(e) = writeln!(file, "{}", jsonl_record) {
                eprintln!("Failed to append corrections JSONL record: {e}");
                jsonl_file = None;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    if let Some(mut file) = jsonl_file {
        let _ = file.flush();
    }

    Ok(session_id)
}

fn fetch_corrections_by_document(
    conn: &Connection,
    limit: i64,
) -> rusqlite::Result<Vec<DocumentCorrections>> {
    let mut stmt = conn.prepare(
        "SELECT highlight_id, original_text, notes_json, extended_context,
                highlight_color, writing_type, document_title, document_id,
                document_path, created_at
         FROM corrections
         WHERE session_id != '__backfilled__'
         ORDER BY created_at DESC
         LIMIT ?1",
    )?;

    let rows = stmt.query_map([limit], |row| {
        Ok((
            row.get::<_, String>(7)?,        // document_id
            row.get::<_, Option<String>>(6)?, // document_title
            row.get::<_, Option<String>>(8)?, // document_path
            CorrectionDetail {
                highlight_id: row.get(0)?,
                original_text: row.get(1)?,
                notes: serde_json::from_str::<Vec<String>>(
                    &row.get::<_, String>(2)?,
                )
                .unwrap_or_default(),
                extended_context: row.get(3)?,
                highlight_color: row.get(4)?,
                writing_type: row.get(5)?,
                document_title: row.get(6)?,
                created_at: row.get(9)?,
            },
        ))
    })?;

    let mut groups: Vec<DocumentCorrections> = Vec::new();
    let mut group_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for row in rows {
        let (doc_id, doc_title, doc_path, detail) = row?;
        if let Some(&idx) = group_map.get(&doc_id) {
            groups[idx].corrections.push(detail);
        } else {
            let idx = groups.len();
            group_map.insert(doc_id.clone(), idx);
            groups.push(DocumentCorrections {
                document_id: doc_id,
                document_title: doc_title,
                document_path: doc_path,
                corrections: vec![detail],
            });
        }
    }

    Ok(groups)
}

fn update_writing_type(
    conn: &Connection,
    highlight_id: &str,
    writing_type: &str,
) -> rusqlite::Result<()> {
    let rows = conn.execute(
        "UPDATE corrections SET writing_type = ?1, updated_at = ?2 WHERE highlight_id = ?3",
        rusqlite::params![writing_type, now_millis().unwrap_or(0), highlight_id],
    )?;
    if rows == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

fn delete_correction_by_highlight(conn: &Connection, highlight_id: &str) -> rusqlite::Result<()> {
    let rows = conn.execute(
        "DELETE FROM corrections WHERE highlight_id = ?1",
        [highlight_id],
    )?;
    if rows == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectionsExport {
    pub exported_at: String,
    pub total_count: usize,
    pub corrections: Vec<ExportedCorrection>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedCorrection {
    pub original_text: String,
    pub notes: Vec<String>,
    pub extended_context: Option<String>,
    pub writing_type: Option<String>,
    pub document_title: Option<String>,
    pub highlight_color: String,
    pub created_at: i64,
}

fn build_corrections_export(conn: &Connection) -> rusqlite::Result<CorrectionsExport> {
    let mut stmt = conn.prepare(
        "SELECT original_text, notes_json, extended_context, writing_type,
                document_title, highlight_color, created_at
         FROM corrections
         WHERE session_id != '__backfilled__'
         ORDER BY created_at DESC",
    )?;

    let corrections: Vec<ExportedCorrection> = stmt
        .query_map([], |row| {
            Ok(ExportedCorrection {
                original_text: row.get(0)?,
                notes: serde_json::from_str::<Vec<String>>(
                    &row.get::<_, String>(1)?,
                )
                .unwrap_or_default(),
                extended_context: row.get(2)?,
                writing_type: row.get(3)?,
                document_title: row.get(4)?,
                highlight_color: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let now = {
        let d = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default();
        // ISO 8601 UTC timestamp
        let secs = d.as_secs();
        let days = secs / 86400;
        let time_of_day = secs % 86400;
        let hours = time_of_day / 3600;
        let minutes = (time_of_day % 3600) / 60;
        let seconds = time_of_day % 60;
        // Approximate date calculation (good enough for export timestamp)
        let mut y = 1970i64;
        let mut remaining_days = days as i64;
        loop {
            let year_days = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
            if remaining_days < year_days { break; }
            remaining_days -= year_days;
            y += 1;
        }
        let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
        let month_days = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let mut m = 0usize;
        for &md in &month_days {
            if remaining_days < md as i64 { break; }
            remaining_days -= md as i64;
            m += 1;
        }
        format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, m + 1, remaining_days + 1, hours, minutes, seconds)
    };
    Ok(CorrectionsExport {
        exported_at: now,
        total_count: corrections.len(),
        corrections,
    })
}

#[tauri::command]
pub async fn get_corrections_by_document(state: tauri::State<'_, DbPool>, limit: Option<i64>) -> Result<Vec<DocumentCorrections>, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let limit = limit.unwrap_or(50).max(1).min(500);
    fetch_corrections_by_document(&conn, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_correction_writing_type(
    state: tauri::State<'_, DbPool>,
    highlight_id: String,
    writing_type: String,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    update_writing_type(&conn, &highlight_id, &writing_type).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_correction(state: tauri::State<'_, DbPool>, highlight_id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    delete_correction_by_highlight(&conn, &highlight_id).map_err(|e| e.to_string())
}

fn export_and_clear_corrections(conn: &Connection, path: &std::path::Path) -> Result<usize, String> {
    let export = build_corrections_export(conn).map_err(|e| e.to_string())?;
    let count = export.total_count;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }

    let json = serde_json::to_string_pretty(&export).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("Failed to write export: {e}"))?;

    conn.execute(
        "DELETE FROM corrections WHERE session_id != '__backfilled__'",
        [],
    )
    .map_err(|e| format!("Failed to clear exported corrections: {e}"))?;

    Ok(count)
}

#[tauri::command]
pub async fn export_corrections_json(state: tauri::State<'_, DbPool>, path: Option<String>) -> Result<usize, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());

    let export_path = if let Some(p) = path {
        std::path::PathBuf::from(p)
    } else {
        dirs::home_dir()
            .ok_or("Could not determine home directory")?
            .join(".margin")
            .join("corrections-export.json")
    };

    export_and_clear_corrections(&conn, &export_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full_schema_sql() -> &'static str {
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

    fn setup_full_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(full_schema_sql()).unwrap();
        conn
    }

    fn insert_correction(conn: &Connection, highlight_id: &str, text: &str, notes: &str) {
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at)
             VALUES (?1, ?2, 'doc1', 'sess1', ?3, ?4, 'Test', 'file', 'yellow', 1000, 1000)",
            rusqlite::params![Uuid::new_v4().to_string(), highlight_id, text, notes],
        )
        .unwrap();
    }

    #[test]
    fn sanitize_filename_component_replaces_unsafe_chars_and_is_not_empty() {
        assert_eq!(
            sanitize_filename_component("2026/02/23 10:20:30"),
            "2026_02_23_10_20_30"
        );
        assert_eq!(sanitize_filename_component(""), "unknown");
    }

    #[test]
    fn fetch_corrections_orders_desc_and_respects_limit() {
        let conn = setup_full_db();
        for i in 0..5 {
            conn.execute(
                "INSERT INTO corrections
                    (id, highlight_id, document_id, session_id, original_text, notes_json,
                     document_title, document_source, highlight_color, created_at, updated_at)
                 VALUES (?1, ?2, 'doc', 'sess', ?3, '[\"n\"]', NULL, 'file', 'yellow', ?4, ?5)",
                rusqlite::params![
                    Uuid::new_v4().to_string(),
                    format!("h{i}"),
                    format!("t{i}"),
                    i as i64,
                    i as i64,
                ],
            )
            .unwrap();
        }

        let records = fetch_corrections(&conn, 2).unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].created_at, 4);
        assert_eq!(records[1].created_at, 3);
    }

    #[test]
    fn count_corrections_counts_all_rows() {
        let conn = setup_full_db();
        insert_correction(&conn, "h1", "text1", r#"["note1"]"#);
        insert_correction(&conn, "h2", "text2", r#"["note2"]"#);
        assert_eq!(count_corrections(&conn).unwrap(), 2);
    }

    #[test]
    fn fetch_corrections_deserializes_notes_json() {
        let conn = setup_full_db();
        insert_correction(&conn, "h1", "bad phrase", r#"["use X instead","also Y"]"#);
        let records = fetch_corrections(&conn, 10).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].original_text, "bad phrase");
        assert_eq!(records[0].notes, vec!["use X instead", "also Y"]);
        assert_eq!(records[0].highlight_color, "yellow");
    }

    #[test]
    fn upsert_updates_on_duplicate_highlight_id() {
        let conn = setup_full_db();
        insert_correction(&conn, "h1", "original", r#"["old note"]"#);
        assert_eq!(count_corrections(&conn).unwrap(), 1);

        // Upsert with same highlight_id should update, not duplicate
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at)
             VALUES (?1, 'h1', 'doc1', 'sess2', 'updated', '[\"new note\"]', 'Test', 'file', 'green', 2000, 2000)
             ON CONFLICT(highlight_id) DO UPDATE SET
                original_text = excluded.original_text,
                notes_json = excluded.notes_json,
                highlight_color = excluded.highlight_color,
                updated_at = excluded.updated_at",
            rusqlite::params![Uuid::new_v4().to_string()],
        )
        .unwrap();

        assert_eq!(count_corrections(&conn).unwrap(), 1); // still 1
        let records = fetch_corrections(&conn, 10).unwrap();
        assert_eq!(records[0].original_text, "updated");
        assert_eq!(records[0].notes, vec!["new note"]);
        assert_eq!(records[0].highlight_color, "green");
    }

    #[test]
    fn corrections_insert_without_foreign_keys() {
        // This is the key bug fix test: corrections should insert even when
        // highlight_id and document_id don't reference existing rows
        let conn = setup_full_db();
        insert_correction(&conn, "nonexistent-highlight", "some text", r#"["note"]"#);
        assert_eq!(count_corrections(&conn).unwrap(), 1);
    }

    // --- writing_type tests ---

    #[test]
    fn fetch_corrections_includes_writing_type() {
        let conn = setup_full_db();
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at, writing_type)
             VALUES ('id1', 'h1', 'doc1', 'sess1', 'text', '[\"note\"]', 'Test', 'file', 'yellow', 1000, 1000, 'email')",
            [],
        ).unwrap();

        let records = fetch_corrections(&conn, 10).unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].writing_type, Some("email".to_string()));
    }

    #[test]
    fn fetch_corrections_null_writing_type() {
        let conn = setup_full_db();
        insert_correction(&conn, "h1", "text", r#"["note"]"#);

        let records = fetch_corrections(&conn, 10).unwrap();
        assert_eq!(records[0].writing_type, None);
    }

    #[test]
    fn upsert_preserves_existing_writing_type_when_null() {
        let conn = setup_full_db();
        // Insert with writing_type
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at, writing_type)
             VALUES ('id1', 'h1', 'doc1', 'sess1', 'text', '[\"note\"]', 'Test', 'file', 'yellow', 1000, 1000, 'prd')",
            [],
        ).unwrap();

        // Upsert with NULL writing_type — should preserve 'prd'
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at, writing_type)
             VALUES ('id2', 'h1', 'doc1', 'sess2', 'updated', '[\"new\"]', 'Test', 'file', 'yellow', 2000, 2000, NULL)
             ON CONFLICT(highlight_id) DO UPDATE SET
                original_text = excluded.original_text,
                notes_json = excluded.notes_json,
                updated_at = excluded.updated_at,
                writing_type = COALESCE(excluded.writing_type, corrections.writing_type)",
            [],
        ).unwrap();

        let wt: Option<String> = conn
            .query_row("SELECT writing_type FROM corrections WHERE highlight_id = 'h1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(wt, Some("prd".to_string()));
    }

    #[test]
    fn upsert_updates_writing_type_when_provided() {
        let conn = setup_full_db();
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at, writing_type)
             VALUES ('id1', 'h1', 'doc1', 'sess1', 'text', '[\"note\"]', 'Test', 'file', 'yellow', 1000, 1000, 'prd')",
            [],
        ).unwrap();

        // Upsert with new writing_type — should update to 'email'
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at, writing_type)
             VALUES ('id2', 'h1', 'doc1', 'sess2', 'text', '[\"note\"]', 'Test', 'file', 'yellow', 2000, 2000, 'email')
             ON CONFLICT(highlight_id) DO UPDATE SET
                updated_at = excluded.updated_at,
                writing_type = COALESCE(excluded.writing_type, corrections.writing_type)",
            [],
        ).unwrap();

        let wt: Option<String> = conn
            .query_row("SELECT writing_type FROM corrections WHERE highlight_id = 'h1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(wt, Some("email".to_string()));
    }

    // --- get_corrections_by_document tests ---

    fn insert_full_correction(conn: &Connection, highlight_id: &str, doc_id: &str, doc_title: &str, text: &str, notes: &str, created_at: i64) {
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, document_path, highlight_color, created_at, updated_at, writing_type)
             VALUES (?1, ?2, ?3, 'sess1', ?4, ?5, ?6, 'file', '/path', 'yellow', ?7, ?7, NULL)",
            rusqlite::params![Uuid::new_v4().to_string(), highlight_id, doc_id, text, notes, doc_title, created_at],
        ).unwrap();
    }

    #[test]
    fn get_corrections_by_document_empty() {
        let conn = setup_full_db();
        let groups = fetch_corrections_by_document(&conn, 50).unwrap();
        assert!(groups.is_empty());
    }

    #[test]
    fn get_corrections_by_document_groups_correctly() {
        let conn = setup_full_db();
        insert_full_correction(&conn, "h1", "doc1", "Article A", "text1", r#"["n1"]"#, 3000);
        insert_full_correction(&conn, "h2", "doc2", "Article B", "text2", r#"["n2"]"#, 2000);
        insert_full_correction(&conn, "h3", "doc1", "Article A", "text3", r#"["n3"]"#, 1000);

        let groups = fetch_corrections_by_document(&conn, 50).unwrap();
        assert_eq!(groups.len(), 2);
        // First group is doc1 (most recent correction at 3000)
        assert_eq!(groups[0].document_id, "doc1");
        assert_eq!(groups[0].corrections.len(), 2);
        // Second group is doc2
        assert_eq!(groups[1].document_id, "doc2");
        assert_eq!(groups[1].corrections.len(), 1);
    }

    // --- update_correction_writing_type tests ---

    #[test]
    fn update_writing_type_succeeds() {
        let conn = setup_full_db();
        insert_correction(&conn, "h1", "text", r#"["note"]"#);
        update_writing_type(&conn, "h1", "blog").unwrap();

        let wt: Option<String> = conn
            .query_row("SELECT writing_type FROM corrections WHERE highlight_id = 'h1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(wt, Some("blog".to_string()));
    }

    #[test]
    fn update_writing_type_nonexistent_fails() {
        let conn = setup_full_db();
        let result = update_writing_type(&conn, "nonexistent", "blog");
        assert!(result.is_err());
    }

    // --- delete_correction tests ---

    #[test]
    fn delete_correction_succeeds() {
        let conn = setup_full_db();
        insert_correction(&conn, "h1", "text", r#"["note"]"#);
        assert_eq!(count_corrections(&conn).unwrap(), 1);
        delete_correction_by_highlight(&conn, "h1").unwrap();
        assert_eq!(count_corrections(&conn).unwrap(), 0);
    }

    #[test]
    fn delete_correction_nonexistent_fails() {
        let conn = setup_full_db();
        let result = delete_correction_by_highlight(&conn, "nonexistent");
        assert!(result.is_err());
    }

    // --- export_corrections_json tests ---

    #[test]
    fn build_export_empty_db() {
        let conn = setup_full_db();
        let export = build_corrections_export(&conn).unwrap();
        assert_eq!(export.total_count, 0);
        assert!(export.corrections.is_empty());
        // Should produce valid JSON
        let json = serde_json::to_string(&export).unwrap();
        assert!(json.contains("\"corrections\":[]"));
    }

    #[test]
    fn build_export_with_corrections() {
        let conn = setup_full_db();
        insert_full_correction(&conn, "h1", "doc1", "Test Doc", "bad text", r#"["use good text"]"#, 1000);
        insert_full_correction(&conn, "h2", "doc1", "Test Doc", "also bad", r#"["fix"]"#, 2000);

        let export = build_corrections_export(&conn).unwrap();
        assert_eq!(export.total_count, 2);
        assert_eq!(export.corrections.len(), 2);
        // Most recent first
        assert_eq!(export.corrections[0].original_text, "also bad");
        assert_eq!(export.corrections[1].original_text, "bad text");
    }

    #[test]
    fn export_and_clear_deletes_non_backfilled_corrections() {
        let conn = setup_full_db();
        insert_full_correction(&conn, "h1", "doc1", "Doc", "text1", r#"["n1"]"#, 1000);
        insert_full_correction(&conn, "h2", "doc1", "Doc", "text2", r#"["n2"]"#, 2000);
        assert_eq!(count_corrections(&conn).unwrap(), 2);

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("export.json");
        let count = export_and_clear_corrections(&conn, &path).unwrap();

        assert_eq!(count, 2);
        assert!(path.exists());
        assert_eq!(count_corrections(&conn).unwrap(), 0);
    }

    #[test]
    fn export_and_clear_preserves_backfilled_rows() {
        let conn = setup_full_db();
        // Regular correction
        insert_full_correction(&conn, "h1", "doc1", "Doc", "text1", r#"["n1"]"#, 1000);
        // Backfilled correction (should survive)
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at)
             VALUES ('bf1', 'hbf', 'doc1', '__backfilled__', 'old text', '[\"old\"]', 'Doc', 'file', 'yellow', 500, 500)",
            [],
        ).unwrap();
        assert_eq!(count_corrections(&conn).unwrap(), 2);

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("export.json");
        let count = export_and_clear_corrections(&conn, &path).unwrap();

        assert_eq!(count, 1); // only non-backfilled exported
        assert_eq!(count_corrections(&conn).unwrap(), 1); // backfilled survives
        let remaining: String = conn
            .query_row("SELECT session_id FROM corrections", [], |r| r.get(0))
            .unwrap();
        assert_eq!(remaining, "__backfilled__");
    }

    #[test]
    fn export_and_clear_returns_zero_when_empty() {
        let conn = setup_full_db();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("export.json");
        let count = export_and_clear_corrections(&conn, &path).unwrap();
        assert_eq!(count, 0);
        assert_eq!(count_corrections(&conn).unwrap(), 0);
    }

    #[test]
    fn build_export_handles_special_chars() {
        let conn = setup_full_db();
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text, notes_json,
                 document_title, document_source, highlight_color, created_at, updated_at)
             VALUES ('id1', 'h1', 'doc1', 'sess1', 'text with \"quotes\" and\nnewlines', '[\"note with \\\"escapes\\\"\"]', 'Test', 'file', 'yellow', 1000, 1000)",
            [],
        ).unwrap();

        let export = build_corrections_export(&conn).unwrap();
        let json = serde_json::to_string_pretty(&export).unwrap();
        // Should be valid JSON despite special chars
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed["corrections"][0]["originalText"].as_str().unwrap().contains("quotes"));
    }
}
