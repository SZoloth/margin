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
    if doc.id.is_empty() {
        doc.id = Uuid::new_v4().to_string();
    }

    let conn = get_db()?;

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
