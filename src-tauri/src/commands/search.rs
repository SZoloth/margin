use crate::db::migrations::DbPool;
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexAllResult {
    pub indexed: usize,
    pub skipped: usize,
    pub errors: usize,
}

/// Search all .md files on the machine using macOS Spotlight (mdfind).
/// Matches filename OR content.
#[tauri::command]
pub fn search_files_on_disk(query: String, limit: Option<usize>) -> Result<Vec<FileSearchResult>, String> {
    let limit = limit.unwrap_or(20);

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Strip single quotes to prevent mdfind query injection
    let safe_query = query.replace('\'', "");

    // mdfind query: markdown files where name or content matches
    let mdfind_query = format!(
        "(kMDItemFSName == '*.md' || kMDItemFSName == '*.markdown') && (kMDItemDisplayName == '*{}*'cdw || kMDItemTextContent == '*{}*'cdw)",
        safe_query, safe_query
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
        "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
            title, content, document_id UNINDEXED,
            prefix='2,3',
            tokenize='unicode61 remove_diacritics 2'
        );",
    )
    .map_err(|e| format!("Failed to create FTS table: {e}"))
}

/// Sanitize a user query for FTS5: strip operators, escape quotes, append * for prefix matching.
fn sanitize_fts_query(query: &str) -> String {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    // Remove FTS5 operators and special chars
    let cleaned: String = trimmed
        .replace('"', "")
        .replace('\'', "")
        .replace('(', "")
        .replace(')', "")
        .replace('{', "")
        .replace('}', "")
        .replace(':', "")
        .replace('^', "");

    let terms: Vec<String> = cleaned
        .split_whitespace()
        .filter(|word| {
            // Strip FTS5 boolean operators
            let upper = word.to_uppercase();
            upper != "AND" && upper != "OR" && upper != "NOT" && upper != "NEAR"
        })
        .filter(|word| {
            // Skip words that are only special chars
            word.chars().any(|c| c.is_alphanumeric())
        })
        .map(|word| {
            // Strip leading/trailing non-alphanumeric (e.g. "++" → "")
            let cleaned: String = word.chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            if cleaned.is_empty() {
                String::new()
            } else {
                format!("\"{}\"*", cleaned)
            }
        })
        .filter(|s| !s.is_empty())
        .collect();

    terms.join(" ")
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

    let fts_query = sanitize_fts_query(query);
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }

    // Join with documents table for frecency blending.
    // BM25 returns negative scores (more negative = better match).
    // Frecency boost: access_count / (1 + days_old * 0.1) — decays over time.
    // We subtract the frecency boost to make good matches rank even lower (better).
    let mut stmt = conn
        .prepare(
            "SELECT f.document_id, f.title,
                    snippet(documents_fts, 1, '<mark>', '</mark>', '\u{2026}', 32) as snippet,
                    bm25(documents_fts, 10.0, 1.0) as bm25_rank
             FROM documents_fts f
             LEFT JOIN documents d ON d.id = f.document_id
             WHERE documents_fts MATCH ?1
             ORDER BY bm25(documents_fts, 10.0, 1.0)
                      - (COALESCE(d.access_count, 0) * 1.0 /
                         (1.0 + MAX(0, julianday('now') - julianday(datetime(COALESCE(d.last_opened_at, 0) / 1000, 'unixepoch'))) * 0.1))
                      * 0.3
             LIMIT ?2",
        )
        .map_err(|e| format!("Failed to prepare search query: {e}"))?;

    let results = stmt
        .query_map(rusqlite::params![fts_query, limit], |row| {
            Ok(SearchResult {
                document_id: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                rank: row.get::<_, f64>(3)?,
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

fn increment_access_count(conn: &Connection, document_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE documents SET access_count = COALESCE(access_count, 0) + 1 WHERE id = ?1",
        rusqlite::params![document_id],
    )
    .map_err(|e| format!("Failed to increment access count: {e}"))?;
    Ok(())
}

#[cfg(test)]
fn index_all_documents_inner(conn: &Connection) -> Result<IndexAllResult, String> {
    ensure_fts_table(conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, file_path, title, indexed_at FROM documents WHERE file_path IS NOT NULL",
        )
        .map_err(|e| format!("Failed to query documents: {e}"))?;

    let docs: Vec<(String, String, Option<String>, Option<i64>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        })
        .map_err(|e| format!("Failed to read documents: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    let mut indexed = 0;
    let mut skipped = 0;
    let mut errors = 0;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    for (doc_id, file_path, title, indexed_at) in &docs {
        // Check file mtime
        let mtime_ms = match std::fs::metadata(file_path) {
            Ok(meta) => meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0),
            Err(_) => {
                // File doesn't exist or permission error — skip
                skipped += 1;
                continue;
            }
        };

        // Skip if already indexed and file hasn't changed
        if let Some(ia) = indexed_at {
            if mtime_ms <= *ia {
                skipped += 1;
                continue;
            }
        }

        // Read and index
        match std::fs::read_to_string(file_path) {
            Ok(content) => {
                let doc_title = title.as_deref().unwrap_or("Untitled");
                if let Err(e) = index_document_inner(conn, doc_id, doc_title, &content) {
                    eprintln!("index_all: failed to index {file_path}: {e}");
                    errors += 1;
                    continue;
                }
                // Update indexed_at
                let _ = conn.execute(
                    "UPDATE documents SET indexed_at = ?1 WHERE id = ?2",
                    rusqlite::params![now_ms, doc_id],
                );
                indexed += 1;
            }
            Err(e) => {
                eprintln!("index_all: failed to read {file_path}: {e}");
                errors += 1;
            }
        }
    }

    Ok(IndexAllResult {
        indexed,
        skipped,
        errors,
    })
}

// === Tauri command handlers ===

#[tauri::command]
pub fn index_document(state: tauri::State<'_, DbPool>, document_id: String, title: String, content: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    index_document_inner(&conn, &document_id, &title, &content)?;
    // Increment access count for frecency
    let _ = increment_access_count(&conn, &document_id);
    Ok(())
}

#[tauri::command]
pub fn search_documents(state: tauri::State<'_, DbPool>, query: String, limit: Option<i32>) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    search_documents_inner(&conn, &query, limit.unwrap_or(20))
}

#[tauri::command]
pub fn remove_document_index(state: tauri::State<'_, DbPool>, document_id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    remove_document_index_inner(&conn, &document_id)
}

#[tauri::command]
pub fn index_all_documents(state: tauri::State<'_, DbPool>) -> Result<IndexAllResult, String> {
    // Collect document list under lock, then drop lock for file I/O
    let docs: Vec<(String, String, Option<String>, Option<i64>)> = {
        let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
        ensure_fts_table(&conn)?;

        let mut stmt = conn
            .prepare("SELECT id, file_path, title, indexed_at FROM documents WHERE file_path IS NOT NULL")
            .map_err(|e| format!("Failed to query documents: {e}"))?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        })
        .map_err(|e| format!("Failed to read documents: {e}"))?;
        let result: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        result
    }; // lock dropped here

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let mut indexed = 0usize;
    let mut skipped = 0usize;
    let mut errors = 0usize;

    for (doc_id, file_path, title, indexed_at) in &docs {
        // Check file mtime — no lock needed
        let mtime_ms = match std::fs::metadata(file_path) {
            Ok(meta) => meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0),
            Err(_) => {
                skipped += 1;
                continue;
            }
        };

        if let Some(ia) = indexed_at {
            if mtime_ms <= *ia {
                skipped += 1;
                continue;
            }
        }

        // Read file — no lock needed
        let content = match std::fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("index_all: failed to read {file_path}: {e}");
                errors += 1;
                continue;
            }
        };

        // Briefly reacquire lock for DB writes
        let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
        let doc_title = title.as_deref().unwrap_or("Untitled");
        if let Err(e) = index_document_inner(&conn, doc_id, doc_title, &content) {
            eprintln!("index_all: failed to index {file_path}: {e}");
            errors += 1;
            continue;
        }
        let _ = conn.execute(
            "UPDATE documents SET indexed_at = ?1 WHERE id = ?2",
            rusqlite::params![now_ms, doc_id],
        );
        indexed += 1;
    }

    Ok(IndexAllResult { indexed, skipped, errors })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
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
                last_opened_at INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL DEFAULT 0,
                access_count INTEGER DEFAULT 0,
                indexed_at INTEGER,
                UNIQUE(file_path),
                UNIQUE(keep_local_id)
            );",
        ).unwrap();
        ensure_fts_table(&conn).unwrap();
        conn
    }

    // Alias for clarity — same as setup_db now
    fn setup_db_with_documents() -> Connection {
        setup_db()
    }

    // === Basic search tests (existing) ===

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

        let results = search_documents_inner(&conn, "cats", 10).unwrap();
        assert!(results.is_empty());

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

    // === Step 2: FTS5 tuning + prefix matching tests ===

    #[test]
    fn search_prefix_matching() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Programming Guide", "Learn programming with Rust").unwrap();

        let results = search_documents_inner(&conn, "pro", 10).unwrap();
        assert_eq!(results.len(), 1, "prefix 'pro' should match 'programming'");
    }

    #[test]
    fn search_title_ranked_above_body() {
        let conn = setup_db();
        // d1: "Rust" in title only
        index_document_inner(&conn, "d1", "Rust Programming", "A systems language").unwrap();
        // d2: "Rust" in body only
        index_document_inner(&conn, "d2", "Language Guide", "Learn Rust and be happy").unwrap();

        let results = search_documents_inner(&conn, "Rust", 10).unwrap();
        assert_eq!(results.len(), 2);
        // Title match should rank higher (better BM25 with 10x weight)
        assert_eq!(results[0].document_id, "d1", "title match should rank first");
    }

    #[test]
    fn search_unicode_diacritics() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Café Culture", "The best cafés in Paris").unwrap();

        let results = search_documents_inner(&conn, "cafe", 10).unwrap();
        assert!(!results.is_empty(), "'cafe' should match 'café' with diacritics removal");
    }

    #[test]
    fn search_empty_query_returns_empty() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Title", "Content").unwrap();

        let results = search_documents_inner(&conn, "", 10).unwrap();
        assert!(results.is_empty());

        let results = search_documents_inner(&conn, "   ", 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn search_special_chars_dont_crash() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "C++ Guide", "Learn C++ programming").unwrap();

        // These should not crash, even if they return no results
        let _ = search_documents_inner(&conn, "c++", 10);
        let _ = search_documents_inner(&conn, "hello-world", 10);
        let _ = search_documents_inner(&conn, "+++", 10);
        let _ = search_documents_inner(&conn, "---", 10);
        let _ = search_documents_inner(&conn, "\"quoted\"", 10);
        let _ = search_documents_inner(&conn, "OR AND NOT", 10);
    }

    #[test]
    fn search_very_long_content() {
        let conn = setup_db();
        let long_content = "word ".repeat(25_000); // ~125k chars
        index_document_inner(&conn, "d1", "Long Doc", &long_content).unwrap();

        let results = search_documents_inner(&conn, "word", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn search_snippet_contains_match() {
        let conn = setup_db();
        index_document_inner(&conn, "d1", "Title", "The quick brown fox jumps over the lazy dog").unwrap();

        let results = search_documents_inner(&conn, "fox", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].snippet.contains("<mark>"), "snippet should contain <mark> tag");
    }

    // === sanitize_fts_query tests ===

    #[test]
    fn sanitize_appends_star_for_prefix() {
        assert_eq!(sanitize_fts_query("hello"), "\"hello\"*");
    }

    #[test]
    fn sanitize_multi_word() {
        assert_eq!(sanitize_fts_query("hello world"), "\"hello\"* \"world\"*");
    }

    #[test]
    fn sanitize_strips_fts5_operators() {
        let result = sanitize_fts_query("hello OR");
        assert_eq!(result, "\"hello\"*");
    }

    #[test]
    fn sanitize_handles_empty() {
        assert_eq!(sanitize_fts_query(""), "");
        assert_eq!(sanitize_fts_query("   "), "");
    }

    #[test]
    fn sanitize_escapes_double_quotes() {
        let result = sanitize_fts_query("say \"hello\"");
        assert_eq!(result, "\"say\"* \"hello\"*");
    }

    // === Step 3: Frecency tests ===

    #[test]
    fn frecency_recently_opened_ranks_higher() {
        let conn = setup_db_with_documents();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let one_year_ago = now - 365 * 24 * 60 * 60 * 1000;

        // d1: opened recently, access_count=1
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at, access_count)
             VALUES ('d1', 'file', 'Recent Rust', ?1, 1000, 1)",
            [now],
        ).unwrap();

        // d2: opened a year ago, access_count=1
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at, access_count)
             VALUES ('d2', 'file', 'Old Rust', ?1, 1000, 1)",
            [one_year_ago],
        ).unwrap();

        index_document_inner(&conn, "d1", "Recent Rust", "Learn Rust systems").unwrap();
        index_document_inner(&conn, "d2", "Old Rust", "Learn Rust systems").unwrap();

        let results = search_documents_inner(&conn, "Rust", 10).unwrap();
        assert_eq!(results.len(), 2);
        // With frecency boosting, recently opened should rank higher
        assert_eq!(results[0].document_id, "d1");
    }

    #[test]
    fn frecency_frequently_opened_ranks_higher() {
        let conn = setup_db_with_documents();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        // d1: opened frequently (50 times)
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at, access_count)
             VALUES ('d1', 'file', 'Frequent Rust', ?1, 1000, 50)",
            [now],
        ).unwrap();

        // d2: opened once
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at, access_count)
             VALUES ('d2', 'file', 'Rare Rust', ?1, 1000, 1)",
            [now],
        ).unwrap();

        index_document_inner(&conn, "d1", "Frequent Rust", "Learn Rust basics").unwrap();
        index_document_inner(&conn, "d2", "Rare Rust", "Learn Rust basics").unwrap();

        let results = search_documents_inner(&conn, "Rust", 10).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].document_id, "d1");
    }

    #[test]
    fn frecency_score_decays_over_time() {
        let conn = setup_db_with_documents();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let two_years_ago = now - 2 * 365 * 24 * 60 * 60 * 1000;

        // d1: recent with low access count
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at, access_count)
             VALUES ('d1', 'file', 'New Rust', ?1, 1000, 3)",
            [now],
        ).unwrap();

        // d2: stale but high access count from 2 years ago
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at, access_count)
             VALUES ('d2', 'file', 'Stale Rust', ?1, 1000, 100)",
            [two_years_ago],
        ).unwrap();

        index_document_inner(&conn, "d1", "New Rust", "Learn Rust now").unwrap();
        index_document_inner(&conn, "d2", "Stale Rust", "Learn Rust now").unwrap();

        let results = search_documents_inner(&conn, "Rust", 10).unwrap();
        assert_eq!(results.len(), 2);
        // Recent doc should rank higher despite lower access count (decay suppresses stale)
        assert_eq!(results[0].document_id, "d1");
    }

    // === Step 5: Background indexing tests ===

    #[test]
    fn index_all_indexes_new_documents() {
        let conn = setup_db_with_documents();
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        std::fs::write(&file_path, "# Hello World\nSome content about Rust").unwrap();

        conn.execute(
            "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at)
             VALUES ('d1', 'file', ?1, 'Hello World', 1000, 1000)",
            [file_path.to_str().unwrap()],
        ).unwrap();

        let result = index_all_documents_inner(&conn).unwrap();
        assert_eq!(result.indexed, 1);
        assert_eq!(result.skipped, 0);
        assert_eq!(result.errors, 0);

        // Verify it's searchable
        let results = search_documents_inner(&conn, "Rust", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn index_all_skips_already_indexed() {
        let conn = setup_db_with_documents();
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        std::fs::write(&file_path, "Some content").unwrap();

        // Set indexed_at to far in the future so mtime < indexed_at
        conn.execute(
            "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at, indexed_at)
             VALUES ('d1', 'file', ?1, 'Test', 1000, 1000, 9999999999999)",
            [file_path.to_str().unwrap()],
        ).unwrap();

        let result = index_all_documents_inner(&conn).unwrap();
        assert_eq!(result.indexed, 0);
        assert_eq!(result.skipped, 1);
    }

    #[test]
    fn index_all_handles_missing_files() {
        let conn = setup_db_with_documents();

        conn.execute(
            "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at)
             VALUES ('d1', 'file', '/nonexistent/path/doc.md', 'Missing', 1000, 1000)",
            [],
        ).unwrap();

        let result = index_all_documents_inner(&conn).unwrap();
        assert_eq!(result.indexed, 0);
        assert_eq!(result.skipped, 1);
        assert_eq!(result.errors, 0);
    }

    #[test]
    fn index_all_updates_changed_documents() {
        let conn = setup_db_with_documents();
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        std::fs::write(&file_path, "Original content").unwrap();

        conn.execute(
            "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at, indexed_at)
             VALUES ('d1', 'file', ?1, 'Test', 1000, 1000, 0)",
            [file_path.to_str().unwrap()],
        ).unwrap();

        // Index initially
        let result = index_all_documents_inner(&conn).unwrap();
        assert_eq!(result.indexed, 1);

        // Update the file (mtime will be newer than indexed_at which we set to 0)
        std::fs::write(&file_path, "Updated content about Python").unwrap();

        // Set indexed_at to 0 so the mtime check triggers re-index
        conn.execute("UPDATE documents SET indexed_at = 0 WHERE id = 'd1'", []).unwrap();

        let result = index_all_documents_inner(&conn).unwrap();
        assert_eq!(result.indexed, 1);

        let results = search_documents_inner(&conn, "Python", 10).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn index_all_returns_count() {
        let conn = setup_db_with_documents();
        let dir = tempfile::tempdir().unwrap();

        for i in 0..3 {
            let file_path = dir.path().join(format!("doc{i}.md"));
            std::fs::write(&file_path, format!("Content {i}")).unwrap();
            conn.execute(
                "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at)
                 VALUES (?1, 'file', ?2, ?3, 1000, 1000)",
                rusqlite::params![format!("d{i}"), file_path.to_str().unwrap(), format!("Doc {i}")],
            ).unwrap();
        }

        let result = index_all_documents_inner(&conn).unwrap();
        assert_eq!(result.indexed, 3);
    }

    // === Increment access count test ===

    #[test]
    fn increment_access_count_works() {
        let conn = setup_db_with_documents();
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at, access_count)
             VALUES ('d1', 'file', 'Test', 1000, 1000, 0)",
            [],
        ).unwrap();

        increment_access_count(&conn, "d1").unwrap();
        increment_access_count(&conn, "d1").unwrap();

        let count: i64 = conn.query_row(
            "SELECT access_count FROM documents WHERE id = 'd1'",
            [],
            |r| r.get(0),
        ).unwrap();
        assert_eq!(count, 2);
    }
}
