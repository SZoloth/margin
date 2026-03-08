use crate::commands::now_millis;
use crate::db::migrations::DbPool;
use rusqlite::Connection;
use std::io::Write;
use std::process::{Command, Stdio};
use uuid::Uuid;

const VALID_WRITING_TYPES: &[&str] = &[
    "general",
    "email",
    "prd",
    "blog",
    "cover-letter",
    "resume",
    "slack",
    "pitch",
    "outreach",
];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedRulesResult {
    pub created: i64,
    pub deduplicated: i64,
    pub errors: Vec<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtractedRule {
    rule_text: String,
    category: Option<String>,
    severity: Option<String>,
    when_to_apply: Option<String>,
    why: Option<String>,
    example_before: Option<String>,
    example_after: Option<String>,
}

const EXTRACTION_PROMPT: &str = r#"You are a style guide analyzer. Extract writing rules from the following style guide text.

Output a JSON array of rules. Each rule object must have these fields:
- "ruleText": the rule stated concisely as an imperative (e.g., "Use active voice")
- "category": a kebab-case category derived from the guide's structure (e.g., "tone", "punctuation", "word-choice")
- "severity": one of "must-fix", "should-fix", or "nice-to-fix" — infer from guide language (requirements = must-fix, recommendations = should-fix, suggestions = nice-to-fix)
- "whenToApply": brief description of when this rule applies (or null)
- "why": brief rationale (or null)
- "exampleBefore": a short example of violating text (or null)
- "exampleAfter": the corrected version (or null)

Rules:
- Extract concrete, actionable rules only — skip meta-commentary about the guide itself
- Deduplicate: if the guide states the same idea multiple ways, emit one rule
- Category names should be 1-3 words in kebab-case
- Output ONLY a JSON array, no markdown fences, no commentary

Style guide text:
"#;

fn insert_seed_rules(
    conn: &Connection,
    rules: &[ExtractedRule],
    writing_type: &str,
    guide_name: Option<&str>,
) -> SeedRulesResult {
    let now = now_millis();
    let notes = guide_name
        .map(|n| format!("Seeded from: {}", n))
        .unwrap_or_else(|| "Seeded from style guide".to_string());

    let mut created: i64 = 0;
    let mut deduplicated: i64 = 0;
    let mut errors: Vec<String> = Vec::new();

    for rule in rules {
        if rule.rule_text.trim().is_empty() {
            continue;
        }

        let id = Uuid::new_v4().to_string();
        let category = rule
            .category
            .as_deref()
            .unwrap_or("imported");
        let severity = match rule.severity.as_deref() {
            Some("must-fix") => "must-fix",
            Some("should-fix") => "should-fix",
            Some("nice-to-fix") => "nice-to-fix",
            _ => "should-fix",
        };

        let result = conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, when_to_apply, why, example_before, example_after, source, signal_count, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'seed', 1, ?10, ?11, ?11)
             ON CONFLICT(writing_type, category, rule_text) DO UPDATE SET
               signal_count = writing_rules.signal_count + 1,
               updated_at = excluded.updated_at",
            rusqlite::params![
                id,
                writing_type,
                category,
                rule.rule_text.trim(),
                severity,
                rule.when_to_apply,
                rule.why,
                rule.example_before,
                rule.example_after,
                notes,
                now,
            ],
        );

        match result {
            Ok(rows) => {
                if rows > 0 {
                    // Check if this was an insert or upsert update
                    let existing: bool = conn
                        .query_row(
                            "SELECT signal_count > 1 FROM writing_rules WHERE writing_type = ?1 AND category = ?2 AND rule_text = ?3",
                            rusqlite::params![writing_type, category, rule.rule_text.trim()],
                            |r| r.get(0),
                        )
                        .unwrap_or(false);
                    if existing {
                        deduplicated += 1;
                    } else {
                        created += 1;
                    }
                }
            }
            Err(e) => {
                errors.push(format!("Failed to insert rule '{}': {}", rule.rule_text, e));
            }
        }
    }

    SeedRulesResult {
        created,
        deduplicated,
        errors,
    }
}

fn extract_json_array(text: &str) -> Option<&str> {
    // Find the first '[' and last ']' to extract JSON array, handling markdown fences
    let start = text.find('[')?;
    let end = text.rfind(']')?;
    if end > start {
        Some(&text[start..=end])
    } else {
        None
    }
}

#[tauri::command]
pub async fn seed_rules_from_guide(
    state: tauri::State<'_, DbPool>,
    guide_text: String,
    writing_type: Option<String>,
    guide_name: Option<String>,
) -> Result<SeedRulesResult, String> {
    let guide_text = guide_text.trim().to_string();
    if guide_text.is_empty() {
        return Err("Style guide text cannot be empty".to_string());
    }

    let wt = writing_type.as_deref().unwrap_or("general");
    if !VALID_WRITING_TYPES.contains(&wt) {
        return Err(format!("Invalid writing type: {}", wt));
    }

    let prompt = format!("{}{}", EXTRACTION_PROMPT, guide_text);

    let mut child = Command::new("claude")
        .args(["--print", "--model", "sonnet"])
        .env_remove("CLAUDECODE")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start claude CLI: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|e| format!("Failed to write to claude stdin: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to read claude output: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Claude CLI failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_str = extract_json_array(&stdout)
        .ok_or_else(|| format!("No JSON array found in LLM response. Raw output: {}", &stdout[..stdout.len().min(500)]))?;

    let rules: Vec<ExtractedRule> = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse extracted rules: {}. JSON: {}", e, &json_str[..json_str.len().min(500)]))?;

    if rules.is_empty() {
        return Ok(SeedRulesResult {
            created: 0,
            deduplicated: 0,
            errors: vec!["No rules extracted from the style guide".to_string()],
        });
    }

    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    let result = insert_seed_rules(&conn, &rules, wt, guide_name.as_deref());

    Ok(result)
}

#[tauri::command]
pub async fn open_style_guide_dialog() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(r#"POSIX path of (choose file of type {"md","markdown","txt"} with prompt "Open Style Guide")"#)
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    if !output.status.success() {
        return Ok(None);
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;

    Ok(Some(content))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE writing_rules (
                id TEXT PRIMARY KEY,
                writing_type TEXT NOT NULL DEFAULT 'general',
                category TEXT NOT NULL DEFAULT 'uncategorized',
                rule_text TEXT NOT NULL,
                when_to_apply TEXT,
                why TEXT,
                severity TEXT NOT NULL DEFAULT 'should-fix',
                example_before TEXT,
                example_after TEXT,
                source TEXT NOT NULL DEFAULT 'manual',
                signal_count INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                reviewed_at INTEGER,
                register TEXT,
                UNIQUE(writing_type, category, rule_text)
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn insert_seed_rules_creates_rules() {
        let conn = setup_db();
        let rules = vec![
            ExtractedRule {
                rule_text: "Use active voice".to_string(),
                category: Some("tone".to_string()),
                severity: Some("must-fix".to_string()),
                when_to_apply: Some("Always".to_string()),
                why: Some("Clarity".to_string()),
                example_before: Some("The report was written".to_string()),
                example_after: Some("I wrote the report".to_string()),
            },
            ExtractedRule {
                rule_text: "Avoid jargon".to_string(),
                category: Some("word-choice".to_string()),
                severity: Some("should-fix".to_string()),
                when_to_apply: None,
                why: None,
                example_before: None,
                example_after: None,
            },
        ];

        let result = insert_seed_rules(&conn, &rules, "general", Some("AP Stylebook"));
        assert_eq!(result.created, 2);
        assert_eq!(result.deduplicated, 0);
        assert!(result.errors.is_empty());

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM writing_rules", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);

        let source: String = conn
            .query_row(
                "SELECT source FROM writing_rules LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(source, "seed");

        let notes: String = conn
            .query_row(
                "SELECT notes FROM writing_rules LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(notes.contains("AP Stylebook"));
    }

    #[test]
    fn insert_seed_rules_deduplicates() {
        let conn = setup_db();
        let rules = vec![ExtractedRule {
            rule_text: "Use active voice".to_string(),
            category: Some("tone".to_string()),
            severity: Some("must-fix".to_string()),
            when_to_apply: None,
            why: None,
            example_before: None,
            example_after: None,
        }];

        let r1 = insert_seed_rules(&conn, &rules, "general", None);
        assert_eq!(r1.created, 1);
        assert_eq!(r1.deduplicated, 0);

        let r2 = insert_seed_rules(&conn, &rules, "general", None);
        assert_eq!(r2.created, 0);
        assert_eq!(r2.deduplicated, 1);

        let signal: i64 = conn
            .query_row(
                "SELECT signal_count FROM writing_rules LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(signal, 2);
    }

    #[test]
    fn insert_seed_rules_skips_empty_rule_text() {
        let conn = setup_db();
        let rules = vec![ExtractedRule {
            rule_text: "  ".to_string(),
            category: None,
            severity: None,
            when_to_apply: None,
            why: None,
            example_before: None,
            example_after: None,
        }];

        let result = insert_seed_rules(&conn, &rules, "general", None);
        assert_eq!(result.created, 0);
    }

    #[test]
    fn insert_seed_rules_defaults_severity() {
        let conn = setup_db();
        let rules = vec![ExtractedRule {
            rule_text: "Test rule".to_string(),
            category: None,
            severity: Some("invalid".to_string()),
            when_to_apply: None,
            why: None,
            example_before: None,
            example_after: None,
        }];

        insert_seed_rules(&conn, &rules, "general", None);

        let severity: String = conn
            .query_row(
                "SELECT severity FROM writing_rules LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(severity, "should-fix");
    }

    #[test]
    fn insert_seed_rules_reviewed_at_null() {
        let conn = setup_db();
        let rules = vec![ExtractedRule {
            rule_text: "Test rule".to_string(),
            category: Some("test".to_string()),
            severity: Some("must-fix".to_string()),
            when_to_apply: None,
            why: None,
            example_before: None,
            example_after: None,
        }];

        insert_seed_rules(&conn, &rules, "general", None);

        let reviewed: Option<i64> = conn
            .query_row(
                "SELECT reviewed_at FROM writing_rules LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(reviewed.is_none());
    }

    #[test]
    fn extract_json_array_handles_plain_json() {
        let input = r#"[{"ruleText": "test"}]"#;
        assert_eq!(extract_json_array(input), Some(input));
    }

    #[test]
    fn extract_json_array_handles_markdown_fences() {
        let input = "```json\n[{\"ruleText\": \"test\"}]\n```";
        assert_eq!(
            extract_json_array(input),
            Some("[{\"ruleText\": \"test\"}]")
        );
    }

    #[test]
    fn extract_json_array_handles_preamble() {
        let input = "Here are the rules:\n[{\"ruleText\": \"test\"}]";
        assert_eq!(
            extract_json_array(input),
            Some("[{\"ruleText\": \"test\"}]")
        );
    }

    #[test]
    fn extract_json_array_returns_none_for_no_array() {
        assert_eq!(extract_json_array("no json here"), None);
    }
}
