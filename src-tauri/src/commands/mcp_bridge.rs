//! Sends annotation exports to the MCP server's (or `margin export wait`'s)
//! loopback bridge. The bridge refuses requests without its per-session
//! token, which it writes with the port to an owner-only `~/.margin/mcp-port`.
//! Reading it here keeps the token out of the webview.

use crate::commands::keep_local::HttpClient;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::State;

#[derive(Debug, Deserialize, PartialEq)]
pub(crate) struct BridgeInfo {
    pub port: u16,
    pub token: String,
}

fn port_file() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".margin").join("mcp-port"))
}

pub(crate) fn read_bridge_info(path: &Path) -> Result<BridgeInfo, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|_| "Margin's MCP server isn't running".to_string())?;
    let info: BridgeInfo = serde_json::from_str(raw.trim())
        .map_err(|_| "MCP server is an older version; restart it to update".to_string())?;
    if info.token.is_empty() {
        return Err("MCP bridge token is missing".into());
    }
    Ok(info)
}

pub(crate) fn status_request(
    client: &reqwest::Client,
    info: &BridgeInfo,
) -> reqwest::Result<reqwest::Request> {
    client
        .get(format!("http://127.0.0.1:{}/status", info.port))
        .bearer_auth(&info.token)
        .timeout(Duration::from_millis(1500))
        .build()
}

pub(crate) fn export_request(
    client: &reqwest::Client,
    info: &BridgeInfo,
    markdown: String,
) -> reqwest::Result<reqwest::Request> {
    client
        .post(format!("http://127.0.0.1:{}/export", info.port))
        .bearer_auth(&info.token)
        .header(reqwest::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(markdown)
        .timeout(Duration::from_secs(3))
        .build()
}

#[tauri::command]
pub async fn mcp_bridge_status(client: State<'_, HttpClient>) -> Result<bool, String> {
    let Ok(info) = read_bridge_info(&port_file()?) else {
        return Ok(false);
    };
    let req = status_request(&client.0, &info).map_err(|e| e.to_string())?;
    Ok(matches!(client.0.execute(req).await, Ok(r) if r.status().is_success()))
}

#[tauri::command]
pub async fn mcp_bridge_send(client: State<'_, HttpClient>, markdown: String) -> Result<(), String> {
    let info = read_bridge_info(&port_file()?)?;
    let req = export_request(&client.0, &info, markdown).map_err(|e| e.to_string())?;
    let resp = client.0.execute(req).await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("HTTP {}", resp.status().as_u16()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_tmp(contents: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("margin-port-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, contents).unwrap();
        path
    }

    #[test]
    fn reads_port_and_token() {
        let path = write_tmp(r#"{"port":24790,"token":"abc"}"#);
        let info = read_bridge_info(&path).unwrap();
        assert_eq!(info, BridgeInfo { port: 24790, token: "abc".into() });
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn rejects_legacy_port_only_file() {
        let path = write_tmp("24784");
        assert!(read_bridge_info(&path).is_err());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn rejects_empty_token() {
        let path = write_tmp(r#"{"port":24784,"token":""}"#);
        assert!(read_bridge_info(&path).is_err());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn missing_file_is_not_running() {
        let path = std::env::temp_dir().join("margin-port-does-not-exist");
        assert!(read_bridge_info(&path).unwrap_err().contains("isn't running"));
    }

    #[test]
    fn export_request_carries_token_uses_file_port_and_no_origin() {
        let client = reqwest::Client::new();
        let info = BridgeInfo { port: 40001, token: "secret".into() };
        let req = export_request(&client, &info, "notes".into()).unwrap();
        assert_eq!(req.method(), reqwest::Method::POST);
        assert_eq!(req.url().as_str(), "http://127.0.0.1:40001/export");
        assert_eq!(req.headers()["authorization"], "Bearer secret");
        assert!(req.headers().get("origin").is_none());
    }

    #[test]
    fn status_request_carries_token() {
        let client = reqwest::Client::new();
        let info = BridgeInfo { port: 40002, token: "secret".into() };
        let req = status_request(&client, &info).unwrap();
        assert_eq!(req.url().as_str(), "http://127.0.0.1:40002/status");
        assert_eq!(req.headers()["authorization"], "Bearer secret");
    }
}
