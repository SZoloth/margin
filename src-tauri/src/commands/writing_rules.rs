use crate::db::migrations::DbPool;
use crate::commands::corrections::CorrectionRecord;
use rusqlite::Connection;

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WritingRule {
    pub id: String,
    pub writing_type: String,
    pub category: String,
    pub rule_text: String,
    pub when_to_apply: Option<String>,
    pub why: Option<String>,
    pub severity: String,
    pub example_before: Option<String>,
    pub example_after: Option<String>,
    pub source: String,
    pub signal_count: i64,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn rule_from_row(row: &rusqlite::Row) -> rusqlite::Result<WritingRule> {
    Ok(WritingRule {
        id: row.get(0)?,
        writing_type: row.get(1)?,
        category: row.get(2)?,
        rule_text: row.get(3)?,
        when_to_apply: row.get(4)?,
        why: row.get(5)?,
        severity: row.get(6)?,
        example_before: row.get(7)?,
        example_after: row.get(8)?,
        source: row.get(9)?,
        signal_count: row.get(10)?,
        notes: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

const RULES_SELECT: &str =
    "SELECT id, writing_type, category, rule_text, when_to_apply, why, severity,
            example_before, example_after, source, signal_count, notes, created_at, updated_at
     FROM writing_rules";

fn fetch_writing_rules(
    conn: &Connection,
    writing_type: Option<&str>,
) -> rusqlite::Result<Vec<WritingRule>> {
    match writing_type {
        Some(wt) => {
            let sql = format!("{RULES_SELECT} WHERE writing_type = ?1 ORDER BY signal_count DESC, created_at DESC");
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([wt], rule_from_row)?;
            rows.collect()
        }
        None => {
            let sql = format!("{RULES_SELECT} ORDER BY writing_type, signal_count DESC, created_at DESC");
            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([], rule_from_row)?;
            rows.collect()
        }
    }
}

/// Groups items by a string key, preserving insertion order.
fn group_by_key<'a, T, F>(items: &'a [T], key_fn: F) -> Vec<(&'a str, Vec<&'a T>)>
where
    F: Fn(&T) -> &str,
{
    let mut groups: Vec<(&'a str, Vec<&'a T>)> = Vec::new();
    let mut index: std::collections::HashMap<&'a str, usize> = std::collections::HashMap::new();

    for item in items {
        let key = key_fn(item);
        if let Some(&idx) = index.get(key) {
            groups[idx].1.push(item);
        } else {
            let idx = groups.len();
            index.insert(key, idx);
            groups.push((key, vec![item]));
        }
    }
    groups
}

fn generate_writing_rules_markdown(rules: &[WritingRule]) -> String {
    let mut lines = Vec::new();
    lines.push("# Writing Rules".to_string());
    lines.push(String::new());
    lines.push("_For AI agents: apply rules matching the writing type. General rules always apply._".to_string());

    let mut groups = group_by_key(rules, |r| &r.writing_type);

    // Sort: "general" first, then alphabetical
    groups.sort_by(|a, b| {
        if a.0 == "general" {
            std::cmp::Ordering::Less
        } else if b.0 == "general" {
            std::cmp::Ordering::Greater
        } else {
            a.0.cmp(&b.0)
        }
    });

    for (writing_type, group_rules) in &groups {
        lines.push(String::new());
        let label = match *writing_type {
            "general" => "General",
            "email" => "Email",
            "prd" => "PRD",
            "blog" => "Blog / essay",
            "cover-letter" => "Cover letter",
            "resume" => "Resume",
            "slack" => "Slack",
            "pitch" => "Pitch",
            "outreach" => "Outreach",
            other => other,
        };
        lines.push(format!("## {label}"));

        let cat_groups = group_by_key(group_rules, |r| &r.category);

        for (category, cat_rules) in &cat_groups {
            lines.push(String::new());
            let cat_label = category
                .replace('-', " ")
                .split_whitespace()
                .map(|w| {
                    let mut c = w.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().to_string() + c.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");
            lines.push(format!("### {cat_label}"));

            for rule in cat_rules {
                lines.push(String::new());
                lines.push(format!(
                    "**Rule: {}** [{}]",
                    rule.rule_text, rule.severity
                ));
                if let Some(when) = &rule.when_to_apply {
                    lines.push(format!("- When to apply: {when}"));
                }
                if let Some(why) = &rule.why {
                    lines.push(format!("- Why: {why}"));
                }
                lines.push(format!("- Signal: seen {} time(s)", rule.signal_count));
                if rule.example_before.is_some() || rule.example_after.is_some() {
                    lines.push("- Before -> After:".to_string());
                    if let Some(before) = &rule.example_before {
                        lines.push(format!("  - Before: \"{before}\""));
                    }
                    if let Some(after) = &rule.example_after {
                        lines.push(format!("  - After: \"{after}\""));
                    }
                }
                if let Some(notes) = &rule.notes {
                    lines.push(format!("- Notes: {notes}"));
                }
            }
        }
    }

    lines.push(String::new());
    lines.join("\n")
}

fn generate_writing_guard_py(rules: &[WritingRule]) -> String {
    // Collect kill words from must-fix rules
    let kill_words: Vec<&str> = rules
        .iter()
        .filter(|r| r.severity == "must-fix" && r.category == "kill-words")
        .map(|r| r.rule_text.as_str())
        .collect();

    // Collect slop patterns
    let slop_patterns: Vec<(&str, &str)> = rules
        .iter()
        .filter(|r| r.category == "ai-slop" && r.example_before.is_some())
        .filter_map(|r| {
            r.example_before
                .as_deref()
                .map(|pattern| (pattern, r.rule_text.as_str()))
        })
        .collect();

    // Build JSON data blobs for safety (no raw string embedding in Python source)
    let kill_words_json =
        serde_json::to_string(&kill_words).unwrap_or_else(|_| "[]".to_string());
    let slop_patterns_json = serde_json::to_string(
        &slop_patterns
            .iter()
            .map(|(p, e)| vec![*p, *e])
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| "[]".to_string());

    // Guard: `"""` in JSON would break the Python raw triple-quoted string delimiter.
    // serde_json escapes `"` as `\"` so this shouldn't happen in practice, but defend
    // against it since the generated file runs as a hook with full user permissions.
    if kill_words_json.contains(r#"""""#) || slop_patterns_json.contains(r#"""""#) {
        return "#!/usr/bin/env python3\n\
# ERROR: A writing rule contains a triple-quote sequence that cannot be safely\n\
# embedded. Remove the offending rule text and re-export.\n\
import sys; print('writing_guard: triple-quote injection blocked — skipping guard', file=sys.stderr); sys.exit(1)\n"
            .to_string();
    }

    format!(
        r#"#!/usr/bin/env python3
"""
Writing guard hook — AUTO-GENERATED by Margin's export_writing_rules command.
Do not edit manually. Changes will be overwritten.

Kill words and slop patterns are loaded from JSON data blobs for safety.
Source of truth: ~/.margin/margin.db (writing_rules table)
"""
import json, sys, re

# Only check prose file extensions
PROSE_EXTENSIONS = {{".md", ".mdx", ".txt", ".html", ".htm"}}

# Kill words — loaded from JSON for codegen safety.
# Use a *raw* triple-quoted string so Python doesn't interpret backslash escapes inside JSON.
KILL_WORDS = json.loads(r"""{kill_words_json}""")

# AI-slop sentence patterns — [pattern, explanation]
# Same raw-string rule as above.
SLOP_PATTERNS = json.loads(r"""{slop_patterns_json}""")

def get_extension(path):
    if not path:
        return ""
    dot = path.rfind(".")
    return path[dot:].lower() if dot != -1 else ""

def main():
    try:
        data = json.load(sys.stdin)
        tool = data.get("tool_name", "")
        inp = data.get("tool_input") or {{}}

        # Determine file path and text to check
        path = ""
        text = ""
        if tool == "Write":
            path = inp.get("file_path", "")
            text = inp.get("content", "")
        elif tool == "Edit":
            path = inp.get("file_path", "")
            text = inp.get("new_string", "")

        if not text or get_extension(path) not in PROSE_EXTENSIONS:
            sys.exit(0)

        violations = []

        # Check kill words
        lower = text.lower()
        for word in KILL_WORDS:
            if word in lower:
                violations.append(f'Kill word: "{{word}}"')

        # Check slop patterns
        for pattern, explanation in SLOP_PATTERNS:
            if re.search(pattern, text):
                violations.append(explanation)

        if violations:
            msg = "WRITING GUARD: AI-slop patterns detected:\n"
            for v in violations:
                msg += f"  - {{v}}\n"
            msg += "Rephrase to sound human. See ~/.margin/writing-rules.md for examples."

            print(json.dumps({{
                "hookSpecificOutput": {{
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": msg
                }}
            }}))

    except Exception as e:
        # Fail-open: never block writes due to hook errors
        print(f"Writing guard encountered an error (fail-open): {{e}}", file=sys.stderr)

    sys.exit(0)

if __name__ == "__main__":
    main()
"#
    )
}

fn write_export_files(markdown: &str, hook_py: &str) -> Result<(String, String), String> {
    // Write files
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;

    let md_path = home.join(".margin").join("writing-rules.md");
    if let Some(parent) = md_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .margin dir: {e}"))?;
    }

    let hook_path = home.join(".claude").join("hooks").join("writing_guard.py");
    if let Some(parent) = hook_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create hooks dir: {e}"))?;
    }

    let mut errors = Vec::new();

    if let Err(e) = std::fs::write(&md_path, markdown) {
        errors.push(format!("Failed to write {}: {e}", md_path.display()));
    }

    if let Err(e) = std::fs::write(&hook_path, hook_py) {
        errors.push(format!("Failed to write {}: {e}", hook_path.display()));
    } else {
        // Make hook executable
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Err(e) = std::fs::set_permissions(&hook_path, std::fs::Permissions::from_mode(0o755)) {
                eprintln!("Warning: could not set executable permission on {}: {e}", hook_path.display());
            }
        }
    }

    if !errors.is_empty() {
        return Err(errors.join("; "));
    }

    Ok((
        md_path.to_string_lossy().to_string(),
        hook_path.to_string_lossy().to_string(),
    ))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub markdown_path: String,
    pub hook_path: String,
    pub rule_count: usize,
}

fn update_rule(
    conn: &Connection,
    id: &str,
    rule_text: Option<&str>,
    severity: Option<&str>,
    when_to_apply: Option<&str>,
    why: Option<&str>,
    example_before: Option<&str>,
    example_after: Option<&str>,
    notes: Option<&str>,
) -> rusqlite::Result<()> {
    let now = now_millis();

    let mut set_parts = vec![format!("updated_at = ?1")];
    let mut param_list: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(now)];
    let mut param_idx = 2usize;

    if let Some(v) = rule_text {
        set_parts.push(format!("rule_text = ?{param_idx}"));
        param_list.push(Box::new(v.to_string()));
        param_idx += 1;
    }
    if let Some(v) = severity {
        set_parts.push(format!("severity = ?{param_idx}"));
        param_list.push(Box::new(v.to_string()));
        param_idx += 1;
    }
    if let Some(v) = when_to_apply {
        set_parts.push(format!("when_to_apply = ?{param_idx}"));
        param_list.push(Box::new(v.to_string()));
        param_idx += 1;
    }
    if let Some(v) = why {
        set_parts.push(format!("why = ?{param_idx}"));
        param_list.push(Box::new(v.to_string()));
        param_idx += 1;
    }
    if let Some(v) = example_before {
        set_parts.push(format!("example_before = ?{param_idx}"));
        param_list.push(Box::new(v.to_string()));
        param_idx += 1;
    }
    if let Some(v) = example_after {
        set_parts.push(format!("example_after = ?{param_idx}"));
        param_list.push(Box::new(v.to_string()));
        param_idx += 1;
    }
    if let Some(v) = notes {
        set_parts.push(format!("notes = ?{param_idx}"));
        param_list.push(Box::new(v.to_string()));
        param_idx += 1;
    }

    let sql = format!(
        "UPDATE writing_rules SET {} WHERE id = ?{param_idx}",
        set_parts.join(", ")
    );
    param_list.push(Box::new(id.to_string()));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        param_list.iter().map(|p| p.as_ref()).collect();
    let rows = conn.execute(&sql, param_refs.as_slice())?;
    if rows == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

fn delete_rule(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let rows = conn.execute("DELETE FROM writing_rules WHERE id = ?1", [id])?;
    if rows == 0 {
        return Err(rusqlite::Error::QueryReturnedNoRows);
    }
    Ok(())
}

#[tauri::command]
pub async fn update_writing_rule(
    state: tauri::State<'_, DbPool>,
    id: String,
    rule_text: Option<String>,
    severity: Option<String>,
    when_to_apply: Option<String>,
    why: Option<String>,
    example_before: Option<String>,
    example_after: Option<String>,
    notes: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    update_rule(
        &conn,
        &id,
        rule_text.as_deref(),
        severity.as_deref(),
        when_to_apply.as_deref(),
        why.as_deref(),
        example_before.as_deref(),
        example_after.as_deref(),
        notes.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_writing_rule(
    state: tauri::State<'_, DbPool>,
    id: String,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    delete_rule(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_writing_rules(
    state: tauri::State<'_, DbPool>,
    writing_type: Option<String>,
) -> Result<Vec<WritingRule>, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    fetch_writing_rules(&conn, writing_type.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_writing_rules(
    state: tauri::State<'_, DbPool>,
) -> Result<ExportResult, String> {
    // Hold the DB lock only long enough to read rules.
    let rules = {
        let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
        fetch_writing_rules(&conn, None).map_err(|e| e.to_string())?
    }; // lock dropped here

    let markdown = generate_writing_rules_markdown(&rules);
    let hook_py = generate_writing_guard_py(&rules);
    let (markdown_path, hook_path) = write_export_files(&markdown, &hook_py)?;

    Ok(ExportResult {
        markdown_path,
        hook_path,
        rule_count: rules.len(),
    })
}

fn fetch_all_corrections_for_profile(conn: &Connection) -> rusqlite::Result<Vec<CorrectionRecord>> {
    let mut stmt = conn.prepare(
        "SELECT original_text, notes_json, highlight_color, document_title, document_id, created_at, writing_type, polarity
         FROM corrections
         WHERE highlight_id != '__backfill_marker__'
         ORDER BY created_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        let notes_json: String = row.get(1)?;
        Ok(CorrectionRecord {
            original_text: row.get(0)?,
            notes: serde_json::from_str(&notes_json).unwrap_or_default(),
            highlight_color: row.get(2)?,
            document_title: row.get(3)?,
            document_id: row.get(4)?,
            created_at: row.get(5)?,
            writing_type: row.get(6)?,
            polarity: row.get(7)?,
        })
    })?;

    rows.collect()
}

fn truncate_with_ellipsis(text: &str, max_chars: usize) -> String {
    let mut iter = text.chars();
    let prefix: String = iter.by_ref().take(max_chars).collect();
    if iter.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

pub fn generate_voice_profile_markdown(corrections: &[CorrectionRecord], rules: &[WritingRule]) -> String {
    let mut lines = Vec::new();
    lines.push("# Voice Profile".to_string());
    lines.push(String::new());
    lines.push("_Generated by Margin. A living profile of your writing voice._".to_string());

    let mut positive: Vec<&CorrectionRecord> = Vec::new();
    let mut corrective: Vec<&CorrectionRecord> = Vec::new();
    let mut unclassified: Vec<&CorrectionRecord> = Vec::new();

    for c in corrections {
        match c.polarity.as_deref() {
            Some("positive") => positive.push(c),
            Some("corrective") => corrective.push(c),
            _ => unclassified.push(c),
        }
    }

    if !positive.is_empty() {
        lines.push(String::new());
        lines.push("## Writing Samples".to_string());
        lines.push(String::new());
        lines.push("_Patterns to emulate — do more of this._".to_string());
        for c in &positive {
            lines.push(String::new());
            let snippet = truncate_with_ellipsis(&c.original_text, 200);
            lines.push(format!("> {}", snippet.replace('\n', "\n> ")));
            if !c.notes.is_empty() {
                lines.push(format!("— {}", c.notes.join("; ")));
            }
        }
    }

    if !corrective.is_empty() {
        lines.push(String::new());
        lines.push("## Corrections".to_string());
        lines.push(String::new());
        lines.push("_Patterns to avoid — don't do this._".to_string());
        for c in &corrective {
            lines.push(String::new());
            let snippet = truncate_with_ellipsis(&c.original_text, 200);
            lines.push(format!("- **{}** → {}", snippet, c.notes.join("; ")));
        }
    }

    if !unclassified.is_empty() {
        lines.push(String::new());
        lines.push("## Unclassified".to_string());
        lines.push(String::new());
        lines.push("_These annotations haven't been tagged as positive or corrective yet._".to_string());
        for c in &unclassified {
            lines.push(String::new());
            let snippet = truncate_with_ellipsis(&c.original_text, 120);
            let note = if c.notes.is_empty() { "flagged".to_string() } else { c.notes.join("; ") };
            lines.push(format!("- {} → {}", snippet, note));
        }
    }

    if !rules.is_empty() {
        lines.push(String::new());
        lines.push("## Writing Rules".to_string());
        lines.push(String::new());
        for rule in rules {
            lines.push(format!("- **{}** [{}]", rule.rule_text, rule.severity));
        }
    }

    lines.push(String::new());
    lines.join("\n")
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProfileExportResult {
    pub path: String,
    pub positive_count: usize,
    pub corrective_count: usize,
    pub unclassified_count: usize,
    pub rule_count: usize,
}

#[tauri::command]
pub async fn export_voice_profile(
    state: tauri::State<'_, DbPool>,
) -> Result<VoiceProfileExportResult, String> {
    let (corrections, rules) = {
        let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
        let corrections = fetch_all_corrections_for_profile(&conn).map_err(|e| e.to_string())?;
        let rules = fetch_writing_rules(&conn, None).map_err(|e| e.to_string())?;
        (corrections, rules)
    };

    let markdown = generate_voice_profile_markdown(&corrections, &rules);

    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let path = home.join(".margin").join("voice-profile.md");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .margin dir: {e}"))?;
    }
    std::fs::write(&path, &markdown)
        .map_err(|e| format!("Failed to write voice profile: {e}"))?;

    let positive_count = corrections.iter().filter(|c| c.polarity.as_deref() == Some("positive")).count();
    let corrective_count = corrections.iter().filter(|c| c.polarity.as_deref() == Some("corrective")).count();
    let unclassified_count = corrections.len() - positive_count - corrective_count;

    Ok(VoiceProfileExportResult {
        path: path.to_string_lossy().to_string(),
        positive_count,
        corrective_count,
        unclassified_count,
        rule_count: rules.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::migrate_add_writing_rules_table;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate_add_writing_rules_table(&conn).unwrap();
        conn
    }

    fn insert_rule(conn: &Connection, id: &str, writing_type: &str, category: &str, rule_text: &str, severity: &str) {
        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, signal_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'manual', 1, 1000, 1000)",
            rusqlite::params![id, writing_type, category, rule_text, severity],
        ).unwrap();
    }

    fn insert_full_rule(
        conn: &Connection,
        id: &str,
        writing_type: &str,
        category: &str,
        rule_text: &str,
        severity: &str,
        when_to_apply: Option<&str>,
        why: Option<&str>,
        example_before: Option<&str>,
        example_after: Option<&str>,
        signal_count: i64,
    ) {
        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, when_to_apply, why, severity,
             example_before, example_after, source, signal_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'manual', ?10, 1000, 1000)",
            rusqlite::params![id, writing_type, category, rule_text, when_to_apply, why, severity, example_before, example_after, signal_count],
        ).unwrap();
    }

    // --- fetch_writing_rules tests ---

    #[test]
    fn get_writing_rules_returns_all() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "ai-slop", "No parallelism", "must-fix");
        insert_rule(&conn, "r2", "email", "tone", "Be direct", "should-fix");

        let rules = fetch_writing_rules(&conn, None).unwrap();
        assert_eq!(rules.len(), 2);
    }

    #[test]
    fn get_writing_rules_filters_by_type() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "ai-slop", "No parallelism", "must-fix");
        insert_rule(&conn, "r2", "email", "tone", "Be direct", "should-fix");
        insert_rule(&conn, "r3", "email", "hedging", "No hedging", "should-fix");

        let rules = fetch_writing_rules(&conn, Some("email")).unwrap();
        assert_eq!(rules.len(), 2);
        assert!(rules.iter().all(|r| r.writing_type == "email"));
    }

    #[test]
    fn get_writing_rules_empty_db() {
        let conn = setup_db();
        let rules = fetch_writing_rules(&conn, None).unwrap();
        assert!(rules.is_empty());
    }

    // --- generate_writing_rules_markdown tests ---

    #[test]
    fn markdown_has_header_and_agent_instruction() {
        let rules = vec![];
        let md = generate_writing_rules_markdown(&rules);
        assert!(md.contains("# Writing Rules"));
        assert!(md.contains("_For AI agents:"));
    }

    #[test]
    fn markdown_groups_by_writing_type() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "ai-slop", "No parallelism", "must-fix");
        insert_rule(&conn, "r2", "blog", "structure", "Use transitions", "should-fix");
        insert_rule(&conn, "r3", "general", "tone", "Be human", "should-fix");

        let rules = fetch_writing_rules(&conn, None).unwrap();
        let md = generate_writing_rules_markdown(&rules);

        assert!(md.contains("## General"));
        assert!(md.contains("## Blog / essay"));

        // General should come before Blog
        let gen_pos = md.find("## General").unwrap();
        let blog_pos = md.find("## Blog / essay").unwrap();
        assert!(gen_pos < blog_pos);
    }

    #[test]
    fn markdown_includes_rule_details() {
        let conn = setup_db();
        insert_full_rule(
            &conn, "r1", "general", "ai-slop", "No negative parallelism", "must-fix",
            Some("Any sentence with isn't X, it's Y"), Some("AI slop marker"),
            Some("The issue isn't X. It's Y."), Some("State directly: Y is the real issue."),
            3,
        );

        let rules = fetch_writing_rules(&conn, None).unwrap();
        let md = generate_writing_rules_markdown(&rules);

        assert!(md.contains("**Rule: No negative parallelism** [must-fix]"));
        assert!(md.contains("- When to apply: Any sentence with isn't X, it's Y"));
        assert!(md.contains("- Why: AI slop marker"));
        assert!(md.contains("- Signal: seen 3 time(s)"));
        assert!(md.contains("Before: \"The issue isn't X. It's Y.\""));
        assert!(md.contains("After: \"State directly: Y is the real issue.\""));
    }

    // --- generate_writing_guard_py tests ---

    #[test]
    fn hook_has_autogen_header() {
        let py = generate_writing_guard_py(&[]);
        assert!(py.contains("AUTO-GENERATED by Margin"));
        assert!(py.contains("Do not edit manually"));
    }

    #[test]
    fn hook_has_fail_open() {
        let py = generate_writing_guard_py(&[]);
        assert!(py.contains("fail-open"));
        assert!(py.contains("except Exception"));
    }

    #[test]
    fn hook_uses_raw_strings_for_embedded_json() {
        let py = generate_writing_guard_py(&[]);
        assert!(py.contains(r#"KILL_WORDS = json.loads(r""#));
        assert!(py.contains(r#"SLOP_PATTERNS = json.loads(r""#));
    }

    #[test]
    fn hook_includes_kill_words() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "kill-words", "demonstrating", "must-fix");
        insert_rule(&conn, "r2", "general", "kill-words", "leveraging", "must-fix");
        // This should NOT appear (wrong category)
        insert_rule(&conn, "r3", "general", "tone", "Be direct", "must-fix");

        let rules = fetch_writing_rules(&conn, None).unwrap();
        let py = generate_writing_guard_py(&rules);

        assert!(py.contains("demonstrating"));
        assert!(py.contains("leveraging"));
        // KILL_WORDS should be loaded from JSON
        assert!(py.contains("KILL_WORDS = json.loads("));
    }

    #[test]
    fn hook_includes_slop_patterns() {
        let conn = setup_db();
        insert_full_rule(
            &conn, "r1", "general", "ai-slop", "Negative parallelism detected", "should-fix",
            None, None,
            Some(r"(?:The (?:issue|problem) isn't .{5,60}\. It's )"),
            None, 1,
        );

        let rules = fetch_writing_rules(&conn, None).unwrap();
        let py = generate_writing_guard_py(&rules);

        assert!(py.contains("SLOP_PATTERNS = json.loads("));
        assert!(py.contains("Negative parallelism detected"));
    }

    #[test]
    fn hook_handles_special_chars_in_rules() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "kill-words", "it's \"tricky\"", "must-fix");

        let rules = fetch_writing_rules(&conn, None).unwrap();
        let py = generate_writing_guard_py(&rules);

        // Should produce valid Python — the JSON handles escaping
        assert!(py.contains("KILL_WORDS = json.loads("));
        // Verify the JSON is parseable
        let kill_line = py.lines()
            .find(|l| l.starts_with("KILL_WORDS = json.loads("))
            .unwrap();
        let json_str = &kill_line["KILL_WORDS = json.loads(r\"\"\"".len()..kill_line.len() - "\"\"\")".len()];
        let parsed: Vec<String> = serde_json::from_str(json_str).unwrap();
        assert_eq!(parsed, vec!["it's \"tricky\""]);
    }

    // --- update_rule tests ---

    #[test]
    fn update_rule_changes_rule_text() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "tone", "Be direct", "should-fix");

        update_rule(&conn, "r1", Some("Be very direct"), None, None, None, None, None, None).unwrap();

        let text: String = conn
            .query_row("SELECT rule_text FROM writing_rules WHERE id = 'r1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(text, "Be very direct");
    }

    #[test]
    fn update_rule_changes_severity() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "tone", "Be direct", "should-fix");

        update_rule(&conn, "r1", None, Some("must-fix"), None, None, None, None, None).unwrap();

        let sev: String = conn
            .query_row("SELECT severity FROM writing_rules WHERE id = 'r1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sev, "must-fix");
    }

    #[test]
    fn update_rule_changes_multiple_fields() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "tone", "Be direct", "should-fix");

        update_rule(
            &conn, "r1",
            Some("Be concise"),
            Some("must-fix"),
            Some("Always"),
            Some("Clarity"),
            Some("Long sentence"),
            Some("Short"),
            Some("A note"),
        ).unwrap();

        let (text, sev, when, why): (String, String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT rule_text, severity, when_to_apply, why FROM writing_rules WHERE id = 'r1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .unwrap();
        assert_eq!(text, "Be concise");
        assert_eq!(sev, "must-fix");
        assert_eq!(when, Some("Always".to_string()));
        assert_eq!(why, Some("Clarity".to_string()));
    }

    #[test]
    fn update_rule_nonexistent_fails() {
        let conn = setup_db();
        let result = update_rule(&conn, "nonexistent", Some("text"), None, None, None, None, None, None);
        assert!(result.is_err());
    }

    #[test]
    fn update_rule_updates_timestamp() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "tone", "Be direct", "should-fix");

        let old_ts: i64 = conn
            .query_row("SELECT updated_at FROM writing_rules WHERE id = 'r1'", [], |r| r.get(0))
            .unwrap();

        update_rule(&conn, "r1", Some("Be very direct"), None, None, None, None, None, None).unwrap();

        let new_ts: i64 = conn
            .query_row("SELECT updated_at FROM writing_rules WHERE id = 'r1'", [], |r| r.get(0))
            .unwrap();
        assert!(new_ts > old_ts);
    }

    // --- delete_rule tests ---

    #[test]
    fn delete_rule_removes_row() {
        let conn = setup_db();
        insert_rule(&conn, "r1", "general", "tone", "Be direct", "should-fix");
        insert_rule(&conn, "r2", "email", "tone", "Be brief", "should-fix");

        delete_rule(&conn, "r1").unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM writing_rules", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn delete_rule_nonexistent_fails() {
        let conn = setup_db();
        let result = delete_rule(&conn, "nonexistent");
        assert!(result.is_err());
    }

    // --- voice profile tests ---

    #[test]
    fn voice_profile_empty_db() {
        let corrections: Vec<CorrectionRecord> = vec![];
        let rules: Vec<WritingRule> = vec![];
        let md = generate_voice_profile_markdown(&corrections, &rules);
        assert!(md.contains("# Voice Profile"));
    }

    #[test]
    fn voice_profile_groups_by_polarity() {
        let corrections = vec![
            CorrectionRecord {
                original_text: "This sentence sings.".to_string(),
                notes: vec!["Great rhythm".to_string()],
                highlight_color: "green".to_string(),
                document_title: Some("Essay".to_string()),
                document_id: "doc1".to_string(),
                created_at: 1000,
                writing_type: None,
                polarity: Some("positive".to_string()),
            },
            CorrectionRecord {
                original_text: "Very bad sentence.".to_string(),
                notes: vec!["Rewrite".to_string()],
                highlight_color: "yellow".to_string(),
                document_title: Some("Essay".to_string()),
                document_id: "doc1".to_string(),
                created_at: 2000,
                writing_type: None,
                polarity: Some("corrective".to_string()),
            },
            CorrectionRecord {
                original_text: "Untagged sentence.".to_string(),
                notes: vec![],
                highlight_color: "yellow".to_string(),
                document_title: Some("Essay".to_string()),
                document_id: "doc1".to_string(),
                created_at: 3000,
                writing_type: None,
                polarity: None,
            },
        ];
        let rules: Vec<WritingRule> = vec![];
        let md = generate_voice_profile_markdown(&corrections, &rules);

        assert!(md.contains("## Writing Samples"));
        assert!(md.contains("This sentence sings."));
        assert!(md.contains("## Corrections"));
        assert!(md.contains("Very bad sentence."));
        assert!(md.contains("## Unclassified"));
        assert!(md.contains("Untagged sentence."));
    }

    #[test]
    fn voice_profile_includes_rules() {
        let corrections: Vec<CorrectionRecord> = vec![];
        let rules = vec![
            WritingRule {
                id: "r1".to_string(),
                writing_type: "general".to_string(),
                category: "tone".to_string(),
                rule_text: "Be direct".to_string(),
                when_to_apply: None,
                why: None,
                severity: "should-fix".to_string(),
                example_before: None,
                example_after: None,
                source: "manual".to_string(),
                signal_count: 1,
                notes: None,
                created_at: 1000,
                updated_at: 1000,
            },
            WritingRule {
                id: "r2".to_string(),
                writing_type: "email".to_string(),
                category: "hedging".to_string(),
                rule_text: "No hedging".to_string(),
                when_to_apply: None,
                why: None,
                severity: "must-fix".to_string(),
                example_before: None,
                example_after: None,
                source: "manual".to_string(),
                signal_count: 2,
                notes: None,
                created_at: 2000,
                updated_at: 2000,
            },
        ];
        let md = generate_voice_profile_markdown(&corrections, &rules);

        assert!(md.contains("## Writing Rules"));
        assert!(md.contains("Be direct"));
        assert!(md.contains("No hedging"));
    }

    #[test]
    fn voice_profile_unicode_truncation_does_not_panic() {
        let long_emoji = "🙂".repeat(250);
        let long_han = "漢".repeat(130);
        let corrections = vec![
            CorrectionRecord {
                original_text: long_emoji,
                notes: vec![],
                highlight_color: "green".to_string(),
                document_title: Some("Essay".to_string()),
                document_id: "doc1".to_string(),
                created_at: 1000,
                writing_type: None,
                polarity: Some("positive".to_string()),
            },
            CorrectionRecord {
                original_text: long_han,
                notes: vec![],
                highlight_color: "yellow".to_string(),
                document_title: Some("Essay".to_string()),
                document_id: "doc1".to_string(),
                created_at: 2000,
                writing_type: None,
                polarity: None,
            },
        ];

        let md = generate_voice_profile_markdown(&corrections, &[]);
        assert!(md.contains("## Writing Samples"));
        assert!(md.contains("## Unclassified"));
        assert!(md.contains('…'));
    }
}
