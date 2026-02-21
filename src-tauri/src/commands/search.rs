use crate::db::migrations::get_db;
use std::process::Command;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub document_id: String,
    pub title: String,
    pub snippet: String,
    pub rank: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResult {
    pub path: String,
    pub filename: String,
}

/// Search all .md files on the machine using macOS Spotlight (mdfind).
/// Matches filename OR content.
#[tauri::command]
pub fn search_files_on_disk(query: String, limit: Option<usize>) -> Result<Vec<FileSearchResult>, String> {
    let limit = limit.unwrap_or(20);

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    // mdfind query: markdown files where name or content matches
    let mdfind_query = format!(
        "(kMDItemFSName == '*.md' || kMDItemFSName == '*.markdown') && (kMDItemDisplayName == '*{}*'cdw || kMDItemTextContent == '*{}*'cdw)",
        query, query
    );

    let output = Command::new("mdfind")
        .arg(&mdfind_query)
        .output()
        .map_err(|e| format!("Failed to run mdfind: {e}"))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let results: Vec<FileSearchResult> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        // Skip hidden directories (e.g. .git, node_modules is not hidden but skip .dirs)
        .filter(|line| !line.split('/').any(|seg| seg.starts_with('.') && seg.len() > 1))
        .take(limit)
        .map(|line| {
            let path = line.to_string();
            let filename = std::path::Path::new(&path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());
            FileSearchResult { path, filename }
        })
        .collect();

    Ok(results)
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
