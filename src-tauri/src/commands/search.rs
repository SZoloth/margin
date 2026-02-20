use crate::db::migrations::get_db;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
    pub rank: f64,
}

fn ensure_fts_table(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, content, document_id UNINDEXED);",
    )
    .map_err(|e| format!("Failed to create FTS table: {e}"))
}

#[tauri::command]
pub fn index_document(document_id: String, title: String, content: String) -> Result<(), String> {
    let conn = get_db()?;
    ensure_fts_table(&conn)?;

    // Delete existing entry first, then insert
    conn.execute(
        "DELETE FROM documents_fts WHERE document_id = ?1",
        rusqlite::params![document_id],
    )
    .map_err(|e| format!("Failed to delete existing FTS entry: {e}"))?;

    conn.execute(
        "INSERT INTO documents_fts (document_id, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![document_id, title, content],
    )
    .map_err(|e| format!("Failed to index document: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn search_documents(query: String, limit: Option<i32>) -> Result<Vec<SearchResult>, String> {
    let conn = get_db()?;
    ensure_fts_table(&conn)?;

    let limit = limit.unwrap_or(20);

    let mut stmt = conn
        .prepare(
            "SELECT document_id, title,
                    snippet(documents_fts, 1, '<mark>', '</mark>', '\u{2026}', 32) as snippet,
                    rank
             FROM documents_fts
             WHERE documents_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(|e| format!("Failed to prepare search query: {e}"))?;

    let results = stmt
        .query_map(rusqlite::params![query, limit], |row| {
            Ok(SearchResult {
                document_id: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                rank: row.get(3)?,
            })
        })
        .map_err(|e| format!("Search query failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect search results: {e}"))?;

    Ok(results)
}

#[tauri::command]
pub fn remove_document_index(document_id: String) -> Result<(), String> {
    let conn = get_db()?;
    ensure_fts_table(&conn)?;

    conn.execute(
        "DELETE FROM documents_fts WHERE document_id = ?1",
        rusqlite::params![document_id],
    )
    .map_err(|e| format!("Failed to remove document from index: {e}"))?;

    Ok(())
}
