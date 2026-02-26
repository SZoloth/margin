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

#[tauri::command]
pub async fn rename_file(state: tauri::State<'_, DbPool>, old_path: String, new_name: String) -> Result<Document, String> {
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
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "UPDATE documents SET file_path = ?1, title = ?2 WHERE file_path = ?3",
        rusqlite::params![new_path_str, new_title, old_path],
    )
    .map_err(|e| {
        let _ = fs::rename(&new_path, &old_path);
        format!("Failed to update database (file rename rolled back): {}", e)
    })?;

    // Return the updated document
    let doc = conn
        .query_row(
            "SELECT id, source, file_path, keep_local_id, title, author, url,
                    word_count, last_opened_at, created_at
             FROM documents WHERE file_path = ?1",
            rusqlite::params![new_path_str],
            |row| Document::from_row(row),
        )
        .map_err(|e| format!("Failed to fetch updated document: {}", e))?;

    Ok(doc)
}

fn collect_markdown_entries(dir: &Path) -> Result<Vec<FileEntry>, String> {
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
