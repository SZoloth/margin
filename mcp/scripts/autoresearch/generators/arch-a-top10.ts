/**
 * Architecture A-top10: Klaassen "10 rules beat 100" variant.
 *
 * Loads only the top 10 rules by signal_count (most-observed patterns),
 * rather than the full rule set. Tests Klaassen's hypothesis that a tight
 * focused rule set outperforms a comprehensive one by reducing noise.
 *
 * Hypothesis: fewer, higher-signal rules → better focus → higher pass rate.
 * Prior arch-a result: ~63%. If top-10 matches or exceeds, Klaassen confirmed.
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createRequire } from "module";
import { REGISTER_MAP, stripMetaCommentary, cleanEnv } from "../../shared.ts";

const require = createRequire(import.meta.url);

interface WritingRuleRow {
  category: string;
  rule_text: string;
  severity: string;
  signal_count: number;
}

function loadTop10Rules(type: string): string {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return "";

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const register = REGISTER_MAP[type] ?? "casual";

    const rows = db
      .prepare(
        `SELECT category, rule_text, severity, signal_count
         FROM writing_rules
         WHERE (writing_type = ? OR writing_type = 'general' OR register = ?)
         ORDER BY signal_count DESC, created_at DESC
         LIMIT 10`
      )
      .all(type, register) as WritingRuleRow[];
    db.close();

    if (rows.length === 0) return "";

    const lines = ["# Top 10 Writing Rules (by signal count)"];
    for (const row of rows) {
      lines.push(`- [${row.severity}] ${row.rule_text} (signal: ${row.signal_count})`);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("Failed to load top-10 rules:", (err as Error).message);
    return "";
  }
}

export function generate(type: string, prompt: string, register: string): string {
  const rules = loadTop10Rules(type);

  const fullPrompt = `You are a writing assistant. Follow these writing rules precisely.

${rules || "(no rules loaded)"}

---
Writing type: ${type}
Register: ${register}

Output ONLY the prose — no commentary, critique, word counts, or meta-discussion.

${prompt}`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: fullPrompt,
      encoding: "utf-8",
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv(),
    });
    return stripMetaCommentary(result.trim());
  } catch (err) {
    console.error("Generation failed:", (err as Error).message);
    return "";
  }
}
