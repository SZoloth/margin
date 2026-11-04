//! First run: the sample draft lives on disk so it behaves like any opened
//! file, and "Never write this" turns a highlighted phrase into a Hard rule
//! on the spot, with no Claude in the loop.

use crate::commands::now_millis;
use crate::commands::writing_rules::{export_artifacts, WritingRule};
use crate::db::migrations::DbPool;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Longest phrase "Never write this" accepts. A kill word is a word or a
/// phrase; a whole sentence would never match again and belongs in a note.
pub(crate) const MAX_NEVER_PHRASE_CHARS: usize = 60;

pub(crate) fn sample_path(home: &Path) -> PathBuf {
    home.join(".margin").join("samples").join("first-draft.md")
}

/// Writes the sample unless it already exists, so a user's own marks on it
/// (and any edits) survive a second launch. Returns its path.
pub(crate) fn write_sample(home: &Path, content: &str) -> Result<PathBuf, String> {
    let path = sample_path(home);
    if !path.exists() {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

/// Collapses whitespace and lowercases: the guard matches kill words with
/// `word in text.lower()`, so a kill word with a capital never matches.
pub(crate) fn normalize_phrase(phrase: &str) -> String {
    phrase.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// A must-fix kill word for all writing types. Marking the same phrase again
/// counts as another signal and brings back an archived rule.
pub(crate) fn create_never_rule(
    conn: &Connection,
    phrase: &str,
    why: Option<&str>,
) -> Result<WritingRule, String> {
    let text = normalize_phrase(phrase);
    let text = text.trim_matches(|c: char| !c.is_alphanumeric());
    if text.is_empty() {
        return Err("Select a word or phrase first.".into());
    }
    if text.chars().count() > MAX_NEVER_PHRASE_CHARS {
        return Err(format!(
            "That's too long to ban word for word (over {MAX_NEVER_PHRASE_CHARS} characters). Leave a note instead."
        ));
    }
    let now = now_millis();
    conn.execute(
        "INSERT INTO writing_rules (id, writing_type, category, rule_text, why, severity, example_before,
                                    source, signal_count, created_at, updated_at, reviewed_at)
         VALUES (?1, 'general', 'kill-words', ?2, ?3, 'must-fix', ?4, 'highlight', 1, ?5, ?5, ?5)
         ON CONFLICT(writing_type, category, rule_text) DO UPDATE SET
           signal_count = writing_rules.signal_count + 1,
           severity = 'must-fix',
           archived_at = NULL,
           updated_at = excluded.updated_at",
        rusqlite::params![Uuid::new_v4().to_string(), text, why, phrase.trim(), now],
    )
    .map_err(|e| e.to_string())?;

    let rules = crate::commands::writing_rules::fetch_writing_rules(conn, Some("general"))
        .map_err(|e| e.to_string())?;
    rules
        .into_iter()
        .find(|r| r.category == "kill-words" && r.rule_text == text)
        .ok_or_else(|| "Rule was not saved.".into())
}

#[tauri::command]
pub async fn write_first_run_sample(content: String) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let path = write_sample(&home, &content)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn create_never_write_rule(
    state: tauri::State<'_, DbPool>,
    phrase: String,
    why: Option<String>,
) -> Result<WritingRule, String> {
    let rule = {
        let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
        create_never_rule(&conn, &phrase, why.as_deref())?
    };
    // Mutation committed: regenerate artifacts (single writer, via the CLI).
    export_artifacts();
    Ok(rule)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::{
        migrate_add_writing_rules_table, migrate_writing_rules_add_archived_at,
        migrate_writing_rules_add_detection_pattern,
    };

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();
        for col in [
            "reviewed_at INTEGER",
            "register TEXT",
            "polarity TEXT",
        ] {
            let name = col.split(' ').next().unwrap();
            let exists: bool = conn
                .prepare("PRAGMA table_info(writing_rules)")
                .unwrap()
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .filter_map(|r| r.ok())
                .any(|c| c == name);
            if !exists {
                conn.execute_batch(&format!("ALTER TABLE writing_rules ADD COLUMN {col};"))
                    .unwrap();
            }
        }
        migrate_writing_rules_add_detection_pattern(&conn).unwrap();
        migrate_writing_rules_add_archived_at(&conn).unwrap();
        conn
    }

    #[test]
    fn never_rule_is_a_lowercase_must_fix_kill_word_for_all_writing() {
        let conn = setup_db();
        let rule = create_never_rule(&conn, "  Delve\n into ", Some("From your mark")).unwrap();
        assert_eq!(rule.rule_text, "delve into");
        assert_eq!(rule.category, "kill-words");
        assert_eq!(rule.severity, "must-fix");
        assert_eq!(rule.writing_type, "general");
        assert_eq!(rule.source, "highlight");
        assert_eq!(rule.example_before.as_deref(), Some("Delve\n into"));
        assert_eq!(rule.why.as_deref(), Some("From your mark"));
        // Made by the user, so it is in effect, not a suggestion to review.
        assert!(rule.reviewed_at.is_some());
    }

    #[test]
    fn never_rule_strips_surrounding_punctuation() {
        let conn = setup_db();
        let rule = create_never_rule(&conn, "“leverage,”", None).unwrap();
        assert_eq!(rule.rule_text, "leverage");
    }

    #[test]
    fn marking_the_same_phrase_again_adds_a_signal_and_unarchives() {
        let conn = setup_db();
        let first = create_never_rule(&conn, "leverage", None).unwrap();
        conn.execute(
            "UPDATE writing_rules SET archived_at = 1 WHERE id = ?1",
            [&first.id],
        )
        .unwrap();
        let again = create_never_rule(&conn, "Leverage", None).unwrap();
        assert_eq!(again.id, first.id);
        assert_eq!(again.signal_count, 2);
        assert!(again.archived_at.is_none());
    }

    #[test]
    fn never_rule_rejects_empty_and_long_selections() {
        let conn = setup_db();
        assert!(create_never_rule(&conn, " … ", None).is_err());
        let long = "word ".repeat(20);
        assert!(create_never_rule(&conn, &long, None).is_err());
    }

    #[test]
    fn sample_is_written_once_and_kept() {
        let home = std::env::temp_dir().join(format!("margin-sample-{}", Uuid::new_v4()));
        let path = write_sample(&home, "first").unwrap();
        assert_eq!(path, sample_path(&home));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "first");
        write_sample(&home, "second").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "first");
        std::fs::remove_dir_all(&home).unwrap();
    }
}
