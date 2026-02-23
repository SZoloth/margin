use crate::db::migrations::get_db;
use crate::db::models::{Highlight, MarginNote};
use std::time::SystemTime;
use uuid::Uuid;

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn touch_document(conn: &rusqlite::Connection, document_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE documents SET last_opened_at = ?1 WHERE id = ?2",
        rusqlite::params![now_millis(), document_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn document_id_for_highlight(conn: &rusqlite::Connection, highlight_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT document_id FROM highlights WHERE id = ?1",
        rusqlite::params![highlight_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

fn document_id_for_margin_note(conn: &rusqlite::Connection, note_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT h.document_id FROM margin_notes mn JOIN highlights h ON mn.highlight_id = h.id WHERE mn.id = ?1",
        rusqlite::params![note_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// === Highlights ===

#[tauri::command]
pub async fn create_highlight(
    document_id: String,
    color: String,
    text_content: String,
    from_pos: i64,
    to_pos: i64,
    prefix_context: Option<String>,
    suffix_context: Option<String>,
) -> Result<Highlight, String> {
    let conn = get_db()?;
    let id = Uuid::new_v4().to_string();
    let now = now_millis();

    conn.execute(
        "INSERT INTO highlights
            (id, document_id, color, text_content, from_pos, to_pos,
             prefix_context, suffix_context, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            id,
            document_id,
            color,
            text_content,
            from_pos,
            to_pos,
            prefix_context,
            suffix_context,
            now,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

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
pub async fn get_highlights(document_id: String) -> Result<Vec<Highlight>, String> {
    let conn = get_db()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, color, text_content, from_pos, to_pos,
                    prefix_context, suffix_context, created_at, updated_at
             FROM highlights
             WHERE document_id = ?1
             ORDER BY from_pos",
        )
        .map_err(|e| e.to_string())?;

    let highlights = stmt
        .query_map([&document_id], |row| Highlight::from_row(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(highlights)
}

#[tauri::command]
pub async fn update_highlight_color(id: String, color: String) -> Result<(), String> {
    let conn = get_db()?;
    let now = now_millis();

    conn.execute(
        "UPDATE highlights SET color = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![color, now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_highlight(id: String) -> Result<(), String> {
    let conn = get_db()?;

    let doc_id = document_id_for_highlight(&conn, &id)?;

    conn.execute("DELETE FROM highlights WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    touch_document(&conn, &doc_id)?;

    Ok(())
}

// === Margin Notes ===

#[tauri::command]
pub async fn create_margin_note(
    highlight_id: String,
    content: String,
) -> Result<MarginNote, String> {
    let conn = get_db()?;
    let id = Uuid::new_v4().to_string();
    let now = now_millis();

    conn.execute(
        "INSERT INTO margin_notes (id, highlight_id, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, highlight_id, content, now, now],
    )
    .map_err(|e| e.to_string())?;

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
pub async fn get_margin_notes(document_id: String) -> Result<Vec<MarginNote>, String> {
    let conn = get_db()?;

    let mut stmt = conn
        .prepare(
            "SELECT mn.id, mn.highlight_id, mn.content, mn.created_at, mn.updated_at
             FROM margin_notes mn
             JOIN highlights h ON mn.highlight_id = h.id
             WHERE h.document_id = ?1
             ORDER BY h.from_pos",
        )
        .map_err(|e| e.to_string())?;

    let notes = stmt
        .query_map([&document_id], |row| MarginNote::from_row(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(notes)
}

#[tauri::command]
pub async fn update_margin_note(id: String, content: String) -> Result<(), String> {
    let conn = get_db()?;
    let now = now_millis();

    let doc_id = document_id_for_margin_note(&conn, &id)?;

    conn.execute(
        "UPDATE margin_notes SET content = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![content, now, id],
    )
    .map_err(|e| e.to_string())?;

    touch_document(&conn, &doc_id)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_margin_note(id: String) -> Result<(), String> {
    let conn = get_db()?;

    let doc_id = document_id_for_margin_note(&conn, &id)?;

    conn.execute(
        "DELETE FROM margin_notes WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    touch_document(&conn, &doc_id)?;

    Ok(())
}

