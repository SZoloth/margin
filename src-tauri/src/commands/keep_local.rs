use serde::{Deserialize, Serialize};

const BASE_URL: &str = "http://127.0.0.1:8787";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepLocalHealth {
    pub ok: bool,
    pub now: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeepLocalItem {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub author: Option<String>,
    pub domain: Option<String>,
    pub platform: Option<String>,
    #[serde(default)]
    pub word_count: i64,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_at: i64,
    pub status: String,
    #[serde(default)]
    pub content_available: bool,
}

#[derive(Deserialize)]
struct ItemsResponse {
    items: Vec<KeepLocalItem>,
    #[allow(dead_code)]
    count: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeepLocalListResult {
    pub items: Vec<KeepLocalItem>,
    pub count: i64,
}

#[tauri::command]
pub fn keep_local_health() -> Result<KeepLocalHealth, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{BASE_URL}/api/health"))
        .send()
        .map_err(|e| format!("keep-local server unreachable: {e}"))?;

    resp.json::<KeepLocalHealth>()
        .map_err(|e| format!("Failed to parse health response: {e}"))
}

#[tauri::command]
pub fn keep_local_list_items(
    limit: Option<i32>,
    offset: Option<i32>,
    query: Option<String>,
    status: Option<String>,
) -> Result<KeepLocalListResult, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let mut url = format!("{BASE_URL}/api/items");
    let mut params: Vec<String> = Vec::new();

    if let Some(l) = limit {
        params.push(format!("limit={l}"));
    }
    if let Some(o) = offset {
        params.push(format!("offset={o}"));
    }
    if let Some(ref q) = query {
        if !q.is_empty() {
            params.push(format!("q={}", urlencoding(q)));
        }
    }
    if let Some(ref s) = status {
        if !s.is_empty() {
            params.push(format!("status={}", urlencoding(s)));
        }
    }

    if !params.is_empty() {
        url = format!("{}?{}", url, params.join("&"));
    }

    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("keep-local server unreachable: {e}"))?;

    let data: ItemsResponse = resp
        .json()
        .map_err(|e| format!("Failed to parse items response: {e}"))?;

    Ok(KeepLocalListResult {
        count: data.count,
        items: data.items,
    })
}

#[tauri::command]
pub fn keep_local_get_item(item_id: String) -> Result<KeepLocalItem, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{BASE_URL}/api/items/{item_id}?content=0"))
        .send()
        .map_err(|e| format!("keep-local server unreachable: {e}"))?;

    resp.json::<KeepLocalItem>()
        .map_err(|e| format!("Failed to parse item response: {e}"))
}

#[tauri::command]
pub fn keep_local_get_content(item_id: String) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("{BASE_URL}/api/items/{item_id}/content"))
        .send()
        .map_err(|e| format!("keep-local server unreachable: {e}"))?;

    resp.text()
        .map_err(|e| format!("Failed to read content response: {e}"))
}

/// Simple percent-encoding for query parameter values.
fn urlencoding(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}
