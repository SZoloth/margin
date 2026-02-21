use crate::db::migrations::get_db;
use crate::db::models::Document;
use uuid::Uuid;

#[tauri::command]
pub async fn get_recent_documents(limit: Option<i64>) -> Result<Vec<Document>, String> {
    let conn = get_db()?;
    let limit = limit.unwrap_or(20);

    let mut stmt = conn
        .prepare(
            "SELECT id, source, file_path, keep_local_id, title, author, url,
                    word_count, last_opened_at, created_at
             FROM documents
             ORDER BY last_opened_at DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let docs = stmt
        .query_map([limit], |row| Document::from_row(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(docs)
}

#[tauri::command]
pub async fn upsert_document(mut doc: Document) -> Result<Document, String> {
    let conn = get_db()?;

    // Look up existing document by file_path or keep_local_id to preserve annotation links
    let existing_id: Option<String> = if let Some(ref fp) = doc.file_path {
        conn.query_row(
            "SELECT id FROM documents WHERE file_path = ?1",
            rusqlite::params![fp],
            |row| row.get(0),
        )
        .ok()
    } else if let Some(ref kl_id) = doc.keep_local_id {
        conn.query_row(
            "SELECT id FROM documents WHERE keep_local_id = ?1",
            rusqlite::params![kl_id],
            |row| row.get(0),
        )
        .ok()
    } else {
        None
    };

    if let Some(eid) = existing_id {
        doc.id = eid;
    } else if doc.id.is_empty() {
        doc.id = Uuid::new_v4().to_string();
    }

    conn.execute(
        "INSERT OR REPLACE INTO documents
            (id, source, file_path, keep_local_id, title, author, url,
             word_count, last_opened_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            doc.id,
            doc.source,
            doc.file_path,
            doc.keep_local_id,
            doc.title,
            doc.author,
            doc.url,
            doc.word_count,
            doc.last_opened_at,
            doc.created_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(doc)
}
