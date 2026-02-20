// Placeholder — Agent A will implement
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub source: String,
    pub file_path: Option<String>,
    pub keep_local_id: Option<String>,
    pub title: Option<String>,
    pub author: Option<String>,
    pub url: Option<String>,
    pub word_count: i64,
    pub last_opened_at: i64,
    pub created_at: i64,
}

#[tauri::command]
pub async fn get_recent_documents(limit: Option<i64>) -> Result<Vec<Document>, String> {
    todo!()
}

#[tauri::command]
pub async fn upsert_document(doc: Document) -> Result<Document, String> {
    todo!()
}
