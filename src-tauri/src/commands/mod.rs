pub mod annotations;
pub mod corrections;
pub mod documents;
pub mod files;
pub mod keep_local;
pub mod search;
pub mod seed_rules;
pub mod snapshots;
pub mod tabs;
pub mod writing_rules;

/// Returns the current time as milliseconds since the Unix epoch.
pub(crate) fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
