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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Highlight {
    pub id: String,
    pub document_id: String,
    pub color: String,
    pub text_content: String,
    pub from_pos: i64,
    pub to_pos: i64,
    pub prefix_context: Option<String>,
    pub suffix_context: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Highlight {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Highlight {
            id: row.get("id")?,
            document_id: row.get("document_id")?,
            color: row.get("color")?,
            text_content: row.get("text_content")?,
            from_pos: row.get("from_pos")?,
            to_pos: row.get("to_pos")?,
            prefix_context: row.get("prefix_context")?,
            suffix_context: row.get("suffix_context")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarginNote {
    pub id: String,
    pub highlight_id: String,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
}

impl MarginNote {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(MarginNote {
            id: row.get("id")?,
            highlight_id: row.get("highlight_id")?,
            content: row.get("content")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrectionInput {
    pub highlight_id: String,
    pub original_text: String,
    pub prefix_context: Option<String>,
    pub suffix_context: Option<String>,
    pub extended_context: Option<String>,
    pub notes: Vec<String>,
    pub highlight_color: String,
    pub writing_type: Option<String>,
}

