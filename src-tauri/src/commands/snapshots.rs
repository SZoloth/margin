use crate::db::migrations::DbPool;
use rusqlite::Connection;
use std::time::SystemTime;
use uuid::Uuid;

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

// === Inner functions (testable with &Connection) ===

pub fn save_snapshot_inner(
    conn: &Connection,
    document_id: &str,
    content: &str,
    snapshot_type: &str,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = now_millis();
    conn.execute(
        "INSERT INTO content_snapshots (id, document_id, content, snapshot_type, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(document_id, snapshot_type) DO UPDATE SET
            content = excluded.content,
            created_at = excluded.created_at",
        rusqlite::params![id, document_id, content, snapshot_type, now],
    )
    .map_err(|e| e.to_string())?;

    // Return the actual ID (could be the existing one on conflict)
    let actual_id: String = conn
        .query_row(
            "SELECT id FROM content_snapshots WHERE document_id = ?1 AND snapshot_type = ?2",
            rusqlite::params![document_id, snapshot_type],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(actual_id)
}

pub fn get_snapshot_inner(
    conn: &Connection,
    document_id: &str,
    snapshot_type: &str,
) -> Result<Option<String>, String> {
    let result = conn.query_row(
        "SELECT content FROM content_snapshots WHERE document_id = ?1 AND snapshot_type = ?2",
        rusqlite::params![document_id, snapshot_type],
        |row| row.get(0),
    );
    match result {
        Ok(content) => Ok(Some(content)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_snapshot_inner(
    conn: &Connection,
    document_id: &str,
    snapshot_type: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM content_snapshots WHERE document_id = ?1 AND snapshot_type = ?2",
        rusqlite::params![document_id, snapshot_type],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// === Tauri command handlers ===

#[tauri::command]
pub async fn save_content_snapshot(
    state: tauri::State<'_, DbPool>,
    document_id: String,
    content: String,
    snapshot_type: String,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    save_snapshot_inner(&conn, &document_id, &content, &snapshot_type)
}

#[tauri::command]
pub async fn get_content_snapshot(
    state: tauri::State<'_, DbPool>,
    document_id: String,
    snapshot_type: String,
) -> Result<Option<String>, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    get_snapshot_inner(&conn, &document_id, &snapshot_type)
}

#[tauri::command]
pub async fn delete_content_snapshot(
    state: tauri::State<'_, DbPool>,
    document_id: String,
    snapshot_type: String,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    delete_snapshot_inner(&conn, &document_id, &snapshot_type)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE documents (
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
             );
             CREATE TABLE content_snapshots (
                 id TEXT PRIMARY KEY,
                 document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                 content TEXT NOT NULL,
                 snapshot_type TEXT NOT NULL DEFAULT 'pre_external_edit'
                     CHECK(snapshot_type IN ('pre_external_edit', 'manual')),
                 created_at INTEGER NOT NULL,
                 UNIQUE(document_id, snapshot_type)
             );
             CREATE INDEX idx_snapshots_document ON content_snapshots(document_id);",
        )
        .unwrap();
        conn
    }

    fn insert_doc(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at)
             VALUES (?1, 'file', 'Test Doc', 1000, 1000)",
            rusqlite::params![id],
        )
        .unwrap();
    }

    #[test]
    fn test_save_snapshot_creates_record() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        let id = save_snapshot_inner(&conn, "doc1", "hello world", "pre_external_edit").unwrap();
        assert!(!id.is_empty());

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM content_snapshots", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_save_snapshot_upserts_on_same_doc() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        save_snapshot_inner(&conn, "doc1", "version 1", "pre_external_edit").unwrap();
        save_snapshot_inner(&conn, "doc1", "version 2", "pre_external_edit").unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM content_snapshots", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);

        let content = get_snapshot_inner(&conn, "doc1", "pre_external_edit")
            .unwrap()
            .unwrap();
        assert_eq!(content, "version 2");
    }

    #[test]
    fn test_get_snapshot_returns_content() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        save_snapshot_inner(&conn, "doc1", "saved content", "manual").unwrap();

        let content = get_snapshot_inner(&conn, "doc1", "manual").unwrap().unwrap();
        assert_eq!(content, "saved content");
    }

    #[test]
    fn test_get_snapshot_returns_none_when_missing() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        let result = get_snapshot_inner(&conn, "doc1", "pre_external_edit").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_delete_snapshot_removes_record() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        save_snapshot_inner(&conn, "doc1", "content", "pre_external_edit").unwrap();
        delete_snapshot_inner(&conn, "doc1", "pre_external_edit").unwrap();

        let result = get_snapshot_inner(&conn, "doc1", "pre_external_edit").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_cascade_delete_on_document_removal() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        save_snapshot_inner(&conn, "doc1", "content", "pre_external_edit").unwrap();
        save_snapshot_inner(&conn, "doc1", "manual content", "manual").unwrap();

        conn.execute("DELETE FROM documents WHERE id = 'doc1'", [])
            .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM content_snapshots", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
