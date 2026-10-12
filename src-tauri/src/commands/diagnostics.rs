use crate::backup::{self, BackupInfo};
use crate::db::migrations::DbPool;
use crate::logging;
use crate::report::{build_report, ReportInput};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Serialize)]
pub struct BackupStatus {
    pub count: usize,
    /// Name of the newest snapshot, e.g. `margin-20261012-205213-daily.db`.
    pub latest: Option<BackupInfo>,
}

fn require_dir(dir: Option<PathBuf>) -> Result<PathBuf, String> {
    let dir = dir.ok_or("Could not determine home directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn reveal(dir: &Path) -> Result<(), String> {
    let program = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open {}: {e}", dir.display()))
}

/// Receives errors caught by the React error boundary and global handlers.
#[tauri::command]
pub fn log_frontend_error(source: String, message: String, stack: Option<String>) {
    let body = match stack {
        Some(s) if !s.trim().is_empty() => format!("{message}\n{s}"),
        _ => message,
    };
    logging::log("ERROR", &source, &body);
}

#[tauri::command]
pub fn reveal_logs_dir() -> Result<(), String> {
    reveal(&require_dir(logging::logs_dir())?)
}

#[tauri::command]
pub fn reveal_backups_dir() -> Result<(), String> {
    reveal(&require_dir(backup::backups_dir())?)
}

#[tauri::command]
pub fn get_backup_status() -> BackupStatus {
    let all = backup::backups_dir().map(|d| backup::list(&d)).unwrap_or_default();
    BackupStatus { count: all.len(), latest: all.into_iter().next() }
}

#[tauri::command]
pub fn get_diagnostics(pool: State<'_, DbPool>) -> Result<String, String> {
    const TABLES: [&str; 5] = ["documents", "highlights", "margin_notes", "corrections", "writing_rules"];
    let counts: Vec<(&str, i64)> = {
        let conn = pool.0.lock().unwrap_or_else(|e| e.into_inner());
        TABLES
            .iter()
            .filter_map(|t| {
                conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get::<_, i64>(0))
                    .ok()
                    .map(|n| (*t, n))
            })
            .collect()
    };
    let home = dirs::home_dir().map(|h| h.to_string_lossy().to_string());
    let db_bytes = logging::margin_dir()
        .and_then(|d| std::fs::metadata(d.join("margin.db")).ok())
        .map(|m| m.len());
    let backups = backup::backups_dir().map(|d| backup::list(&d)).unwrap_or_default();
    let log_tail = logging::logs_dir().map(|d| logging::tail(&d, 100)).unwrap_or_default();
    Ok(build_report(&ReportInput {
        app_version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        generated_at: logging::now_secs(),
        db_bytes,
        counts: &counts,
        backups: &backups,
        log_tail: &log_tail,
        home: home.as_deref(),
    }))
}
