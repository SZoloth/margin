use crate::commands::now_millis;
use crate::db::migrations::DbPool;
use rusqlite::Connection;
use uuid::Uuid;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ThesisCandidate {
    pub id: String,
    pub statement: String,
    /// JSON array of evidence objects: [{ highlightId, text, relevance }]
    pub evidence_json: String,
    pub confidence: Option<String>,
    /// JSON array of document IDs this thesis was distilled from
    pub source_document_ids_json: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

fn thesis_from_row(row: &rusqlite::Row) -> rusqlite::Result<ThesisCandidate> {
    Ok(ThesisCandidate {
        id: row.get(0)?,
        statement: row.get(1)?,
        evidence_json: row.get(2)?,
        confidence: row.get(3)?,
        source_document_ids_json: row.get(4)?,
        status: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

pub fn fetch_thesis_candidates(conn: &Connection) -> rusqlite::Result<Vec<ThesisCandidate>> {
    let mut stmt = conn.prepare(
        "SELECT id, statement, evidence_json, confidence, source_document_ids_json,
                status, created_at, updated_at
         FROM thesis_candidates
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], thesis_from_row)?;
    rows.collect()
}

pub fn insert_thesis_candidate(
    conn: &Connection,
    statement: &str,
    evidence_json: &str,
    confidence: Option<&str>,
    source_document_ids_json: &str,
) -> rusqlite::Result<ThesisCandidate> {
    let id = Uuid::new_v4().to_string();
    let now = now_millis();
    conn.execute(
        "INSERT INTO thesis_candidates
             (id, statement, evidence_json, confidence, source_document_ids_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)",
        rusqlite::params![id, statement, evidence_json, confidence, source_document_ids_json, now, now],
    )?;
    conn.query_row(
        "SELECT id, statement, evidence_json, confidence, source_document_ids_json,
                status, created_at, updated_at
         FROM thesis_candidates WHERE id = ?",
        [&id],
        thesis_from_row,
    )
}

pub fn set_thesis_status(conn: &Connection, id: &str, status: &str) -> rusqlite::Result<bool> {
    let updated = conn.execute(
        "UPDATE thesis_candidates SET status = ?, updated_at = ? WHERE id = ?",
        rusqlite::params![status, now_millis(), id],
    )?;
    Ok(updated > 0)
}

// --- Tauri commands ---

#[tauri::command]
pub async fn save_thesis_candidate(
    state: tauri::State<'_, DbPool>,
    statement: String,
    evidence_json: String,
    confidence: Option<String>,
    source_document_ids_json: String,
) -> Result<ThesisCandidate, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    insert_thesis_candidate(
        &conn,
        &statement,
        &evidence_json,
        confidence.as_deref(),
        &source_document_ids_json,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_thesis_candidates(
    state: tauri::State<'_, DbPool>,
) -> Result<Vec<ThesisCandidate>, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    fetch_thesis_candidates(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_thesis_status(
    state: tauri::State<'_, DbPool>,
    id: String,
    status: String,
) -> Result<bool, String> {
    let allowed = ["draft", "accepted", "rejected"];
    if !allowed.contains(&status.as_str()) {
        return Err(format!(
            "Invalid status \"{status}\". Allowed: {}",
            allowed.join(", ")
        ));
    }
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    set_thesis_status(&conn, &id, &status).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::db::migrations::migrate_add_thesis_candidates_table;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_thesis_candidates_table(&conn).unwrap();
        conn
    }

    #[test]
    fn test_insert_and_fetch() {
        let conn = test_conn();
        let thesis = insert_thesis_candidate(
            &conn,
            "AI removes mechanical tasks but not judgment",
            r#"[{"highlightId":"h1","text":"brokers still decide","relevance":"direct"}]"#,
            Some("high — 3 highlights converge"),
            r#"["doc1","doc2"]"#,
        )
        .unwrap();

        assert_eq!(thesis.statement, "AI removes mechanical tasks but not judgment");
        assert_eq!(thesis.status, "draft");
        assert!(thesis.confidence.is_some());

        let all = fetch_thesis_candidates(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, thesis.id);
    }

    #[test]
    fn test_update_status() {
        let conn = test_conn();
        let thesis = insert_thesis_candidate(&conn, "test claim", "[]", None, "[]").unwrap();
        assert_eq!(thesis.status, "draft");

        let updated = set_thesis_status(&conn, &thesis.id, "accepted").unwrap();
        assert!(updated);

        let all = fetch_thesis_candidates(&conn).unwrap();
        assert_eq!(all[0].status, "accepted");
    }

    #[test]
    fn test_update_status_nonexistent() {
        let conn = test_conn();
        let updated = set_thesis_status(&conn, "no-such-id", "rejected").unwrap();
        assert!(!updated);
    }

    #[test]
    fn test_fetch_ordered_by_created_at_desc() {
        let conn = test_conn();
        // Insert two theses with different created_at
        let id1 = Uuid::new_v4().to_string();
        let id2 = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO thesis_candidates (id, statement, evidence_json, source_document_ids_json, status, created_at, updated_at)
             VALUES (?, 'older', '[]', '[]', 'draft', 1000, 1000)",
            [&id1],
        ).unwrap();
        conn.execute(
            "INSERT INTO thesis_candidates (id, statement, evidence_json, source_document_ids_json, status, created_at, updated_at)
             VALUES (?, 'newer', '[]', '[]', 'draft', 2000, 2000)",
            [&id2],
        ).unwrap();

        let all = fetch_thesis_candidates(&conn).unwrap();
        assert_eq!(all[0].statement, "newer");
        assert_eq!(all[1].statement, "older");
    }
}
