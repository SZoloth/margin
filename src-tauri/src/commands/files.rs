// Placeholder — Agent A will implement
use serde::Serialize;

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub async fn open_file_dialog() -> Result<Option<String>, String> {
    todo!()
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    todo!()
}

#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    todo!()
}

#[tauri::command]
pub async fn list_markdown_files(dir: String) -> Result<Vec<FileEntry>, String> {
    todo!()
}
