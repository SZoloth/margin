use crate::db::migrations::DbPool;
use rusqlite::Connection;

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

fn fetch_writing_rules(
    conn: &Connection,
    writing_type: Option<&str>,
) -> rusqlite::Result<Vec<WritingRule>> {
    let (sql, params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = match writing_type {
        Some(wt) => (
            "SELECT id, writing_type, category, rule_text, when_to_apply, why, severity,
                    example_before, example_after, source, signal_count, notes, created_at, updated_at
             FROM writing_rules WHERE writing_type = ?1
             ORDER BY signal_count DESC, created_at DESC",
            vec![Box::new(wt.to_string()) as Box<dyn rusqlite::types::ToSql>],
        ),
        None => (
            "SELECT id, writing_type, category, rule_text, when_to_apply, why, severity,
                    example_before, example_after, source, signal_count, notes, created_at, updated_at
             FROM writing_rules
             ORDER BY writing_type, signal_count DESC, created_at DESC",
            vec![],
        ),
    };

    let mut stmt = conn.prepare(sql)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(param_refs.as_slice(), |row| {
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
    })?;

    rows.collect()
}

fn generate_writing_rules_markdown(rules: &[WritingRule]) -> String {
    let mut lines = Vec::new();
    lines.push("# Writing Rules".to_string());
    lines.push(String::new());
    lines.push("_For AI agents: apply rules matching the writing type. General rules always apply._".to_string());

    // Group by writing_type
    let mut groups: Vec<(String, Vec<&WritingRule>)> = Vec::new();
    let mut group_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    // Ensure "general" comes first
    for rule in rules {
        if let Some(&idx) = group_map.get(&rule.writing_type) {
            groups[idx].1.push(rule);
        } else {
            let idx = groups.len();
            group_map.insert(rule.writing_type.clone(), idx);
            groups.push((rule.writing_type.clone(), vec![rule]));
        }
    }

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
        let label = match writing_type.as_str() {
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

        // Sub-group by category
        let mut cat_groups: Vec<(String, Vec<&&WritingRule>)> = Vec::new();
        let mut cat_map: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();

        for rule in group_rules {
            if let Some(&idx) = cat_map.get(&rule.category) {
                cat_groups[idx].1.push(rule);
            } else {
                let idx = cat_groups.len();
                cat_map.insert(rule.category.clone(), idx);
                cat_groups.push((rule.category.clone(), vec![rule]));
            }
        }

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
            let _ = std::fs::set_permissions(&hook_path, std::fs::Permissions::from_mode(0o755));
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
}
