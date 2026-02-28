use crate::db::migrations::DbPool;
use crate::db::models::{Highlight, MarginNote};
use rusqlite::Connection;
use std::time::SystemTime;
use uuid::Uuid;

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn touch_document(conn: &Connection, document_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE documents SET last_opened_at = ?1 WHERE id = ?2",
        rusqlite::params![now_millis(), document_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn document_id_for_highlight(conn: &Connection, highlight_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT document_id FROM highlights WHERE id = ?1",
        rusqlite::params![highlight_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

fn document_id_for_margin_note(conn: &Connection, note_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT h.document_id FROM margin_notes mn JOIN highlights h ON mn.highlight_id = h.id WHERE mn.id = ?1",
        rusqlite::params![note_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// === Inner functions (testable with &Connection) ===

fn insert_highlight(
    conn: &Connection,
    id: &str,
    document_id: &str,
    color: &str,
    text_content: &str,
    from_pos: i64,
    to_pos: i64,
    prefix_context: Option<&str>,
    suffix_context: Option<&str>,
    now: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO highlights
            (id, document_id, color, text_content, from_pos, to_pos,
             prefix_context, suffix_context, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![id, document_id, color, text_content, from_pos, to_pos, prefix_context, suffix_context, now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn fetch_highlights(conn: &Connection, document_id: &str) -> Result<Vec<Highlight>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, color, text_content, from_pos, to_pos,
                    prefix_context, suffix_context, created_at, updated_at
             FROM highlights
             WHERE document_id = ?1
             ORDER BY from_pos",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map([document_id], |row| Highlight::from_row(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    results
}

fn set_highlight_color(conn: &Connection, id: &str, color: &str, now: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE highlights SET color = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![color, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_highlight(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM highlights WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn insert_margin_note(
    conn: &Connection,
    id: &str,
    highlight_id: &str,
    content: &str,
    now: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO margin_notes (id, highlight_id, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, highlight_id, content, now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn fetch_margin_notes(conn: &Connection, document_id: &str) -> Result<Vec<MarginNote>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT mn.id, mn.highlight_id, mn.content, mn.created_at, mn.updated_at
             FROM margin_notes mn
             JOIN highlights h ON mn.highlight_id = h.id
             WHERE h.document_id = ?1
             ORDER BY h.from_pos",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map([document_id], |row| MarginNote::from_row(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string());
    results
}

fn set_margin_note_content(conn: &Connection, id: &str, content: &str, now: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE margin_notes SET content = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![content, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_margin_note(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM margin_notes WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_all_highlights_for_document(conn: &Connection, document_id: &str) -> Result<usize, String> {
    conn.execute(
        "DELETE FROM highlights WHERE document_id = ?1",
        rusqlite::params![document_id],
    )
    .map_err(|e| e.to_string())
}

// === Tauri command handlers ===

#[tauri::command]
pub async fn create_highlight(
    state: tauri::State<'_, DbPool>,
    document_id: String,
    color: String,
    text_content: String,
    from_pos: i64,
    to_pos: i64,
    prefix_context: Option<String>,
    suffix_context: Option<String>,
) -> Result<Highlight, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let id = Uuid::new_v4().to_string();
    let now = now_millis();

    insert_highlight(
        &conn, &id, &document_id, &color, &text_content,
        from_pos, to_pos,
        prefix_context.as_deref(), suffix_context.as_deref(),
        now,
    )?;

    touch_document(&conn, &document_id)?;

    Ok(Highlight {
        id,
        document_id,
        color,
        text_content,
        from_pos,
        to_pos,
        prefix_context,
        suffix_context,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_highlights(state: tauri::State<'_, DbPool>, document_id: String) -> Result<Vec<Highlight>, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    fetch_highlights(&conn, &document_id)
}

#[tauri::command]
pub async fn update_highlight_color(state: tauri::State<'_, DbPool>, id: String, color: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let now = now_millis();

    set_highlight_color(&conn, &id, &color, now)?;

    let doc_id = document_id_for_highlight(&conn, &id)?;
    touch_document(&conn, &doc_id)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_highlight(state: tauri::State<'_, DbPool>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());

    let doc_id = document_id_for_highlight(&conn, &id)?;
    remove_highlight(&conn, &id)?;
    touch_document(&conn, &doc_id)?;

    Ok(())
}

#[tauri::command]
pub async fn create_margin_note(
    state: tauri::State<'_, DbPool>,
    highlight_id: String,
    content: String,
) -> Result<MarginNote, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let id = Uuid::new_v4().to_string();
    let now = now_millis();

    insert_margin_note(&conn, &id, &highlight_id, &content, now)?;

    let doc_id = document_id_for_highlight(&conn, &highlight_id)?;
    touch_document(&conn, &doc_id)?;

    Ok(MarginNote {
        id,
        highlight_id,
        content,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_margin_notes(state: tauri::State<'_, DbPool>, document_id: String) -> Result<Vec<MarginNote>, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    fetch_margin_notes(&conn, &document_id)
}

#[tauri::command]
pub async fn update_margin_note(state: tauri::State<'_, DbPool>, id: String, content: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let now = now_millis();

    let doc_id = document_id_for_margin_note(&conn, &id)?;
    set_margin_note_content(&conn, &id, &content, now)?;
    touch_document(&conn, &doc_id)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_margin_note(state: tauri::State<'_, DbPool>, id: String) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());

    let doc_id = document_id_for_margin_note(&conn, &id)?;
    remove_margin_note(&conn, &id)?;
    touch_document(&conn, &doc_id)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_all_highlights_for_document(
    state: tauri::State<'_, DbPool>,
    document_id: String,
) -> Result<usize, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    remove_all_highlights_for_document(&conn, &document_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schema_sql() -> &'static str {
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
         CREATE TABLE highlights (
             id TEXT PRIMARY KEY,
             document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
             color TEXT NOT NULL DEFAULT 'yellow',
             text_content TEXT NOT NULL,
             from_pos INTEGER NOT NULL,
             to_pos INTEGER NOT NULL,
             prefix_context TEXT,
             suffix_context TEXT,
             created_at INTEGER NOT NULL,
             updated_at INTEGER NOT NULL
         );
         CREATE INDEX idx_highlights_document ON highlights(document_id);
         CREATE TABLE margin_notes (
             id TEXT PRIMARY KEY,
             highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
             content TEXT NOT NULL,
             created_at INTEGER NOT NULL,
             updated_at INTEGER NOT NULL
         );
         CREATE INDEX idx_margin_notes_highlight ON margin_notes(highlight_id);"
    }

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(schema_sql()).unwrap();
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

    fn highlight_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM highlights", [], |r| r.get(0)).unwrap()
    }

    fn note_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM margin_notes", [], |r| r.get(0)).unwrap()
    }

    // === Highlight tests ===

    #[test]
    fn insert_and_fetch_highlights() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        insert_highlight(&conn, "h1", "doc1", "yellow", "hello world", 0, 11, Some("pre"), Some("suf"), 1000).unwrap();
        insert_highlight(&conn, "h2", "doc1", "green", "second", 20, 26, None, None, 1001).unwrap();

        let highlights = fetch_highlights(&conn, "doc1").unwrap();
        assert_eq!(highlights.len(), 2);
        assert_eq!(highlights[0].id, "h1");
        assert_eq!(highlights[0].text_content, "hello world");
        assert_eq!(highlights[0].prefix_context.as_deref(), Some("pre"));
        assert_eq!(highlights[1].id, "h2");
        assert_eq!(highlights[1].color, "green");
    }

    #[test]
    fn fetch_highlights_ordered_by_from_pos() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        // Insert out of order
        insert_highlight(&conn, "h2", "doc1", "yellow", "later", 50, 55, None, None, 1000).unwrap();
        insert_highlight(&conn, "h1", "doc1", "yellow", "earlier", 10, 17, None, None, 1001).unwrap();

        let highlights = fetch_highlights(&conn, "doc1").unwrap();
        assert_eq!(highlights[0].from_pos, 10);
        assert_eq!(highlights[1].from_pos, 50);
    }

    #[test]
    fn fetch_highlights_scoped_to_document() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_doc(&conn, "doc2");

        insert_highlight(&conn, "h1", "doc1", "yellow", "in doc1", 0, 7, None, None, 1000).unwrap();
        insert_highlight(&conn, "h2", "doc2", "yellow", "in doc2", 0, 7, None, None, 1000).unwrap();

        let highlights = fetch_highlights(&conn, "doc1").unwrap();
        assert_eq!(highlights.len(), 1);
        assert_eq!(highlights[0].document_id, "doc1");
    }

    #[test]
    fn update_highlight_color_changes_color_and_timestamp() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();

        set_highlight_color(&conn, "h1", "green", 2000).unwrap();

        let highlights = fetch_highlights(&conn, "doc1").unwrap();
        assert_eq!(highlights[0].color, "green");
        assert_eq!(highlights[0].updated_at, 2000);
        assert_eq!(highlights[0].created_at, 1000); // unchanged
    }

    #[test]
    fn delete_highlight_removes_it() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();
        assert_eq!(highlight_count(&conn), 1);

        remove_highlight(&conn, "h1").unwrap();
        assert_eq!(highlight_count(&conn), 0);
    }

    #[test]
    fn delete_highlight_cascades_to_margin_notes() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();
        insert_margin_note(&conn, "n1", "h1", "my note", 1000).unwrap();
        assert_eq!(note_count(&conn), 1);

        remove_highlight(&conn, "h1").unwrap();
        assert_eq!(note_count(&conn), 0); // cascade
    }

    #[test]
    fn delete_document_cascades_to_highlights_and_notes() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();
        insert_margin_note(&conn, "n1", "h1", "my note", 1000).unwrap();

        conn.execute("DELETE FROM documents WHERE id = 'doc1'", []).unwrap();
        assert_eq!(highlight_count(&conn), 0);
        assert_eq!(note_count(&conn), 0);
    }

    // === Margin Note tests ===

    #[test]
    fn insert_and_fetch_margin_notes() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();

        insert_margin_note(&conn, "n1", "h1", "first note", 1000).unwrap();
        insert_margin_note(&conn, "n2", "h1", "second note", 1001).unwrap();

        let notes = fetch_margin_notes(&conn, "doc1").unwrap();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].content, "first note");
        assert_eq!(notes[0].highlight_id, "h1");
    }

    #[test]
    fn fetch_margin_notes_ordered_by_highlight_position() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h2", "doc1", "yellow", "later", 50, 55, None, None, 1000).unwrap();
        insert_highlight(&conn, "h1", "doc1", "yellow", "earlier", 10, 17, None, None, 1000).unwrap();

        insert_margin_note(&conn, "n2", "h2", "note on later", 1000).unwrap();
        insert_margin_note(&conn, "n1", "h1", "note on earlier", 1001).unwrap();

        let notes = fetch_margin_notes(&conn, "doc1").unwrap();
        assert_eq!(notes[0].content, "note on earlier");
        assert_eq!(notes[1].content, "note on later");
    }

    #[test]
    fn update_margin_note_changes_content_and_timestamp() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();
        insert_margin_note(&conn, "n1", "h1", "original", 1000).unwrap();

        set_margin_note_content(&conn, "n1", "updated", 2000).unwrap();

        let notes = fetch_margin_notes(&conn, "doc1").unwrap();
        assert_eq!(notes[0].content, "updated");
        assert_eq!(notes[0].updated_at, 2000);
        assert_eq!(notes[0].created_at, 1000);
    }

    #[test]
    fn delete_margin_note_removes_it() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();
        insert_margin_note(&conn, "n1", "h1", "note", 1000).unwrap();
        assert_eq!(note_count(&conn), 1);

        remove_margin_note(&conn, "n1").unwrap();
        assert_eq!(note_count(&conn), 0);
    }

    #[test]
    fn document_id_for_highlight_returns_correct_doc() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();

        assert_eq!(document_id_for_highlight(&conn, "h1").unwrap(), "doc1");
    }

    #[test]
    fn document_id_for_margin_note_returns_correct_doc() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_highlight(&conn, "h1", "doc1", "yellow", "text", 0, 4, None, None, 1000).unwrap();
        insert_margin_note(&conn, "n1", "h1", "note", 1000).unwrap();

        assert_eq!(document_id_for_margin_note(&conn, "n1").unwrap(), "doc1");
    }

    #[test]
    fn empty_document_returns_no_highlights() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        let highlights = fetch_highlights(&conn, "doc1").unwrap();
        assert!(highlights.is_empty());
    }

    #[test]
    fn empty_document_returns_no_margin_notes() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        let notes = fetch_margin_notes(&conn, "doc1").unwrap();
        assert!(notes.is_empty());
    }

    // === Batch delete tests ===

    #[test]
    fn remove_all_highlights_for_document_clears_all() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_doc(&conn, "doc2");

        // doc1: 2 highlights, 1 with a note
        insert_highlight(&conn, "h1", "doc1", "yellow", "text1", 0, 5, None, None, 1000).unwrap();
        insert_highlight(&conn, "h2", "doc1", "green", "text2", 10, 15, None, None, 1000).unwrap();
        insert_margin_note(&conn, "n1", "h1", "note on h1", 1000).unwrap();

        // doc2: 1 highlight with a note (should be untouched)
        insert_highlight(&conn, "h3", "doc2", "blue", "text3", 0, 5, None, None, 1000).unwrap();
        insert_margin_note(&conn, "n2", "h3", "note on h3", 1000).unwrap();

        let deleted = remove_all_highlights_for_document(&conn, "doc1").unwrap();
        assert_eq!(deleted, 2);

        // doc1 is empty
        assert!(fetch_highlights(&conn, "doc1").unwrap().is_empty());
        assert!(fetch_margin_notes(&conn, "doc1").unwrap().is_empty());

        // doc2 untouched
        assert_eq!(fetch_highlights(&conn, "doc2").unwrap().len(), 1);
        assert_eq!(fetch_margin_notes(&conn, "doc2").unwrap().len(), 1);
    }

    #[test]
    fn remove_all_highlights_for_document_empty_is_noop() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        let deleted = remove_all_highlights_for_document(&conn, "doc1").unwrap();
        assert_eq!(deleted, 0);
    }
}

