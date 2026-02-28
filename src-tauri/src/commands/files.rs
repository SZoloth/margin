use crate::db::migrations::DbPool;
use crate::db::models::Document;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub async fn open_file_dialog() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(r#"POSIX path of (choose file of type {"md","markdown","txt"} with prompt "Open Markdown File")"#)
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    if !output.status.success() {
        // User cancelled the dialog (osascript returns non-zero)
        return Ok(None);
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Ok(None);
    }

    Ok(Some(path))
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to write file '{}': {}", path, e))
}

#[tauri::command]
pub async fn list_markdown_files(dir: String) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&dir);
    if !root.is_dir() {
        return Err(format!("'{}' is not a directory", dir));
    }

    let mut entries = collect_markdown_entries(root)?;

    // Sort: directories first, then alphabetically by name (case-insensitive)
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

fn rename_file_inner(conn: &rusqlite::Connection, old_path: String, new_name: String) -> Result<Document, String> {
    let new_name = new_name.trim().to_string();
    if new_name.is_empty() {
        return Err("File name cannot be empty".to_string());
    }
    if new_name.contains('/') || new_name.contains('\\') {
        return Err("File name cannot contain path separators".to_string());
    }

    // Ensure .md extension
    let new_name = if new_name.ends_with(".md") || new_name.ends_with(".markdown") {
        new_name
    } else {
        format!("{}.md", new_name)
    };

    let old = Path::new(&old_path);
    let parent = old
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;
    let new_path = parent.join(&new_name);

    if new_path.exists() {
        return Err(format!("A file named '{}' already exists", new_name));
    }
    if !old.exists() {
        return Err(format!("Source file does not exist: {}", old_path));
    }

    // Rename on disk
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename file: {}", e))?;

    let new_path_str = new_path.to_string_lossy().to_string();
    let new_title = new_name
        .strip_suffix(".md")
        .or_else(|| new_name.strip_suffix(".markdown"))
        .unwrap_or(&new_name)
        .to_string();

    // Update database — roll back the file rename if DB fails
    let updated_rows = conn.execute(
        "UPDATE documents SET file_path = ?1, title = ?2 WHERE file_path = ?3",
        rusqlite::params![new_path_str, new_title, old_path],
    )
    .map_err(|e| {
        let _ = fs::rename(&new_path, &old_path);
        format!("Failed to update database (file rename rolled back): {}", e)
    })?;
    if updated_rows != 1 {
        let _ = fs::rename(&new_path, &old_path);
        return Err(format!(
            "Failed to update database (expected 1 row, got {}; file rename rolled back)",
            updated_rows
        ));
    }

    // Return the updated document
    let doc = conn
        .query_row(
            "SELECT id, source, file_path, keep_local_id, title, author, url,
                    word_count, last_opened_at, created_at
             FROM documents WHERE file_path = ?1",
            rusqlite::params![new_path_str],
            |row| Document::from_row(row),
        )
        .map_err(|e| {
            let _ = fs::rename(&new_path, &old_path);
            let old_title = Path::new(&old_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .strip_suffix(".md")
                .or_else(|| {
                    Path::new(&old_path)
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .strip_suffix(".markdown")
                })
                .unwrap_or("")
                .to_string();
            let _ = conn.execute(
                "UPDATE documents SET file_path = ?1, title = ?2 WHERE file_path = ?3",
                rusqlite::params![old_path, old_title, new_path_str],
            );
            format!("Failed to fetch updated document (file rename rolled back): {}", e)
        })?;

    Ok(doc)
}

#[tauri::command]
pub async fn rename_file(state: tauri::State<'_, DbPool>, old_path: String, new_name: String) -> Result<Document, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    rename_file_inner(&conn, old_path, new_name)
}

pub fn collect_markdown_entries(dir: &Path) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new();

    let read_dir =
        fs::read_dir(dir).map_err(|e| format!("Failed to read directory '{}': {}", dir.display(), e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files/dirs
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            // Check if directory contains any markdown files (recursively)
            let children = collect_markdown_entries(&path)?;
            if !children.is_empty() {
                results.push(FileEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: true,
                });
                results.extend(children);
            }
        } else if let Some(ext) = path.extension() {
            let ext_lower = ext.to_string_lossy().to_lowercase();
            if ext_lower == "md" || ext_lower == "markdown" {
                results.push(FileEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                });
            }
        }
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn make_test_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("margin_test_files_{}", name));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE documents (
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
        )
        .unwrap();
        conn
    }

    // === collect_markdown_entries tests ===

    #[test]
    fn collects_md_and_markdown_files() {
        let dir = make_test_dir("md_and_markdown");
        fs::write(dir.join("test.md"), "# test").unwrap();
        fs::write(dir.join("notes.markdown"), "# notes").unwrap();

        let entries = collect_markdown_entries(&dir).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"test.md"));
        assert!(names.contains(&"notes.markdown"));
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn skips_hidden_files() {
        let dir = make_test_dir("hidden_files");
        fs::write(dir.join(".hidden.md"), "# hidden").unwrap();
        fs::write(dir.join("visible.md"), "# visible").unwrap();

        let entries = collect_markdown_entries(&dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "visible.md");
    }

    #[test]
    fn skips_hidden_directories() {
        let dir = make_test_dir("hidden_dirs");
        let hidden = dir.join(".hidden");
        fs::create_dir_all(&hidden).unwrap();
        fs::write(hidden.join("test.md"), "# test").unwrap();
        fs::write(dir.join("visible.md"), "# visible").unwrap();

        let entries = collect_markdown_entries(&dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "visible.md");
    }

    #[test]
    fn includes_dirs_only_when_containing_markdown() {
        let dir = make_test_dir("dir_with_md");
        let subdir_with = dir.join("has_md");
        let subdir_without = dir.join("empty_sub");
        fs::create_dir_all(&subdir_with).unwrap();
        fs::create_dir_all(&subdir_without).unwrap();
        fs::write(subdir_with.join("note.md"), "# note").unwrap();

        let entries = collect_markdown_entries(&dir).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"has_md"));
        assert!(!names.contains(&"empty_sub"));
    }

    #[test]
    fn skips_non_markdown_files() {
        let dir = make_test_dir("non_md");
        fs::write(dir.join("test.txt"), "text").unwrap();
        fs::write(dir.join("test.rs"), "fn main() {}").unwrap();
        fs::write(dir.join("test.json"), "{}").unwrap();

        let entries = collect_markdown_entries(&dir).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn empty_directory_returns_empty_vec() {
        let dir = make_test_dir("empty");
        let entries = collect_markdown_entries(&dir).unwrap();
        assert!(entries.is_empty());
    }

    // === sort logic tests ===

    #[test]
    fn directories_sort_before_files() {
        let dir = make_test_dir("sort_dir_first");
        let subdir = dir.join("subdir");
        fs::create_dir_all(&subdir).unwrap();
        fs::write(subdir.join("inner.md"), "# inner").unwrap();
        fs::write(dir.join("root.md"), "# root").unwrap();

        let mut entries = collect_markdown_entries(&dir).unwrap();
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        assert!(entries[0].is_dir, "first entry should be a directory");
        assert_eq!(entries[0].name, "subdir");
    }

    #[test]
    fn alphabetical_case_insensitive_within_category() {
        let dir = make_test_dir("sort_alpha");
        fs::write(dir.join("Beta.md"), "# beta").unwrap();
        fs::write(dir.join("alpha.md"), "# alpha").unwrap();

        let mut entries = collect_markdown_entries(&dir).unwrap();
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        assert_eq!(entries[0].name, "alpha.md");
        assert_eq!(entries[1].name, "Beta.md");
    }

    // === rename_file_inner tests ===

    #[test]
    fn rename_rejects_empty_name() {
        let dir = make_test_dir("rename_empty");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let conn = setup_db();

        let result = rename_file_inner(&conn, old.to_string_lossy().to_string(), "".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn rename_rejects_whitespace_only_name() {
        let dir = make_test_dir("rename_ws");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let conn = setup_db();

        let result = rename_file_inner(&conn, old.to_string_lossy().to_string(), "   ".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn rename_rejects_forward_slash() {
        let dir = make_test_dir("rename_fslash");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let conn = setup_db();

        let result = rename_file_inner(&conn, old.to_string_lossy().to_string(), "sub/file".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("path separators"));
    }

    #[test]
    fn rename_rejects_backslash() {
        let dir = make_test_dir("rename_bslash");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let conn = setup_db();

        let result = rename_file_inner(&conn, old.to_string_lossy().to_string(), "sub\\file".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("path separators"));
    }

    #[test]
    fn rename_auto_appends_md_extension() {
        let dir = make_test_dir("rename_auto_md");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let conn = setup_db();
        let old_str = old.to_string_lossy().to_string();
        conn.execute(
            "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at)
             VALUES ('d1', 'file', ?1, 'old', 1000, 1000)",
            rusqlite::params![old_str],
        ).unwrap();

        let doc = rename_file_inner(&conn, old_str, "notes".to_string()).unwrap();
        assert!(doc.file_path.as_ref().unwrap().ends_with("notes.md"));
        assert_eq!(doc.title.as_ref().unwrap(), "notes");
    }

    #[test]
    fn rename_preserves_md_extension() {
        let dir = make_test_dir("rename_keep_md");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let conn = setup_db();
        let old_str = old.to_string_lossy().to_string();
        conn.execute(
            "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at)
             VALUES ('d1', 'file', ?1, 'old', 1000, 1000)",
            rusqlite::params![old_str],
        ).unwrap();

        let doc = rename_file_inner(&conn, old_str, "notes.md".to_string()).unwrap();
        assert!(doc.file_path.as_ref().unwrap().ends_with("notes.md"));
        // Should NOT be notes.md.md
        assert!(!doc.file_path.as_ref().unwrap().ends_with("notes.md.md"));
    }

    #[test]
    fn rename_preserves_markdown_extension() {
        let dir = make_test_dir("rename_keep_markdown");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let conn = setup_db();
        let old_str = old.to_string_lossy().to_string();
        conn.execute(
            "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at)
             VALUES ('d1', 'file', ?1, 'old', 1000, 1000)",
            rusqlite::params![old_str],
        ).unwrap();

        let doc = rename_file_inner(&conn, old_str, "notes.markdown".to_string()).unwrap();
        assert!(doc.file_path.as_ref().unwrap().ends_with("notes.markdown"));
        assert_eq!(doc.title.as_ref().unwrap(), "notes");
    }

    #[test]
    fn rename_rejects_when_target_exists() {
        let dir = make_test_dir("rename_exists");
        let old = dir.join("old.md");
        let target = dir.join("taken.md");
        fs::write(&old, "# old").unwrap();
        fs::write(&target, "# taken").unwrap();
        let conn = setup_db();

        let result = rename_file_inner(&conn, old.to_string_lossy().to_string(), "taken.md".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already exists"));
    }

    #[test]
    fn rename_rejects_when_source_missing() {
        let dir = make_test_dir("rename_no_src");
        let missing = dir.join("ghost.md");
        let conn = setup_db();

        let result = rename_file_inner(&conn, missing.to_string_lossy().to_string(), "new.md".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn rename_rollback_on_db_failure() {
        let dir = make_test_dir("rename_rollback");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let old_str = old.to_string_lossy().to_string();

        // Create a DB without the documents table so the UPDATE fails
        let conn = Connection::open_in_memory().unwrap();

        let result = rename_file_inner(&conn, old_str.clone(), "new.md".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("rolled back"));

        // Verify the file was renamed back to the original name
        assert!(old.exists(), "original file should be restored after rollback");
        assert!(!dir.join("new.md").exists(), "new file should not exist after rollback");
    }

    #[test]
    fn rename_rolls_back_when_no_document_row_matches_old_path() {
        let dir = make_test_dir("rename_missing_db_row");
        let old = dir.join("old.md");
        fs::write(&old, "# old").unwrap();
        let conn = setup_db();

        let result =
            rename_file_inner(&conn, old.to_string_lossy().to_string(), "new.md".to_string());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("expected 1 row"));

        // File should be rolled back to the original name
        assert!(old.exists(), "original file should be restored after rollback");
        assert!(
            !dir.join("new.md").exists(),
            "new file should not exist after rollback"
        );
    }
}
