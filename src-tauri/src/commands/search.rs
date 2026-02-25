use crate::db::migrations::get_db;
use rusqlite::Connection;
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

fn ensure_fts_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, content, document_id UNINDEXED);",
    )
    .map_err(|e| format!("Failed to create FTS table: {e}"))
}

// === Inner functions (testable with &Connection) ===

fn index_document_inner(conn: &Connection, document_id: &str, title: &str, content: &str) -> Result<(), String> {
    ensure_fts_table(conn)?;

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

fn search_documents_inner(conn: &Connection, query: &str, limit: i32) -> Result<Vec<SearchResult>, String> {
    ensure_fts_table(conn)?;

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
        .map_err(|e| format!("Failed to collect search results: {e}"));
    results
}

fn remove_document_index_inner(conn: &Connection, document_id: &str) -> Result<(), String> {
    ensure_fts_table(conn)?;

    conn.execute(
        "DELETE FROM documents_fts WHERE document_id = ?1",
        rusqlite::params![document_id],
    )
    .map_err(|e| format!("Failed to remove document from index: {e}"))?;

    Ok(())
}

// === Tauri command handlers ===

#[tauri::command]
pub fn index_document(document_id: String, title: String, content: String) -> Result<(), String> {
    let conn = get_db()?;
    index_document_inner(&conn, &document_id, &title, &content)
}

#[tauri::command]
pub fn search_documents(query: String, limit: Option<i32>) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let conn = get_db()?;
    search_documents_inner(&conn, &query, limit.unwrap_or(20))
}

#[tauri::command]
pub fn remove_document_index(document_id: String) -> Result<(), String> {
    let conn = get_db()?;
    remove_document_index_inner(&conn, &document_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        ensure_fts_table(&conn).unwrap();
        conn
    }

    #[test]
    fn index_and_search_document() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Rust Programming", "Learn systems programming with Rust").unwrap();

        let results = search_documents_inner(&conn, "Rust", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].document_id, "d1");
        assert_eq!(results[0].title, "Rust Programming");
    }

    #[test]
    fn search_matches_content() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Title", "The quick brown fox jumps over the lazy dog").unwrap();

        let results = search_documents_inner(&conn, "fox", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].snippet.contains("fox"));
    }

    #[test]
    fn search_no_results_for_missing_term() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Title", "Some content here").unwrap();

        let results = search_documents_inner(&conn, "nonexistent", 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn search_respects_limit() {
        let conn = setup_db();
        for i in 0..5 {
            index_document_inner(&conn, &format!("d{i}"), &format!("Rust Doc {i}"), "Rust content").unwrap();
        }

        let results = search_documents_inner(&conn, "Rust", 2).unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn reindex_replaces_old_content() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Old Title", "old content about cats").unwrap();
        index_document_inner(&conn, "d1", "New Title", "new content about dogs").unwrap();

        // Old content should not match
        let results = search_documents_inner(&conn, "cats", 10).unwrap();
        assert!(results.is_empty());

        // New content should match
        let results = search_documents_inner(&conn, "dogs", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "New Title");
    }

    #[test]
    fn remove_document_index_removes_from_search() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Title", "searchable content").unwrap();

        remove_document_index_inner(&conn, "d1").unwrap();

        let results = search_documents_inner(&conn, "searchable", 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn remove_nonexistent_index_is_ok() {
        let conn = setup_db();
        // Should not error
        remove_document_index_inner(&conn, "nonexistent").unwrap();
    }

    #[test]
    fn multiple_documents_searchable() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Rust Guide", "Learn Rust programming").unwrap();
        index_document_inner(&conn, "d2", "Python Guide", "Learn Python programming").unwrap();
        index_document_inner(&conn, "d3", "Cooking", "How to make pasta").unwrap();

        let results = search_documents_inner(&conn, "programming", 10).unwrap();
        assert_eq!(results.len(), 2);

        let results = search_documents_inner(&conn, "pasta", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].document_id, "d3");
    }
}
