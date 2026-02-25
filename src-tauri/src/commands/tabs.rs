use crate::db::migrations::get_db;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedTab {
    pub id: String,
    pub document_id: String,
    pub tab_order: i64,
    pub is_active: bool,
    pub created_at: i64,
}

// === Inner functions (testable with &Connection) ===

fn fetch_open_tabs(conn: &Connection) -> Result<Vec<PersistedTab>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, document_id, tab_order, is_active, created_at
             FROM open_tabs
             ORDER BY tab_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
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
        .map_err(|e| e.to_string());
    results
}

fn persist_open_tabs(conn: &Connection, tabs: &[PersistedTab]) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM open_tabs", [])
        .map_err(|e| e.to_string())?;

    let mut stmt = tx
        .prepare(
            "INSERT INTO open_tabs (id, document_id, tab_order, is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .map_err(|e| e.to_string())?;

    for tab in tabs {
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

// === Tauri command handlers ===

#[tauri::command]
pub async fn get_open_tabs() -> Result<Vec<PersistedTab>, String> {
    let conn = get_db()?;
    fetch_open_tabs(&conn)
}

#[tauri::command]
pub async fn save_open_tabs(tabs: Vec<PersistedTab>) -> Result<(), String> {
    let conn = get_db()?;
    persist_open_tabs(&conn, &tabs)
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
         );
         CREATE TABLE open_tabs (
             id TEXT PRIMARY KEY,
             document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
             tab_order INTEGER NOT NULL,
             is_active INTEGER NOT NULL DEFAULT 0,
             created_at INTEGER NOT NULL
         );"
    }

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        conn.execute_batch(schema_sql()).unwrap();
        conn
    }

    fn insert_doc(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO documents (id, source, title, last_opened_at, created_at)
             VALUES (?1, 'file', 'Test', 1000, 1000)",
            rusqlite::params![id],
        )
        .unwrap();
    }

    fn make_tab(id: &str, doc_id: &str, order: i64, active: bool) -> PersistedTab {
        PersistedTab {
            id: id.to_string(),
            document_id: doc_id.to_string(),
            tab_order: order,
            is_active: active,
            created_at: 1000,
        }
    }

    #[test]
    fn save_and_fetch_tabs() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_doc(&conn, "doc2");

        let tabs = vec![
            make_tab("t1", "doc1", 0, true),
            make_tab("t2", "doc2", 1, false),
        ];
        persist_open_tabs(&conn, &tabs).unwrap();

        let fetched = fetch_open_tabs(&conn).unwrap();
        assert_eq!(fetched.len(), 2);
        assert_eq!(fetched[0].id, "t1");
        assert!(fetched[0].is_active);
        assert_eq!(fetched[1].id, "t2");
        assert!(!fetched[1].is_active);
    }

    #[test]
    fn fetch_tabs_ordered_by_tab_order() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_doc(&conn, "doc2");

        let tabs = vec![
            make_tab("t2", "doc2", 5, false),
            make_tab("t1", "doc1", 1, true),
        ];
        persist_open_tabs(&conn, &tabs).unwrap();

        let fetched = fetch_open_tabs(&conn).unwrap();
        assert_eq!(fetched[0].tab_order, 1);
        assert_eq!(fetched[1].tab_order, 5);
    }

    #[test]
    fn save_tabs_replaces_existing() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");
        insert_doc(&conn, "doc2");

        persist_open_tabs(&conn, &[make_tab("t1", "doc1", 0, true)]).unwrap();
        assert_eq!(fetch_open_tabs(&conn).unwrap().len(), 1);

        // Replace with different tabs
        persist_open_tabs(&conn, &[
            make_tab("t2", "doc2", 0, true),
            make_tab("t3", "doc1", 1, false),
        ]).unwrap();

        let fetched = fetch_open_tabs(&conn).unwrap();
        assert_eq!(fetched.len(), 2);
        assert_eq!(fetched[0].id, "t2");
    }

    #[test]
    fn save_empty_tabs_clears_all() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        persist_open_tabs(&conn, &[make_tab("t1", "doc1", 0, true)]).unwrap();
        assert_eq!(fetch_open_tabs(&conn).unwrap().len(), 1);

        persist_open_tabs(&conn, &[]).unwrap();
        assert!(fetch_open_tabs(&conn).unwrap().is_empty());
    }

    #[test]
    fn bool_roundtrip_for_is_active() {
        let conn = setup_db();
        insert_doc(&conn, "doc1");

        persist_open_tabs(&conn, &[make_tab("t1", "doc1", 0, true)]).unwrap();
        let fetched = fetch_open_tabs(&conn).unwrap();
        assert!(fetched[0].is_active);

        persist_open_tabs(&conn, &[make_tab("t1", "doc1", 0, false)]).unwrap();
        let fetched = fetch_open_tabs(&conn).unwrap();
        assert!(!fetched[0].is_active);
    }
}
