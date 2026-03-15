#!/usr/bin/env npx tsx

/**
 * Rule Study: Generate a rule audit report.
 *
 * Usage:
 *   npx tsx audit-rules.ts
 *
 * Reads all writing rules from SQLite and generates a structured audit report:
 * - Rules that are `general` but should be type-scoped
 * - Low-signal rules (signal_count=1, source=seed, never reinforced)
 * - Category inconsistencies
 * - Potential conflicts between rules
 *
 * Output: results/audit-report.md (for Sam's review) + results/audit.json
 */

import { writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { createRequire } from "module";
import { cleanEnv } from "../../shared.ts";

const require = createRequire(import.meta.url);

interface RuleRow {
  id: string;
  writing_type: string;
  category: string;
  rule_text: string;
  severity: string;
  signal_count: number;
  source: string;
  register: string | null;
  example_before: string | null;
  reviewed_at: number | null;
  created_at: number;
}

interface AuditFlag {
  ruleId: string;
  ruleText: string;
  writingType: string;
  category: string;
  issue: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
}

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const RESULTS_DIR = join(SCRIPT_DIR, "results");

function main() {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) {
    console.error(`Margin database not found at ${dbPath}`);
    process.exit(1);
  }

  const Database = require("better-sqlite3");
  const db = new Database(dbPath, { readonly: true });

  const rules = db
    .prepare(
      `SELECT id, writing_type, category, rule_text, severity, signal_count,
              source, register, example_before, reviewed_at, created_at
       FROM writing_rules
       ORDER BY writing_type, category, signal_count DESC`
    )
    .all() as RuleRow[];

  db.close();

  console.error(`Loaded ${rules.length} rules`);

  const flags: AuditFlag[] = [];

  // 1. Low-signal rules (signal_count=1, source=seed*, never reviewed)
  const lowSignal = rules.filter(
    (r) =>
      r.signal_count <= 1 &&
      (r.source.startsWith("seed") || r.source === "synthesis") &&
      !r.reviewed_at
  );
  for (const r of lowSignal) {
    flags.push({
      ruleId: r.id,
      ruleText: r.rule_text,
      writingType: r.writing_type,
      category: r.category,
      issue: `Low signal: signal_count=${r.signal_count}, source="${r.source}", never reviewed`,
      recommendation: "Review for relevance — drop if not reflective of actual preference",
      confidence: "medium",
    });
  }

  // 2. General rules that might be type-specific
  const generalRules = rules.filter((r) => r.writing_type === "general");
  const typeSpecificKeywords: Record<string, string[]> = {
    "cover-letter": ["cover letter", "hiring manager", "application", "role"],
    resume: ["bullet", "resume", "accomplishment", "metric"],
    blog: ["blog", "post", "article", "reader"],
    email: ["email", "subject line", "recipient"],
    slack: ["slack", "channel", "message"],
    pitch: ["pitch", "deck", "investor", "slide"],
    prd: ["prd", "requirement", "user story", "acceptance criteria"],
    outreach: ["outreach", "linkedin", "cold", "connection"],
  };

  for (const r of generalRules) {
    const lowerRule = r.rule_text.toLowerCase();
    for (const [type, keywords] of Object.entries(typeSpecificKeywords)) {
      if (keywords.some((kw) => lowerRule.includes(kw))) {
        flags.push({
          ruleId: r.id,
          ruleText: r.rule_text,
          writingType: r.writing_type,
          category: r.category,
          issue: `Possibly type-specific: mentions "${type}" keywords but scoped as "general"`,
          recommendation: `Consider moving to writing_type="${type}"`,
          confidence: "medium",
        });
        break;
      }
    }
  }

  // 3. Category inconsistencies
  const categoryMap = new Map<string, string[]>();
  for (const r of rules) {
    if (!categoryMap.has(r.category)) categoryMap.set(r.category, []);
    categoryMap.get(r.category)!.push(r.id);
  }

  // Check for near-duplicate categories
  const categories = Array.from(categoryMap.keys());
  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const a = categories[i].toLowerCase().replace(/[^a-z]/g, "");
      const b = categories[j].toLowerCase().replace(/[^a-z]/g, "");
      if (a === b || a.includes(b) || b.includes(a)) {
        flags.push({
          ruleId: "",
          ruleText: "",
          writingType: "",
          category: `${categories[i]} / ${categories[j]}`,
          issue: `Near-duplicate categories: "${categories[i]}" and "${categories[j]}"`,
          recommendation: "Merge into a single canonical category name",
          confidence: "high",
        });
      }
    }
  }

  // 4. Rules without register that probably need one
  const noRegister = rules.filter(
    (r) => !r.register && r.category === "voice-calibration"
  );
  for (const r of noRegister) {
    flags.push({
      ruleId: r.id,
      ruleText: r.rule_text,
      writingType: r.writing_type,
      category: r.category,
      issue: "Voice-calibration rule without register scope",
      recommendation: "Assign casual or professional register",
      confidence: "low",
    });
  }

  // Build report
  const report: string[] = [
    `# Rule Audit Report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Total rules: ${rules.length}`,
    ``,
    `## Stats`,
    `- By type: ${Array.from(new Set(rules.map((r) => r.writing_type)))
      .map((t) => `${t} (${rules.filter((r) => r.writing_type === t).length})`)
      .join(", ")}`,
    `- By source: ${Array.from(new Set(rules.map((r) => r.source)))
      .map((s) => `${s} (${rules.filter((r) => r.source === s).length})`)
      .join(", ")}`,
    `- Categories: ${categories.join(", ")}`,
    `- With register: ${rules.filter((r) => r.register).length}/${rules.length}`,
    `- Reviewed: ${rules.filter((r) => r.reviewed_at).length}/${rules.length}`,
    ``,
    `## Flags (${flags.length} total)`,
    ``,
    `### Action Key`,
    `- ✅ Keep as-is`,
    `- ❌ Drop`,
    `- 🔀 Retype (move to specific writing_type)`,
    `- 🔧 Fix (merge category, add register, etc.)`,
    ``,
  ];

  // Group flags by issue type
  const byIssue = new Map<string, AuditFlag[]>();
  for (const f of flags) {
    const key = f.issue.split(":")[0];
    if (!byIssue.has(key)) byIssue.set(key, []);
    byIssue.get(key)!.push(f);
  }

  for (const [issueType, issueFlags] of byIssue) {
    report.push(`### ${issueType} (${issueFlags.length})`);
    report.push(``);
    for (const f of issueFlags.slice(0, 50)) {
      // Cap at 50 per section to keep review manageable
      report.push(`- **${f.ruleText || f.category}**`);
      report.push(`  - Type: ${f.writingType}, Category: ${f.category}`);
      report.push(`  - ${f.recommendation}`);
      report.push(`  - Action: ⬜`);
      report.push(``);
    }
    if (issueFlags.length > 50) {
      report.push(`  _(${issueFlags.length - 50} more — showing top 50)_`);
      report.push(``);
    }
  }

  const reportPath = join(RESULTS_DIR, "audit-report.md");
  writeFileSync(reportPath, report.join("\n"), "utf-8");

  const auditJson = {
    generatedAt: new Date().toISOString(),
    totalRules: rules.length,
    totalFlags: flags.length,
    flags,
    stats: {
      byType: Object.fromEntries(
        Array.from(new Set(rules.map((r) => r.writing_type))).map((t) => [
          t,
          rules.filter((r) => r.writing_type === t).length,
        ])
      ),
      bySource: Object.fromEntries(
        Array.from(new Set(rules.map((r) => r.source))).map((s) => [
          s,
          rules.filter((r) => r.source === s).length,
        ])
      ),
      categories: Object.fromEntries(categoryMap),
    },
  };

  const jsonPath = join(RESULTS_DIR, "audit.json");
  writeFileSync(jsonPath, JSON.stringify(auditJson, null, 2), "utf-8");

  console.error(`\n=== Audit Complete ===`);
  console.error(`Rules: ${rules.length}`);
  console.error(`Flags: ${flags.length}`);
  console.error(`  Low signal: ${lowSignal.length}`);
  console.error(`  Possibly type-specific: ${flags.filter((f) => f.issue.includes("type-specific")).length}`);
  console.error(`  Category duplicates: ${flags.filter((f) => f.issue.includes("duplicate")).length}`);
  console.error(`  Missing register: ${noRegister.length}`);
  console.error(`\nReport: ${reportPath}`);
  console.error(`JSON: ${jsonPath}`);
}

main();
