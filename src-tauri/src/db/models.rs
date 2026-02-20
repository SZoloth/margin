use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl Document {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Document {
            id: row.get("id")?,
            source: row.get("source")?,
            file_path: row.get("file_path")?,
            keep_local_id: row.get("keep_local_id")?,
            title: row.get("title")?,
            author: row.get("author")?,
            url: row.get("url")?,
            word_count: row.get("word_count")?,
            last_opened_at: row.get("last_opened_at")?,
            created_at: row.get("created_at")?,
        })
    }
}
