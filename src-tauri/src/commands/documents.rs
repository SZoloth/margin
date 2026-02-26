use crate::db::migrations::DbPool;
use crate::db::models::Document;
use rusqlite::Connection;
use uuid::Uuid;

// === Inner functions (testable with &Connection) ===

fn fetch_recent_documents(conn: &Connection, limit: i64) -> Result<Vec<Document>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, source, file_path, keep_local_id, title, author, url,
                    word_count, last_opened_at, created_at
             FROM documents
             ORDER BY last_opened_at DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map([limit], |row| Document::from_row(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    results
}

fn upsert_document_inner(conn: &Connection, mut doc: Document) -> Result<Document, String> {
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
        "INSERT INTO documents
            (id, source, file_path, keep_local_id, title, author, url,
             word_count, last_opened_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
            source = excluded.source,
            file_path = excluded.file_path,
            keep_local_id = excluded.keep_local_id,
            title = excluded.title,
            author = excluded.author,
            url = excluded.url,
            word_count = excluded.word_count,
            last_opened_at = excluded.last_opened_at,
            created_at = excluded.created_at",
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

// === Tauri command handlers ===

#[tauri::command]
pub async fn get_recent_documents(state: tauri::State<'_, DbPool>, limit: Option<i64>) -> Result<Vec<Document>, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    fetch_recent_documents(&conn, limit.unwrap_or(20))
}

#[tauri::command]
pub async fn upsert_document(state: tauri::State<'_, DbPool>, doc: Document) -> Result<Document, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    upsert_document_inner(&conn, doc)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schema_sql() -> &'static str {
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
         );"
    }

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(schema_sql()).unwrap();
        conn
    }

    fn make_doc(id: &str, source: &str, file_path: Option<&str>, keep_local_id: Option<&str>, last_opened_at: i64) -> Document {
        Document {
            id: id.to_string(),
            source: source.to_string(),
            file_path: file_path.map(String::from),
            keep_local_id: keep_local_id.map(String::from),
            title: Some("Test".to_string()),
            author: None,
            url: None,
            word_count: 100,
            last_opened_at,
            created_at: 1000,
        }
    }

    #[test]
    fn upsert_inserts_new_document() {
        let conn = setup_db();
        let doc = make_doc("d1", "file", Some("/test.md"), None, 1000);
        let result = upsert_document_inner(&conn, doc).unwrap();
        assert_eq!(result.id, "d1");

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn upsert_generates_id_when_empty() {
        let conn = setup_db();
        let doc = make_doc("", "file", Some("/test.md"), None, 1000);
        let result = upsert_document_inner(&conn, doc).unwrap();
        assert!(!result.id.is_empty());
    }

    #[test]
    fn upsert_reuses_id_for_existing_file_path() {
        let conn = setup_db();
        let doc1 = make_doc("original-id", "file", Some("/test.md"), None, 1000);
        upsert_document_inner(&conn, doc1).unwrap();

        // Upsert with different id but same file_path should reuse original id
        let doc2 = make_doc("new-id", "file", Some("/test.md"), None, 2000);
        let result = upsert_document_inner(&conn, doc2).unwrap();
        assert_eq!(result.id, "original-id");

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn upsert_reuses_id_for_existing_keep_local_id() {
        let conn = setup_db();
        let doc1 = make_doc("original-id", "keep-local", None, Some("kl-123"), 1000);
        upsert_document_inner(&conn, doc1).unwrap();

        let doc2 = make_doc("new-id", "keep-local", None, Some("kl-123"), 2000);
        let result = upsert_document_inner(&conn, doc2).unwrap();
        assert_eq!(result.id, "original-id");
    }

    #[test]
    fn upsert_updates_fields_on_conflict() {
        let conn = setup_db();
        let doc1 = make_doc("d1", "file", Some("/test.md"), None, 1000);
        upsert_document_inner(&conn, doc1).unwrap();

        let mut doc2 = make_doc("d1", "file", Some("/test.md"), None, 2000);
        doc2.title = Some("Updated Title".to_string());
        doc2.word_count = 500;
        upsert_document_inner(&conn, doc2).unwrap();

        let title: String = conn.query_row(
            "SELECT title FROM documents WHERE id = 'd1'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(title, "Updated Title");

        let wc: i64 = conn.query_row(
            "SELECT word_count FROM documents WHERE id = 'd1'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(wc, 500);
    }

    #[test]
    fn fetch_recent_documents_ordered_by_last_opened() {
        let conn = setup_db();
        upsert_document_inner(&conn, make_doc("d1", "file", Some("/a.md"), None, 1000)).unwrap();
        upsert_document_inner(&conn, make_doc("d2", "file", Some("/b.md"), None, 3000)).unwrap();
        upsert_document_inner(&conn, make_doc("d3", "file", Some("/c.md"), None, 2000)).unwrap();

        let docs = fetch_recent_documents(&conn, 10).unwrap();
        assert_eq!(docs.len(), 3);
        assert_eq!(docs[0].id, "d2"); // most recent
        assert_eq!(docs[1].id, "d3");
        assert_eq!(docs[2].id, "d1"); // oldest
    }

    #[test]
    fn fetch_recent_documents_respects_limit() {
        let conn = setup_db();
        for i in 0..5 {
            upsert_document_inner(
                &conn,
                make_doc(&format!("d{i}"), "file", Some(&format!("/{i}.md")), None, i as i64),
            ).unwrap();
        }

        let docs = fetch_recent_documents(&conn, 2).unwrap();
        assert_eq!(docs.len(), 2);
    }

    #[test]
    fn fetch_recent_documents_empty_table() {
        let conn = setup_db();
        let docs = fetch_recent_documents(&conn, 10).unwrap();
        assert!(docs.is_empty());
    }
}
