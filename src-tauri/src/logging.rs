//! Crash and error log at `~/.margin/logs/margin.log`.
//!
//! Plain text, one entry per line (continuation lines are indented), rotated
//! at 1 MB with one previous file kept. Everything here is best effort: a
//! logger that can fail the app is worse than no logger.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

const MAX_BYTES: u64 = 1_000_000;
const MAX_MESSAGE_CHARS: usize = 4_000;

pub fn margin_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".margin"))
}

pub fn logs_dir() -> Option<PathBuf> {
    margin_dir().map(|d| d.join("logs"))
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Converts Unix seconds to (year, month, day, hour, minute, second) in UTC.
pub fn utc_parts(secs: u64) -> (i64, u32, u32, u32, u32, u32) {
    let days = (secs / 86_400) as i64;
    let rem = (secs % 86_400) as u32;
    // Howard Hinnant's civil-from-days algorithm.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m, d, rem / 3_600, (rem % 3_600) / 60, rem % 60)
}

/// `2026-10-12T20:52:13Z`
pub fn format_utc(secs: u64) -> String {
    let (y, mo, d, h, mi, s) = utc_parts(secs);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

/// `20261012-205213`, fixed width so names sort chronologically.
pub fn compact_stamp(secs: u64) -> String {
    let (y, mo, d, h, mi, s) = utc_parts(secs);
    format!("{y:04}{mo:02}{d:02}-{h:02}{mi:02}{s:02}")
}

fn log_path(dir: &Path) -> PathBuf {
    dir.join("margin.log")
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let cut: String = s.chars().take(max).collect();
        format!("{cut}… [truncated]")
    }
}

/// Appends one entry to `dir/margin.log`, rotating first if the file is full.
pub fn append_to(
    dir: &Path,
    level: &str,
    source: &str,
    message: &str,
    now: u64,
) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let path = log_path(dir);
    if fs::metadata(&path).map(|m| m.len()).unwrap_or(0) >= MAX_BYTES {
        let _ = fs::rename(&path, dir.join("margin.log.1"));
    }
    let body = truncate_chars(message, MAX_MESSAGE_CHARS).replace('\n', "\n    ");
    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    writeln!(file, "{} [{}] {}: {}", format_utc(now), level, source, body)
}

/// Best-effort log to the default location.
pub fn log(level: &str, source: &str, message: &str) {
    if let Some(dir) = logs_dir() {
        let _ = append_to(&dir, level, source, message, now_secs());
    }
}

/// Last `max_lines` lines of the current log (empty string if none).
pub fn tail(dir: &Path, max_lines: usize) -> String {
    let text = fs::read_to_string(log_path(dir)).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

/// Routes panics to the log (with a backtrace) before the default hook runs.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let name = thread.name().unwrap_or("unnamed");
        let backtrace = std::backtrace::Backtrace::force_capture();
        log(
            "PANIC",
            "rust",
            &format!("thread '{name}' {info}\n{backtrace}"),
        );
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_known_instants() {
        assert_eq!(format_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_utc(1_760_302_333), "2025-10-12T20:52:13Z");
        // Leap day.
        assert_eq!(format_utc(1_709_208_000), "2024-02-29T12:00:00Z");
        assert_eq!(compact_stamp(1_760_302_333), "20251012-205213");
    }

    #[test]
    fn appends_entries_with_indented_continuations() {
        let dir = tempfile::tempdir().unwrap();
        append_to(dir.path(), "ERROR", "ui", "boom\nat foo\nat bar", 0).unwrap();
        append_to(dir.path(), "INFO", "ui", "ok", 60).unwrap();
        let text = fs::read_to_string(dir.path().join("margin.log")).unwrap();
        assert_eq!(
            text,
            "1970-01-01T00:00:00Z [ERROR] ui: boom\n    at foo\n    at bar\n1970-01-01T00:01:00Z [INFO] ui: ok\n"
        );
    }

    #[test]
    fn rotates_when_full_and_keeps_one_previous_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("margin.log"), vec![b'x'; MAX_BYTES as usize]).unwrap();
        append_to(dir.path(), "INFO", "t", "fresh", 0).unwrap();
        assert!(dir.path().join("margin.log.1").exists());
        let text = fs::read_to_string(dir.path().join("margin.log")).unwrap();
        assert!(text.contains("fresh") && text.len() < 200);
    }

    #[test]
    fn truncates_runaway_messages() {
        let dir = tempfile::tempdir().unwrap();
        append_to(dir.path(), "ERROR", "ui", &"a".repeat(50_000), 0).unwrap();
        let len = fs::metadata(dir.path().join("margin.log")).unwrap().len();
        assert!(len < 5_000, "log entry was {len} bytes");
    }

    #[test]
    fn tail_returns_only_the_last_lines() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..5 {
            append_to(dir.path(), "INFO", "t", &format!("m{i}"), i).unwrap();
        }
        let t = tail(dir.path(), 2);
        assert_eq!(t.lines().count(), 2);
        assert!(t.contains("m4") && !t.contains("m2"));
        assert_eq!(tail(&dir.path().join("missing"), 2), "");
    }
}
