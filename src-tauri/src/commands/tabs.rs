use crate::db::migrations::get_db;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedTab {
    pub id: String,
    pub document_id: String,
    pub tab_order: i64,
    pub is_active: bool,
    pub created_at: i64,
}

#[tauri::command]
pub async fn get_open_tabs() -> Result<Vec<PersistedTab>, String> {
    let conn = get_db()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, tab_order, is_active, created_at
             FROM open_tabs
             ORDER BY tab_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let tabs = stmt
        .query_map([], |row| {
            Ok(PersistedTab {
                id: row.get("id")?,
                document_id: row.get("document_id")?,
                tab_order: row.get("tab_order")?,
                is_active: row.get::<_, i64>("is_active")? != 0,
                created_at: row.get("created_at")?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(tabs)
}

#[tauri::command]
pub async fn save_open_tabs(tabs: Vec<PersistedTab>) -> Result<(), String> {
    let conn = get_db()?;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM open_tabs", [])
        .map_err(|e| e.to_string())?;

    let mut stmt = tx
        .prepare(
            "INSERT INTO open_tabs (id, document_id, tab_order, is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(|e| e.to_string())?;

    for tab in &tabs {
        stmt.execute(rusqlite::params![
            tab.id,
            tab.document_id,
            tab.tab_order,
            tab.is_active as i64,
            tab.created_at,
        ])
        .map_err(|e| e.to_string())?;
    }

    drop(stmt);
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}
