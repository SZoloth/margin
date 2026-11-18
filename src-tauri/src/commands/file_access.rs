//! Which files the webview may read or write through `read_file`/`save_file`.
//!
//! A path is allowed only when it is an absolute Markdown or text path that
//! either Rust handed to the webview this session (file dialog, Finder
//! "Open With", disk search, the first-run sample) or the documents table
//! already records. `upsert_document` applies the same rule before recording
//! a new path, so the table can't be used to launder an arbitrary one.

use rusqlite::Connection;
use std::collections::HashSet;
use std::path::{Component, Path};
use std::sync::Mutex;

const DOCUMENT_EXTENSIONS: &[&str] = &["md", "markdown", "mdown", "mkd", "txt"];

#[derive(Default)]
pub struct FileGrants(Mutex<HashSet<String>>);

impl FileGrants {
    pub fn grant(&self, path: &str) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).insert(path.to_string());
    }

    fn contains(&self, path: &str) -> bool {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).contains(path)
    }
}

pub(crate) fn is_document_path(path: &str) -> bool {
    let p = Path::new(path);
    p.is_absolute()
        && p.components().all(|c| matches!(c, Component::RootDir | Component::Normal(_)))
        && p.extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| DOCUMENT_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

fn is_recorded(conn: &Connection, path: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM documents WHERE file_path = ?1",
        rusqlite::params![path],
        |_| Ok(()),
    )
    .is_ok()
}

fn denied(path: &str) -> String {
    format!("Margin can only open Markdown files you've chosen: '{}'", path)
}

/// Reading, or recording a path in the documents table.
pub(crate) fn check_known(conn: &Connection, grants: &FileGrants, path: &str) -> Result<(), String> {
    if is_document_path(path) && (grants.contains(path) || is_recorded(conn, path)) {
        Ok(())
    } else {
        Err(denied(path))
    }
}

/// Saving: every save is of an open document, which is already recorded.
pub(crate) fn check_writable(conn: &Connection, path: &str) -> Result<(), String> {
    if is_document_path(path) && is_recorded(conn, path) {
        Ok(())
    } else {
        Err(denied(path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db_with(paths: &[&str]) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE documents (id TEXT PRIMARY KEY, file_path TEXT UNIQUE);")
            .unwrap();
        for (i, p) in paths.iter().enumerate() {
            conn.execute(
                "INSERT INTO documents (id, file_path) VALUES (?1, ?2)",
                rusqlite::params![i.to_string(), p],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn document_path_requires_absolute_markdown_without_dot_segments() {
        assert!(is_document_path("/Users/me/notes/draft.md"));
        assert!(is_document_path("/Users/me/a.MARKDOWN"));
        assert!(is_document_path("/Users/me/a.txt"));
        assert!(!is_document_path("notes/draft.md"));
        assert!(!is_document_path("/Users/me/notes/../.ssh/id_rsa.md"));
        assert!(!is_document_path("/Users/me/.ssh/id_rsa"));
        assert!(!is_document_path("/Users/me/.zshrc"));
        assert!(!is_document_path("/Users/me/Library/Cookies/Cookies.binarycookies"));
    }

    #[test]
    fn known_allows_granted_or_recorded_paths_only() {
        let conn = db_with(&["/Users/me/recent.md"]);
        let grants = FileGrants::default();
        grants.grant("/Users/me/picked.md");
        assert!(check_known(&conn, &grants, "/Users/me/recent.md").is_ok());
        assert!(check_known(&conn, &grants, "/Users/me/picked.md").is_ok());
        assert!(check_known(&conn, &grants, "/Users/me/other.md").is_err());
    }

    #[test]
    fn known_rejects_non_markdown_even_if_granted_or_recorded() {
        let conn = db_with(&["/Users/me/.zshrc"]);
        let grants = FileGrants::default();
        grants.grant("/Users/me/.ssh/id_rsa");
        assert!(check_known(&conn, &grants, "/Users/me/.zshrc").is_err());
        assert!(check_known(&conn, &grants, "/Users/me/.ssh/id_rsa").is_err());
    }

    #[test]
    fn writable_requires_a_recorded_document() {
        let conn = db_with(&["/Users/me/open.md"]);
        assert!(check_writable(&conn, "/Users/me/open.md").is_ok());
        assert!(check_writable(&conn, "/Users/me/CLAUDE.md").is_err());
        assert!(check_writable(&conn, "/Users/me/.zshrc").is_err());
    }
}
