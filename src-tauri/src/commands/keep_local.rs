use serde::{Deserialize, Serialize};
use tauri::State;

const BASE_URL: &str = "http://127.0.0.1:8787";

/// Shared HTTP client managed by Tauri state.
pub struct HttpClient(pub reqwest::Client);

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
pub async fn keep_local_health(client: State<'_, HttpClient>) -> Result<KeepLocalHealth, String> {
    let resp = client
        .0
        .get(format!("{BASE_URL}/api/health"))
        .send()
        .await
        .map_err(|e| format!("keep-local server unreachable: {e}"))?;

    resp.error_for_status_ref()
        .map_err(|e| format!("keep-local health check failed: {e}"))?;

    resp.json::<KeepLocalHealth>()
        .await
        .map_err(|e| format!("Failed to parse health response: {e}"))
}

#[tauri::command]
pub async fn keep_local_list_items(
    client: State<'_, HttpClient>,
    limit: Option<i32>,
    offset: Option<i32>,
    query: Option<String>,
    status: Option<String>,
) -> Result<KeepLocalListResult, String> {
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
        .0
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("keep-local server unreachable: {e}"))?;

    resp.error_for_status_ref()
        .map_err(|e| format!("keep-local list failed (HTTP error): {e}"))?;

    let data: ItemsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse items response: {e}"))?;

    Ok(KeepLocalListResult {
        count: data.count,
        items: data.items,
    })
}

#[tauri::command]
pub async fn keep_local_get_item(
    client: State<'_, HttpClient>,
    item_id: String,
) -> Result<KeepLocalItem, String> {
    let resp = client
        .0
        .get(format!("{BASE_URL}/api/items/{item_id}?content=0"))
        .send()
        .await
        .map_err(|e| format!("keep-local server unreachable: {e}"))?;

    resp.error_for_status_ref()
        .map_err(|e| format!("keep-local get item failed (HTTP error): {e}"))?;

    resp.json::<KeepLocalItem>()
        .await
        .map_err(|e| format!("Failed to parse item response: {e}"))
}

#[tauri::command]
pub async fn keep_local_get_content(
    client: State<'_, HttpClient>,
    item_id: String,
) -> Result<String, String> {
    let resp = client
        .0
        .get(format!("{BASE_URL}/api/items/{item_id}/content"))
        .send()
        .await
        .map_err(|e| format!("keep-local server unreachable: {e}"))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read content response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Content not available (HTTP {status})"));
    }

    if body.is_empty() {
        return Err("Content not available".to_string());
    }

    Ok(body)
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
