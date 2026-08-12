use crate::commands::now_millis;
use crate::db::migrations::DbPool;
use rusqlite::{Connection, OptionalExtension};
use uuid::Uuid;

#[derive(Debug)]
struct FeedbackSource {
    document_id: String,
    original_text: String,
    prefix_context: Option<String>,
    suffix_context: Option<String>,
    highlight_color: String,
    document_title: Option<String>,
    document_source: String,
    document_path: Option<String>,
}

/// Keep one mutable row for feedback that has not entered synthesis yet.
/// Feedback saved after synthesis becomes a new event.
pub(crate) fn sync_continuous_feedback(
    conn: &Connection,
    highlight_id: &str,
    polarity_patch: Option<Option<&str>>,
    rationale_patch: Option<Option<&str>>,
    now: i64,
) -> Result<bool, String> {
    if let Some(Some(polarity)) = polarity_patch {
        if !matches!(polarity, "positive" | "corrective") {
            return Err(format!(
                "invalid polarity: {polarity:?} (expected \"positive\" or \"corrective\")"
            ));
        }
    }

    let source = conn
        .query_row(
            "SELECT h.document_id, h.text_content, h.prefix_context, h.suffix_context,
                h.color, d.title, d.source, d.file_path
         FROM highlights h
         JOIN documents d ON d.id = h.document_id
         WHERE h.id = ?1",
            [highlight_id],
            |row| {
                Ok(FeedbackSource {
                    document_id: row.get(0)?,
                    original_text: row.get(1)?,
                    prefix_context: row.get(2)?,
                    suffix_context: row.get(3)?,
                    highlight_color: row.get(4)?,
                    document_title: row.get(5)?,
                    document_source: row.get(6)?,
                    document_path: row.get(7)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    if source.original_text.trim().is_empty() {
        return Err("empty highlight text is not allowed for continuous feedback".to_string());
    }

    let notes = {
        let mut stmt = conn
            .prepare(
                "SELECT content FROM margin_notes
             WHERE highlight_id = ?1 AND intent = 'correction'
             ORDER BY created_at, id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([highlight_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };

    let existing = conn
        .query_row(
            "SELECT id, polarity, rationale
         FROM corrections
         WHERE highlight_id = ?1 AND synthesized_at IS NULL
         ORDER BY created_at DESC LIMIT 1",
            [highlight_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let existing_polarity = existing.as_ref().and_then(|(_, value, _)| value.clone());
    let existing_rationale = existing.as_ref().and_then(|(_, _, value)| value.clone());
    let polarity = match polarity_patch {
        Some(value) => value.map(str::to_owned),
        None => existing_polarity,
    };
    let rationale = match rationale_patch {
        Some(value) => value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned),
        None => existing_rationale,
    };

    if notes.is_empty() && polarity.is_none() && rationale.is_none() {
        if let Some((id, _, _)) = existing {
            conn.execute("DELETE FROM corrections WHERE id = ?1", [id])
                .map_err(|e| e.to_string())?;
            return Ok(true);
        }
        return Ok(false);
    }

    let notes_json = serde_json::to_string(&notes).map_err(|e| e.to_string())?;
    let extended_context = if source.prefix_context.is_some() || source.suffix_context.is_some() {
        Some(format!(
            "{}{}{}",
            source.prefix_context.as_deref().unwrap_or_default(),
            source.original_text,
            source.suffix_context.as_deref().unwrap_or_default()
        ))
    } else {
        None
    };

    if let Some((id, _, _)) = existing {
        conn.execute(
            "UPDATE corrections
             SET document_id = ?1, original_text = ?2, prefix_context = ?3,
                 suffix_context = ?4, extended_context = ?5, notes_json = ?6,
                 document_title = ?7, document_source = ?8, document_path = ?9,
                 highlight_color = ?10, polarity = ?11, rationale = ?12, updated_at = ?13
             WHERE id = ?14",
            rusqlite::params![
                source.document_id,
                source.original_text,
                source.prefix_context,
                source.suffix_context,
                extended_context,
                notes_json,
                source.document_title,
                source.document_source,
                source.document_path,
                source.highlight_color,
                polarity,
                rationale,
                now,
                id,
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO corrections
                (id, highlight_id, document_id, session_id, original_text,
                 prefix_context, suffix_context, extended_context, notes_json,
                 document_title, document_source, document_path, highlight_color,
                 created_at, updated_at, polarity, rationale)
             VALUES (?1, ?2, ?3, 'continuous', ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                     ?11, ?12, ?13, ?13, ?14, ?15)",
            rusqlite::params![
                Uuid::new_v4().to_string(),
                highlight_id,
                source.document_id,
                source.original_text,
                source.prefix_context,
                source.suffix_context,
                extended_context,
                notes_json,
                source.document_title,
                source.document_source,
                source.document_path,
                source.highlight_color,
                now,
                polarity,
                rationale,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn sync_feedback_signal(
    state: tauri::State<'_, DbPool>,
    highlight_id: String,
    polarity: Option<String>,
    rationale: Option<String>,
) -> Result<bool, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    sync_continuous_feedback(
        &conn,
        &highlight_id,
        Some(polarity.as_deref()),
        Some(rationale.as_deref()),
        now_millis(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE documents (id TEXT PRIMARY KEY, source TEXT NOT NULL, file_path TEXT, title TEXT);
             CREATE TABLE highlights (
                id TEXT PRIMARY KEY, document_id TEXT NOT NULL, color TEXT NOT NULL,
                text_content TEXT NOT NULL, prefix_context TEXT, suffix_context TEXT
             );
             CREATE TABLE margin_notes (
                id TEXT PRIMARY KEY, highlight_id TEXT NOT NULL, content TEXT NOT NULL,
                intent TEXT NOT NULL, created_at INTEGER NOT NULL
             );
             CREATE TABLE corrections (
                id TEXT PRIMARY KEY, highlight_id TEXT NOT NULL, document_id TEXT NOT NULL,
                session_id TEXT NOT NULL, original_text TEXT NOT NULL, prefix_context TEXT,
                suffix_context TEXT, extended_context TEXT, notes_json TEXT NOT NULL,
                document_title TEXT, document_source TEXT NOT NULL, document_path TEXT,
                category TEXT, highlight_color TEXT NOT NULL, created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL, writing_type TEXT, polarity TEXT,
                synthesized_at INTEGER, feedback_type TEXT, suggested_edit TEXT,
                accepted_at INTEGER, rationale TEXT
             );
             INSERT INTO documents VALUES ('doc1', 'file', '/tmp/test.md', 'Test document');
             INSERT INTO highlights VALUES (
                'h1', 'doc1', 'yellow', 'weak sentence', 'Before. ', ' After.'
             );",
        ).unwrap();
        conn
    }

    fn add_note(conn: &Connection, id: &str, content: &str, created_at: i64) {
        conn.execute(
            "INSERT INTO margin_notes VALUES (?1, 'h1', ?2, 'correction', ?3)",
            rusqlite::params![id, content, created_at],
        )
        .unwrap();
    }

    #[test]
    fn captures_feedback_without_export() {
        let conn = setup_db();
        add_note(&conn, "n1", "Use a concrete example.", 1000);

        sync_continuous_feedback(
            &conn,
            "h1",
            Some(Some("corrective")),
            Some(Some("The claim needs proof.")),
            2000,
        )
        .unwrap();

        let captured: (String, String, Option<String>) = conn
            .query_row(
                "SELECT original_text, notes_json, polarity FROM corrections",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(captured.0, "weak sentence");
        assert_eq!(captured.1, r#"["Use a concrete example."]"#);
        assert_eq!(captured.2.as_deref(), Some("corrective"));
    }

    #[test]
    fn updates_the_current_unsynthesized_signal() {
        let conn = setup_db();
        add_note(&conn, "n1", "First note.", 1000);
        sync_continuous_feedback(&conn, "h1", None, None, 2000).unwrap();
        add_note(&conn, "n2", "Second note.", 2001);
        sync_continuous_feedback(&conn, "h1", Some(Some("positive")), None, 3000).unwrap();

        let captured: (i64, String, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), MAX(notes_json), MAX(polarity) FROM corrections",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(captured.0, 1);
        assert_eq!(captured.1, r#"["First note.","Second note."]"#);
        assert_eq!(captured.2.as_deref(), Some("positive"));
    }

    #[test]
    fn starts_a_new_event_after_synthesis() {
        let conn = setup_db();
        add_note(&conn, "n1", "First note.", 1000);
        sync_continuous_feedback(&conn, "h1", None, None, 2000).unwrap();
        conn.execute("UPDATE corrections SET synthesized_at = 2500", [])
            .unwrap();
        add_note(&conn, "n2", "New feedback.", 3000);
        sync_continuous_feedback(&conn, "h1", None, None, 4000).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM corrections", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }
}
