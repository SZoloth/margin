//! Database snapshots in `~/.margin/backups`.
//!
//! Two kinds, each pruned to the newest [`KEEP`]:
//! - `pre-migration`: taken once per app version, before migrations touch
//!   the schema. This is the "an update broke my data" escape hatch.
//! - `daily`: taken at launch and hourly while the app stays open, once per
//!   UTC day.
//!
//! Snapshots use `VACUUM INTO`, which yields a consistent, compacted copy
//! even while the database is in WAL mode, so the result is a single
//! standalone `.db` file. Nothing here may fail startup: callers get log
//! lines, not errors.

use crate::logging::{compact_stamp, now_secs};
use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const KEEP: usize = 7;
const DAILY: &str = "daily";
const PRE_MIGRATION: &str = "pre-migration";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BackupInfo {
    pub name: String,
    pub kind: String,
    pub size_bytes: u64,
}

pub fn backups_dir() -> Option<PathBuf> {
    crate::logging::margin_dir().map(|d| d.join("backups"))
}

/// A database with no `documents` table is brand new; nothing to protect.
fn has_user_data(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'documents'",
        [],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n > 0)
    .unwrap_or(false)
}

fn file_name(stamp: &str, tag: &str) -> String {
    format!("margin-{stamp}-{tag}.db")
}

fn kind_of(name: &str) -> Option<&'static str> {
    if !name.starts_with("margin-") || !name.ends_with(".db") {
        None
    } else if name.contains("-pre-migration-") {
        Some(PRE_MIGRATION)
    } else if name.ends_with("-daily.db") {
        Some(DAILY)
    } else {
        None
    }
}

/// Newest first.
pub fn list(dir: &Path) -> Vec<BackupInfo> {
    let mut out: Vec<BackupInfo> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            let kind = kind_of(&name)?;
            let size_bytes = e.metadata().map(|m| m.len()).unwrap_or(0);
            Some(BackupInfo { name, kind: kind.to_string(), size_bytes })
        })
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    out
}

/// Writes a snapshot to `dir/margin-<stamp>-<tag>.db` via a `.partial` file
/// so a crash mid-copy never leaves something that looks like a backup.
pub fn snapshot(conn: &Connection, dir: &Path, stamp: &str, tag: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let final_path = dir.join(file_name(stamp, tag));
    let partial = dir.join(format!("{}.partial", file_name(stamp, tag)));
    let _ = fs::remove_file(&partial);
    conn.execute("VACUUM INTO ?1", [partial.to_string_lossy().as_ref()])
        .map_err(|e| e.to_string())?;
    fs::rename(&partial, &final_path).map_err(|e| e.to_string())?;
    Ok(final_path)
}

/// Deletes all but the newest `keep` snapshots of one kind, plus any stale
/// `.partial` files from interrupted copies.
pub fn prune(dir: &Path, kind: &str, keep: usize) {
    if let Ok(entries) = fs::read_dir(dir) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().ends_with(".partial") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    for old in list(dir).into_iter().filter(|b| b.kind == kind).skip(keep) {
        let _ = fs::remove_file(dir.join(old.name));
    }
}

fn day_of(stamp: &str) -> &str {
    stamp.split('-').next().unwrap_or("")
}

fn already_has(dir: &Path, kind: &str, contains: &str) -> bool {
    list(dir)
        .iter()
        .any(|b| b.kind == kind && b.name.contains(contains))
}

/// Takes the daily snapshot if today's is missing. Returns a log line when it
/// did something.
pub fn run_daily_if_due(conn: &Connection, dir: &Path, now: u64) -> Option<String> {
    if !has_user_data(conn) {
        return None;
    }
    let stamp = compact_stamp(now);
    if already_has(dir, DAILY, &format!("margin-{}-", day_of(&stamp))) {
        return None;
    }
    let result = snapshot(conn, dir, &stamp, DAILY);
    prune(dir, DAILY, KEEP);
    Some(match result {
        Ok(p) => format!("daily backup written: {}", p.display()),
        Err(e) => format!("daily backup FAILED: {e}"),
    })
}

/// Takes the pre-migration snapshot if this app version has not made one.
/// Must run before any migration statement.
pub fn run_pre_migration(conn: &Connection, dir: &Path, version: &str, now: u64) -> Option<String> {
    if !has_user_data(conn) {
        return None;
    }
    let tag = format!("{PRE_MIGRATION}-v{version}");
    if already_has(dir, PRE_MIGRATION, &format!("-{tag}.db")) {
        return None;
    }
    let result = snapshot(conn, dir, &compact_stamp(now), &tag);
    prune(dir, PRE_MIGRATION, KEEP);
    Some(match result {
        Ok(p) => format!("pre-migration backup written: {}", p.display()),
        Err(e) => format!("pre-migration backup FAILED: {e}"),
    })
}

/// Startup entry point: call right after the connection opens, before
/// migrations. Failures are logged, never raised.
pub fn run_before_migrations(conn: &Connection, version: &str) {
    let Some(dir) = backups_dir() else { return };
    if let Some(line) = run_pre_migration(conn, &dir, version, now_secs()) {
        log_line(&line);
    }
}

/// Entry point for the launch-time and hourly daily check.
pub fn run_daily(conn: &Connection) {
    let Some(dir) = backups_dir() else { return };
    if let Some(line) = run_daily_if_due(conn, &dir, now_secs()) {
        log_line(&line);
    }
}

fn log_line(line: &str) {
    let level = if line.contains("FAILED") { "ERROR" } else { "INFO" };
    crate::logging::log(level, "backup", line);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seeded_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT);
             INSERT INTO documents VALUES ('a', 'First'), ('b', 'Second');",
        )
        .unwrap();
        conn
    }

    const DAY1: u64 = 1_760_302_333; // 2025-10-12
    const DAY: u64 = 86_400;

    #[test]
    fn snapshot_is_a_standalone_copy_of_the_data() {
        let dir = tempfile::tempdir().unwrap();
        let conn = seeded_db();
        let path = snapshot(&conn, dir.path(), "20251012-205213", DAILY).unwrap();
        conn.execute("DELETE FROM documents", []).unwrap();
        let copy = Connection::open(path).unwrap();
        let n: i64 = copy.query_row("SELECT COUNT(*) FROM documents", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 2);
        assert!(fs::read_dir(dir.path()).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".partial")));
    }

    #[test]
    fn fresh_database_is_not_backed_up() {
        let dir = tempfile::tempdir().unwrap();
        let empty = Connection::open_in_memory().unwrap();
        assert!(run_daily_if_due(&empty, dir.path(), DAY1).is_none());
        assert!(run_pre_migration(&empty, dir.path(), "1.0.0", DAY1).is_none());
        assert!(list(dir.path()).is_empty());
    }

    #[test]
    fn daily_runs_once_per_day() {
        let dir = tempfile::tempdir().unwrap();
        let conn = seeded_db();
        assert!(run_daily_if_due(&conn, dir.path(), DAY1).is_some());
        assert!(run_daily_if_due(&conn, dir.path(), DAY1 + 3_600).is_none());
        assert!(run_daily_if_due(&conn, dir.path(), DAY1 + DAY).is_some());
        assert_eq!(list(dir.path()).len(), 2);
    }

    #[test]
    fn keeps_only_the_newest_seven_daily_snapshots() {
        let dir = tempfile::tempdir().unwrap();
        let conn = seeded_db();
        for i in 0..10 {
            run_daily_if_due(&conn, dir.path(), DAY1 + i * DAY);
        }
        let names: Vec<String> = list(dir.path()).into_iter().map(|b| b.name).collect();
        assert_eq!(names.len(), KEEP);
        // Newest first, and the oldest three are gone.
        assert!(names[0].contains(&compact_stamp(DAY1 + 9 * DAY)[..8]));
        assert!(names.iter().all(|n| !n.contains(&compact_stamp(DAY1)[..8])));
    }

    #[test]
    fn pre_migration_runs_once_per_version_and_is_pruned_separately() {
        let dir = tempfile::tempdir().unwrap();
        let conn = seeded_db();
        assert!(run_pre_migration(&conn, dir.path(), "1.17.1", DAY1).is_some());
        assert!(run_pre_migration(&conn, dir.path(), "1.17.1", DAY1 + 60).is_none());
        assert!(run_pre_migration(&conn, dir.path(), "1.18.0", DAY1 + 120).is_some());
        for i in 0..10 {
            run_daily_if_due(&conn, dir.path(), DAY1 + i * DAY);
        }
        let all = list(dir.path());
        assert_eq!(all.iter().filter(|b| b.kind == PRE_MIGRATION).count(), 2);
        assert_eq!(all.iter().filter(|b| b.kind == DAILY).count(), KEEP);
    }

    #[test]
    fn prune_clears_interrupted_partial_copies_and_ignores_strangers() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("margin-20250101-000000-daily.db.partial"), b"x").unwrap();
        fs::write(dir.path().join("notes.txt"), b"keep me").unwrap();
        prune(dir.path(), DAILY, KEEP);
        assert!(!dir.path().join("margin-20250101-000000-daily.db.partial").exists());
        assert!(dir.path().join("notes.txt").exists());
    }
}
