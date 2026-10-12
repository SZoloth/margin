//! Plain-text diagnostics report that a user can paste into a bug report.
//!
//! Contains versions, row counts, backup names and the tail of the log. It
//! never includes document text, highlights, or rule content, and the home
//! directory is replaced with `~` so usernames stay out of it.

use crate::backup::BackupInfo;
use crate::logging::format_utc;

pub struct ReportInput<'a> {
    pub app_version: &'a str,
    pub os: &'a str,
    pub arch: &'a str,
    pub generated_at: u64,
    pub db_bytes: Option<u64>,
    pub counts: &'a [(&'a str, i64)],
    pub backups: &'a [BackupInfo],
    pub log_tail: &'a str,
    pub home: Option<&'a str>,
}

pub fn redact_home(text: &str, home: Option<&str>) -> String {
    match home {
        Some(h) if !h.is_empty() => text.replace(h, "~"),
        _ => text.to_string(),
    }
}

fn human_bytes(n: u64) -> String {
    if n >= 1_048_576 {
        format!("{:.1} MB", n as f64 / 1_048_576.0)
    } else {
        format!("{} KB", (n + 1_023) / 1_024)
    }
}

pub fn build_report(i: &ReportInput) -> String {
    let mut out = String::new();
    out.push_str("Margin diagnostics\n");
    out.push_str(&format!("Generated: {}\n", format_utc(i.generated_at)));
    out.push_str(&format!("Version: {}\n", i.app_version));
    out.push_str(&format!("System: {} {}\n", i.os, i.arch));
    match i.db_bytes {
        Some(b) => out.push_str(&format!("Database: {}\n", human_bytes(b))),
        None => out.push_str("Database: not found\n"),
    }
    for (name, n) in i.counts {
        out.push_str(&format!("  {name}: {n}\n"));
    }
    out.push_str(&format!("\nBackups ({}):\n", i.backups.len()));
    if i.backups.is_empty() {
        out.push_str("  none yet\n");
    }
    for b in i.backups {
        out.push_str(&format!("  {} ({})\n", b.name, human_bytes(b.size_bytes)));
    }
    out.push_str("\nRecent log:\n");
    if i.log_tail.trim().is_empty() {
        out.push_str("  (empty)\n");
    } else {
        out.push_str(i.log_tail);
        out.push('\n');
    }
    redact_home(&out, i.home)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input<'a>(backups: &'a [BackupInfo], counts: &'a [(&'a str, i64)], tail: &'a str) -> ReportInput<'a> {
        ReportInput {
            app_version: "1.17.1",
            os: "macos",
            arch: "aarch64",
            generated_at: 0,
            db_bytes: Some(2_500_000),
            counts,
            backups,
            log_tail: tail,
            home: Some("/Users/sam"),
        }
    }

    #[test]
    fn report_lists_versions_counts_and_backups() {
        let backups = [BackupInfo { name: "margin-20251012-000000-daily.db".into(), kind: "daily".into(), size_bytes: 2_000_000 }];
        let r = build_report(&input(&backups, &[("documents", 4), ("writing_rules", 21)], "line"));
        assert!(r.contains("Version: 1.17.1"));
        assert!(r.contains("Database: 2.4 MB"));
        assert!(r.contains("  writing_rules: 21"));
        assert!(r.contains("margin-20251012-000000-daily.db (1.9 MB)"));
        assert!(r.contains("Generated: 1970-01-01T00:00:00Z"));
    }

    #[test]
    fn report_strips_the_home_directory() {
        let r = build_report(&input(&[], &[], "panic at /Users/sam/Projects/x.rs:1"));
        assert!(!r.contains("/Users/sam"));
        assert!(r.contains("panic at ~/Projects/x.rs:1"));
    }

    #[test]
    fn empty_states_read_plainly() {
        let r = build_report(&input(&[], &[], "  "));
        assert!(r.contains("none yet"));
        assert!(r.contains("(empty)"));
    }
}
