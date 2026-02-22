use crate::db::migrations::get_db;
use crate::db::models::CorrectionInput;
use std::fs;
use std::io::Write;
use std::time::SystemTime;
use uuid::Uuid;

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
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
    let conn = get_db()?;
    let session_id = Uuid::new_v4().to_string();
    let now = now_millis();

    // Ensure JSONL output directory exists
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let corrections_dir = home.join(".margin").join("corrections");
    fs::create_dir_all(&corrections_dir).map_err(|e| e.to_string())?;

    let jsonl_path = corrections_dir.join(format!("corrections-{}.jsonl", export_date));
    let mut jsonl_file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&jsonl_path)
        .map_err(|e| e.to_string())?;

    for input in &corrections {
        let id = Uuid::new_v4().to_string();
        let notes_json = serde_json::to_string(&input.notes).map_err(|e| e.to_string())?;

        conn.execute(
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

        writeln!(jsonl_file, "{}", jsonl_record).map_err(|e| e.to_string())?;
    }

    Ok(session_id)
}
