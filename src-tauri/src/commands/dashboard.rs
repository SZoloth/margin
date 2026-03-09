use crate::commands::now_millis;
use crate::db::migrations::DbPool;
use rusqlite::Connection;
use std::io::BufRead;
use std::process::Stdio;
use uuid::Uuid;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub latest_run: Option<TestRunSummary>,
    pub recent_runs: Vec<TestRunSummary>,
    pub rule_count: i64,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TestRunSummary {
    pub id: String,
    pub timestamp: i64,
    pub mode: String,
    pub rule_count: i64,
    pub total_samples: i64,
    pub avg_mechanical_issues: f64,
    pub avg_dimension_score: f64,
    pub avg_mechanical_delta: Option<f64>,
    pub avg_dimension_delta: Option<f64>,
    pub dimension_averages_json: Option<String>,
    pub dimension_deltas_json: Option<String>,
    pub best_type: Option<String>,
    pub worst_type: Option<String>,
    pub status: String,
    pub created_at: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunDetail {
    pub run: TestRunSummary,
    pub types: Vec<TestRunTypeDetail>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunTypeDetail {
    pub id: String,
    pub writing_type: String,
    pub sample_count: i64,
    pub avg_mechanical_issues: f64,
    pub avg_dimension_score: f64,
    pub dimension_scores_json: Option<String>,
    pub mechanical_delta: Option<f64>,
    pub dimension_delta: Option<f64>,
    pub systematic_violations_json: Option<String>,
    pub created_at: i64,
}

fn row_to_run_summary(row: &rusqlite::Row) -> rusqlite::Result<TestRunSummary> {
    Ok(TestRunSummary {
        id: row.get(0)?,
        timestamp: row.get(1)?,
        mode: row.get(2)?,
        rule_count: row.get(3)?,
        total_samples: row.get(4)?,
        avg_mechanical_issues: row.get(5)?,
        avg_dimension_score: row.get(6)?,
        avg_mechanical_delta: row.get(7)?,
        avg_dimension_delta: row.get(8)?,
        dimension_averages_json: row.get(9)?,
        dimension_deltas_json: row.get(10)?,
        best_type: row.get(11)?,
        worst_type: row.get(12)?,
        status: row.get(13)?,
        created_at: row.get(14)?,
    })
}

pub fn get_dashboard_summary_inner(
    conn: &Connection,
    limit: Option<i64>,
) -> Result<DashboardSummary, String> {
    let limit = limit.unwrap_or(10).clamp(1, 100);

    let rule_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM writing_rules", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, mode, rule_count, total_samples,
                    avg_mechanical_issues, avg_dimension_score,
                    avg_mechanical_delta, avg_dimension_delta,
                    dimension_averages_json, dimension_deltas_json,
                    best_type, worst_type, status, created_at
             FROM test_runs
             ORDER BY timestamp DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let recent_runs: Vec<TestRunSummary> = stmt
        .query_map([limit], |row| row_to_run_summary(row))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.map_err(|e| eprintln!("dashboard row parse error: {e}")).ok())
        .collect();

    let latest_run = recent_runs.first().cloned();

    Ok(DashboardSummary {
        latest_run,
        recent_runs,
        rule_count,
    })
}

pub fn get_test_run_detail_inner(
    conn: &Connection,
    run_id: &str,
) -> Result<TestRunDetail, String> {
    let run = conn
        .query_row(
            "SELECT id, timestamp, mode, rule_count, total_samples,
                    avg_mechanical_issues, avg_dimension_score,
                    avg_mechanical_delta, avg_dimension_delta,
                    dimension_averages_json, dimension_deltas_json,
                    best_type, worst_type, status, created_at
             FROM test_runs
             WHERE id = ?1",
            [run_id],
            |row| row_to_run_summary(row),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, writing_type, sample_count,
                    avg_mechanical_issues, avg_dimension_score,
                    dimension_scores_json, mechanical_delta, dimension_delta,
                    systematic_violations_json, created_at
             FROM test_run_types
             WHERE run_id = ?1
             ORDER BY writing_type",
        )
        .map_err(|e| e.to_string())?;

    let types: Vec<TestRunTypeDetail> = stmt
        .query_map([run_id], |row| {
            Ok(TestRunTypeDetail {
                id: row.get(0)?,
                writing_type: row.get(1)?,
                sample_count: row.get(2)?,
                avg_mechanical_issues: row.get(3)?,
                avg_dimension_score: row.get(4)?,
                dimension_scores_json: row.get(5)?,
                mechanical_delta: row.get(6)?,
                dimension_delta: row.get(7)?,
                systematic_violations_json: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.map_err(|e| eprintln!("dashboard row parse error: {e}")).ok())
        .collect();

    Ok(TestRunDetail { run, types })
}

fn export_dashboard_markdown_inner(conn: &Connection) -> Result<String, String> {
    let summary = get_dashboard_summary_inner(conn, Some(1))?;

    let run = match &summary.latest_run {
        Some(r) => r,
        None => return Ok("# Writing Quality Report\n\nNo test runs yet.".to_string()),
    };

    let detail = get_test_run_detail_inner(conn, &run.id)?;

    let mech_delta_str = run
        .avg_mechanical_delta
        .map(|d| format!(" ({:+.1})", d))
        .unwrap_or_default();
    let dim_delta_str = run
        .avg_dimension_delta
        .map(|d| format!(" ({:+.1})", d))
        .unwrap_or_default();

    let mut md = format!(
        "# Writing Quality Report\n\n\
         **Date:** {}\n\
         **Rules active:** {}\n\
         **Samples tested:** {}\n\n\
         ## Score Summary\n\
         - Dimension score: {:.1}/50{}\n\
         - Mechanical issues: {:.1} per sample{}\n",
        run.timestamp,
        run.rule_count,
        run.total_samples,
        run.avg_dimension_score,
        dim_delta_str,
        run.avg_mechanical_issues,
        mech_delta_str,
    );

    if !detail.types.is_empty() {
        md.push_str("\n## Per-Type Breakdown\n");
        md.push_str("| Type | Dim Score | Mech Issues | Delta |\n");
        md.push_str("|------|-----------|-------------|-------|\n");
        for t in &detail.types {
            let delta = t
                .dimension_delta
                .map(|d| format!("{:+.1}", d))
                .unwrap_or_else(|| "n/a".to_string());
            md.push_str(&format!(
                "| {} | {:.1} | {:.1} | {} |\n",
                t.writing_type, t.avg_dimension_score, t.avg_mechanical_issues, delta
            ));
        }
    }

    // Top violations from systematic_violations_json
    let mut all_violations: Vec<(String, String)> = Vec::new();
    for t in &detail.types {
        if let Some(json_str) = &t.systematic_violations_json {
            if let Ok(arr) = serde_json::from_str::<Vec<String>>(json_str) {
                for v in arr {
                    all_violations.push((t.writing_type.clone(), v));
                }
            }
        }
    }
    if !all_violations.is_empty() {
        md.push_str("\n## Top Violations\n");
        for (wt, violation) in all_violations.iter().take(10) {
            md.push_str(&format!("- **{}**: {}\n", wt, violation));
        }
    }

    Ok(md)
}

#[tauri::command]
pub async fn get_dashboard_summary(
    state: tauri::State<'_, DbPool>,
    limit: Option<i64>,
) -> Result<DashboardSummary, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    get_dashboard_summary_inner(&conn, limit)
}

#[tauri::command]
pub async fn get_test_run_detail(
    state: tauri::State<'_, DbPool>,
    run_id: String,
) -> Result<TestRunDetail, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    get_test_run_detail_inner(&conn, &run_id)
}

#[tauri::command]
pub async fn start_test_run(
    state: tauri::State<'_, DbPool>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());

    let rule_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM writing_rules", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let run_id = Uuid::new_v4().to_string();
    let now = now_millis();

    conn.execute(
        "INSERT INTO test_runs (id, timestamp, mode, rule_count, total_samples,
            avg_mechanical_issues, avg_dimension_score, status, created_at)
         VALUES (?1, ?2, 'comparison', ?3, 0, 0.0, 0.0, 'running', ?4)",
        rusqlite::params![run_id, now, rule_count, now],
    )
    .map_err(|e| e.to_string())?;

    let run_id_clone = run_id.clone();
    drop(conn);

    let tmp_file = std::env::temp_dir().join(format!("margin-test-run-{}.json", &run_id_clone));
    let tmp_path = tmp_file.to_string_lossy().to_string();

    // In dev builds, resolve relative to Cargo manifest. In production, resolve
    // relative to the executable (which lives in Margin.app/Contents/MacOS/).
    let script_dir = {
        let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../mcp/scripts");
        if dev_path.exists() {
            dev_path
        } else if let Ok(exe) = std::env::current_exe() {
            // Production: exe is at Margin.app/Contents/MacOS/margin
            // Repo mcp/scripts won't exist — this feature requires a dev environment
            let prod_path = exe.parent().unwrap_or(std::path::Path::new(".")).join("../Resources/mcp/scripts");
            prod_path
        } else {
            dev_path
        }
    };

    std::thread::spawn(move || {
        use tauri::Emitter;

        let emit_complete = |app: &tauri::AppHandle, status: &str, error: Option<String>| {
            let _ = app.emit(
                "test-run-complete",
                TestRunCompletePayload {
                    run_id: run_id_clone.clone(),
                    status: status.to_string(),
                    error,
                },
            );
        };

        let child = std::process::Command::new("npx")
            .arg("tsx")
            .arg(script_dir.join("adversarial-test.ts"))
            .arg("--mode")
            .arg("comparison")
            .arg("--json-output")
            .arg(&tmp_path)
            .current_dir(script_dir.parent().unwrap())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to spawn test script: {e}");
                use tauri::Manager;
                let pool = app_handle.state::<DbPool>();
                let conn = pool.0.lock().unwrap_or_else(|e: std::sync::PoisonError<_>| e.into_inner());
                let _ = conn.execute(
                    "UPDATE test_runs SET status = 'failed' WHERE id = ?1",
                    [&run_id_clone],
                );
                emit_complete(&app_handle, "failed", Some(format!("Failed to spawn test script: {e}")));
                return;
            }
        };

        // Stream stderr for progress lines
        let stderr = child.stderr.take();
        let app_for_stderr = app_handle.clone();
        let run_id_for_stderr = run_id_clone.clone();
        let stderr_handle = std::thread::spawn(move || {
            let mut error_lines: Vec<String> = Vec::new();
            if let Some(stderr) = stderr {
                let reader = std::io::BufReader::new(stderr);
                for line in reader.lines() {
                    let line = match line {
                        Ok(l) => l,
                        Err(_) => break,
                    };
                    if let Some(json_str) = line.strip_prefix("PROGRESS:") {
                        let _ = app_for_stderr.emit("test-run-progress", TestRunProgressPayload {
                            run_id: run_id_for_stderr.clone(),
                            data: json_str.to_string(),
                        });
                    } else if !line.trim().is_empty() {
                        error_lines.push(line);
                    }
                }
            }
            error_lines
        });

        let status = child.wait();
        let error_lines = stderr_handle.join().unwrap_or_default();

        use tauri::Manager;
        let pool = app_handle.state::<DbPool>();
        let conn = pool.0.lock().unwrap_or_else(|e: std::sync::PoisonError<_>| e.into_inner());

        match status {
            Ok(exit) if exit.success() => {
                match std::fs::read_to_string(&tmp_path) {
                    Ok(json_str) => {
                        if let Err(e) = process_test_results(&conn, &run_id_clone, &json_str) {
                            eprintln!("Failed to process test results: {e}");
                            let _ = conn.execute(
                                "UPDATE test_runs SET status = 'failed' WHERE id = ?1",
                                [&run_id_clone],
                            );
                            emit_complete(&app_handle, "failed", Some(format!("Failed to process results: {e}")));
                        } else {
                            emit_complete(&app_handle, "completed", None);
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to read test output file: {e}");
                        let _ = conn.execute(
                            "UPDATE test_runs SET status = 'failed' WHERE id = ?1",
                            [&run_id_clone],
                        );
                        emit_complete(&app_handle, "failed", Some(format!("Failed to read output: {e}")));
                    }
                }
            }
            Ok(_) => {
                let error_msg = if error_lines.is_empty() {
                    "Test script exited with non-zero status".to_string()
                } else {
                    error_lines.join("\n")
                };
                eprintln!("Test script failed: {error_msg}");
                let _ = conn.execute(
                    "UPDATE test_runs SET status = 'failed' WHERE id = ?1",
                    [&run_id_clone],
                );
                emit_complete(&app_handle, "failed", Some(error_msg));
            }
            Err(e) => {
                eprintln!("Failed to wait for test script: {e}");
                let _ = conn.execute(
                    "UPDATE test_runs SET status = 'failed' WHERE id = ?1",
                    [&run_id_clone],
                );
                emit_complete(&app_handle, "failed", Some(format!("Script execution error: {e}")));
            }
        }

        let _ = std::fs::remove_file(&tmp_path);
    });

    Ok(run_id)
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TestRunCompletePayload {
    run_id: String,
    status: String,
    error: Option<String>,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TestRunProgressPayload {
    run_id: String,
    data: String,
}

fn process_test_results(
    conn: &Connection,
    run_id: &str,
    json_str: &str,
) -> Result<(), String> {
    let data: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    let now = now_millis();
    let results = data["results"]
        .as_array()
        .ok_or("missing results array")?;
    let overall = &data["overall"];

    let mut total_samples: i64 = 0;
    let mut best_type: Option<(String, f64)> = None;
    let mut worst_type: Option<(String, f64)> = None;

    for result in results {
        let writing_type = result["writingType"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();
        let samples = result["samples"].as_array();
        let sample_count = samples.map(|s| s.len() as i64).unwrap_or(0);
        total_samples += sample_count;

        // Compute coached averages from samples
        let (avg_mech, avg_dim) = if let Some(samples) = samples {
            let mut mech_sum = 0.0_f64;
            let mut dim_sum = 0.0_f64;
            let mut count = 0_f64;
            for sample in samples {
                let coached = &sample["coached"]["compliance"];
                if let Some(m) = coached["summary"]["mechanicalIssues"].as_f64() {
                    mech_sum += m;
                }
                if let Some(d) = coached["dimensions"]["total"].as_f64() {
                    dim_sum += d;
                }
                count += 1.0;
            }
            if count > 0.0 {
                (mech_sum / count, dim_sum / count)
            } else {
                (0.0, 0.0)
            }
        } else {
            (0.0, 0.0)
        };

        let delta = &result["delta"];
        let mech_delta = delta["mechanicalDelta"].as_f64();
        let dim_delta = delta["totalScoreDelta"].as_f64();
        // Compute per-dimension coached scores from samples
        let dim_scores_json = if let Some(samples) = samples {
            let mut dim_sums: serde_json::Map<String, serde_json::Value> =
                serde_json::Map::new();
            let mut count = 0_f64;
            for sample in samples {
                let dims = &sample["coached"]["compliance"]["dimensions"];
                if let Some(obj) = dims.as_object() {
                    for (k, v) in obj {
                        if k == "total" {
                            continue;
                        }
                        if let Some(val) = v.as_f64() {
                            let entry = dim_sums
                                .entry(k.clone())
                                .or_insert(serde_json::Value::from(0.0));
                            if let Some(cur) = entry.as_f64() {
                                *entry = serde_json::Value::from(cur + val);
                            }
                        }
                    }
                    count += 1.0;
                }
            }
            if count > 0.0 {
                for (_k, v) in dim_sums.iter_mut() {
                    if let Some(cur) = v.as_f64() {
                        *v = serde_json::Value::from(cur / count);
                    }
                }
            }
            Some(serde_json::Value::Object(dim_sums).to_string())
        } else {
            None
        };

        // Track best/worst by dimension score
        match &best_type {
            None => best_type = Some((writing_type.clone(), avg_dim)),
            Some((_, best_score)) if avg_dim > *best_score => {
                best_type = Some((writing_type.clone(), avg_dim))
            }
            _ => {}
        }
        match &worst_type {
            None => worst_type = Some((writing_type.clone(), avg_dim)),
            Some((_, worst_score)) if avg_dim < *worst_score => {
                worst_type = Some((writing_type.clone(), avg_dim))
            }
            _ => {}
        }

        // Collect systematic violations
        let systematic_violations_json = if let Some(samples) = samples {
            let mut violations: Vec<String> = Vec::new();
            for sample in samples {
                if let Some(issues) = sample["coached"]["compliance"]["summary"]["issues"]
                    .as_array()
                {
                    for issue in issues {
                        if let Some(s) = issue.as_str() {
                            violations.push(s.to_string());
                        }
                    }
                }
            }
            if violations.is_empty() {
                None
            } else {
                Some(serde_json::to_string(&violations).unwrap_or_default())
            }
        } else {
            None
        };

        let type_id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO test_run_types (id, run_id, writing_type, sample_count,
                avg_mechanical_issues, avg_dimension_score, dimension_scores_json,
                mechanical_delta, dimension_delta, systematic_violations_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                type_id,
                run_id,
                writing_type,
                sample_count,
                avg_mech,
                avg_dim,
                dim_scores_json,
                mech_delta,
                dim_delta,
                systematic_violations_json,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let avg_mech_delta = overall["avgMechanicalDelta"].as_f64();
    let avg_dim_delta = overall["avgDimensionDelta"].as_f64();
    let per_dim_delta = overall
        .get("perDimensionDelta")
        .map(|v| v.to_string());

    // Compute overall coached averages
    let mut stmt = conn
        .prepare(
            "SELECT AVG(avg_dimension_score), AVG(avg_mechanical_issues)
             FROM test_run_types WHERE run_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let (overall_dim, overall_mech): (f64, f64) = stmt
        .query_row([run_id], |row| {
            Ok((
                row.get::<_, f64>(0).unwrap_or(0.0),
                row.get::<_, f64>(1).unwrap_or(0.0),
            ))
        })
        .map_err(|e| e.to_string())?;

    // Compute dimension averages from type rows
    let mut dim_stmt = conn
        .prepare("SELECT dimension_scores_json FROM test_run_types WHERE run_id = ?1")
        .map_err(|e| e.to_string())?;
    let dim_jsons: Vec<Option<String>> = dim_stmt
        .query_map([run_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.map_err(|e| eprintln!("dashboard row parse error: {e}")).ok())
        .collect();

    let dimension_averages_json = {
        let mut sums: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
        let mut count = 0_f64;
        for json_opt in &dim_jsons {
            if let Some(json_str) = json_opt {
                if let Ok(obj) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(json_str) {
                    for (k, v) in &obj {
                        if let Some(val) = v.as_f64() {
                            let entry = sums
                                .entry(k.clone())
                                .or_insert(serde_json::Value::from(0.0));
                            if let Some(cur) = entry.as_f64() {
                                *entry = serde_json::Value::from(cur + val);
                            }
                        }
                    }
                    count += 1.0;
                }
            }
        }
        if count > 0.0 {
            for (_k, v) in sums.iter_mut() {
                if let Some(cur) = v.as_f64() {
                    *v = serde_json::Value::from(cur / count);
                }
            }
            Some(serde_json::Value::Object(sums).to_string())
        } else {
            None
        }
    };

    conn.execute(
        "UPDATE test_runs SET
            total_samples = ?1,
            avg_mechanical_issues = ?2,
            avg_dimension_score = ?3,
            avg_mechanical_delta = ?4,
            avg_dimension_delta = ?5,
            dimension_averages_json = ?6,
            dimension_deltas_json = ?7,
            best_type = ?8,
            worst_type = ?9,
            status = 'completed'
         WHERE id = ?10",
        rusqlite::params![
            total_samples,
            overall_mech,
            overall_dim,
            avg_mech_delta,
            avg_dim_delta,
            dimension_averages_json,
            per_dim_delta,
            best_type.map(|(t, _)| t),
            worst_type.map(|(t, _)| t),
            run_id,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn export_dashboard_markdown(
    state: tauri::State<'_, DbPool>,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap_or_else(|e| e.into_inner());
    export_dashboard_markdown_inner(&conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::migrate_add_dashboard_tables;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate_add_dashboard_tables(&conn).unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS writing_rules (
                id TEXT PRIMARY KEY,
                writing_type TEXT NOT NULL,
                category TEXT NOT NULL,
                rule_text TEXT NOT NULL,
                severity TEXT NOT NULL,
                source TEXT NOT NULL,
                signal_count INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn summary_empty_returns_no_runs() {
        let conn = setup_test_db();
        let summary = get_dashboard_summary_inner(&conn, None).unwrap();
        assert!(summary.latest_run.is_none());
        assert!(summary.recent_runs.is_empty());
        assert_eq!(summary.rule_count, 0);
    }

    #[test]
    fn summary_with_run_and_rules() {
        let conn = setup_test_db();

        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r1', 'general', 'test', 'rule1', 'must-fix', 'manual', 1000, 1000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, created_at, updated_at)
             VALUES ('r2', 'email', 'test', 'rule2', 'should-fix', 'manual', 1000, 1000)",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO test_runs (id, timestamp, mode, rule_count, total_samples,
                avg_mechanical_issues, avg_dimension_score, status, created_at)
             VALUES ('run1', 1000, 'comparison', 2, 27, 1.5, 35.0, 'completed', 1000)",
            [],
        )
        .unwrap();

        let summary = get_dashboard_summary_inner(&conn, None).unwrap();
        assert!(summary.latest_run.is_some());
        assert_eq!(summary.recent_runs.len(), 1);
        assert_eq!(summary.rule_count, 2);

        let run = summary.latest_run.unwrap();
        assert_eq!(run.id, "run1");
        assert_eq!(run.total_samples, 27);
        assert_eq!(run.avg_dimension_score, 35.0);
    }

    #[test]
    fn detail_with_type_breakdown() {
        let conn = setup_test_db();

        conn.execute(
            "INSERT INTO test_runs (id, timestamp, mode, rule_count, total_samples,
                avg_mechanical_issues, avg_dimension_score, status, created_at)
             VALUES ('run1', 1000, 'comparison', 5, 27, 1.5, 35.0, 'completed', 1000)",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO test_run_types (id, run_id, writing_type, sample_count,
                avg_mechanical_issues, avg_dimension_score, created_at)
             VALUES ('t1', 'run1', 'general', 9, 1.2, 36.0, 1000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO test_run_types (id, run_id, writing_type, sample_count,
                avg_mechanical_issues, avg_dimension_score, created_at)
             VALUES ('t2', 'run1', 'email', 9, 1.8, 34.0, 1000)",
            [],
        )
        .unwrap();

        let detail = get_test_run_detail_inner(&conn, "run1").unwrap();
        assert_eq!(detail.run.id, "run1");
        assert_eq!(detail.types.len(), 2);
        assert_eq!(detail.types[0].writing_type, "email");
        assert_eq!(detail.types[1].writing_type, "general");
    }

    #[test]
    fn detail_missing_run_returns_error() {
        let conn = setup_test_db();
        let result = get_test_run_detail_inner(&conn, "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn export_markdown_no_runs() {
        let conn = setup_test_db();
        let md = export_dashboard_markdown_inner(&conn).unwrap();
        assert!(md.contains("No test runs yet"));
    }

    #[test]
    fn export_markdown_with_data() {
        let conn = setup_test_db();

        conn.execute(
            "INSERT INTO test_runs (id, timestamp, mode, rule_count, total_samples,
                avg_mechanical_issues, avg_dimension_score, avg_mechanical_delta,
                avg_dimension_delta, status, created_at)
             VALUES ('run1', 1000, 'comparison', 5, 27, 1.5, 35.0, -0.8, 3.2, 'completed', 1000)",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO test_run_types (id, run_id, writing_type, sample_count,
                avg_mechanical_issues, avg_dimension_score, dimension_delta, created_at)
             VALUES ('t1', 'run1', 'general', 9, 1.2, 36.0, 2.5, 1000)",
            [],
        )
        .unwrap();

        let md = export_dashboard_markdown_inner(&conn).unwrap();
        assert!(md.contains("Writing Quality Report"));
        assert!(md.contains("35.0/50"));
        assert!(md.contains("general"));
        assert!(md.contains("+2.5"));
    }

    #[test]
    fn cascade_delete_removes_types() {
        let conn = setup_test_db();

        conn.execute(
            "INSERT INTO test_runs (id, timestamp, mode, rule_count, total_samples,
                avg_mechanical_issues, avg_dimension_score, status, created_at)
             VALUES ('run1', 1000, 'comparison', 5, 27, 1.5, 35.0, 'completed', 1000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO test_run_types (id, run_id, writing_type, sample_count,
                avg_mechanical_issues, avg_dimension_score, created_at)
             VALUES ('t1', 'run1', 'general', 9, 1.2, 36.0, 1000)",
            [],
        )
        .unwrap();

        conn.execute("DELETE FROM test_runs WHERE id = 'run1'", [])
            .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM test_run_types WHERE run_id = 'run1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
}
