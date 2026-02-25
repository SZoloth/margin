use crate::db::migrations::get_db;
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
        "SELECT original_text, notes_json, highlight_color, document_title, document_id, created_at
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

        let notes: Vec<String> = serde_json::from_str(&notes_json).unwrap_or_default();

        Ok(CorrectionRecord {
            original_text,
            notes,
            highlight_color,
            document_title,
            document_id,
            created_at,
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
pub async fn get_all_corrections(limit: Option<i64>) -> Result<Vec<CorrectionRecord>, String> {
    let conn = get_db()?;
    let limit = limit.unwrap_or(200).max(1).min(2000);
    fetch_corrections(&conn, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_corrections_count() -> Result<i64, String> {
    let conn = get_db()?;
    count_corrections(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn persist_corrections(
    corrections: Vec<CorrectionInput>,
    document_id: String,
    document_title: Option<String>,
    document_source: String,
    document_path: Option<String>,
    export_date: String,
) -> Result<String, String> {
    let mut conn = get_db()?;
    let session_id = Uuid::new_v4().to_string();
    let now = now_millis()?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

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
                 highlight_color, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
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
                updated_at = excluded.updated_at",
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
            updated_at INTEGER NOT NULL
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
}
