#!/usr/bin/env npx tsx

/**
 * Rule Study: Apply Sam's audit decisions to the database.
 *
 * Usage:
 *   npx tsx apply-audit.ts [--dry-run]
 *
 * Reads the reviewed audit-report.md and applies decisions:
 *   ❌ → delete the rule
 *   🔀 → update writing_type (extracts target from recommendation)
 *   🔧 → update category/register (extracts from recommendation)
 *   ✅ → no action (keep as-is)
 *   ⬜ → skip (not reviewed)
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parseArgs } from "util";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const RESULTS_DIR = join(SCRIPT_DIR, "results");

interface AuditAction {
  ruleText: string;
  writingType: string;
  category: string;
  action: "keep" | "drop" | "retype" | "fix" | "pending";
  detail: string;
}

function parseAuditReport(content: string): AuditAction[] {
  const actions: AuditAction[] = [];
  const lines = content.split("\n");

  let currentRule: Partial<AuditAction> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match rule header: - **rule text**
    const ruleMatch = line.match(/^- \*\*(.+?)\*\*/);
    if (ruleMatch) {
      currentRule = { ruleText: ruleMatch[1] };
      continue;
    }

    // Match type/category line
    const typeMatch = line.match(/Type:\s*(\S+),\s*Category:\s*(.+)/);
    if (typeMatch && currentRule.ruleText) {
      currentRule.writingType = typeMatch[1].replace(",", "");
      currentRule.category = typeMatch[2].trim();
      continue;
    }

    // Match action line
    const actionMatch = line.match(/Action:\s*(✅|❌|🔀|🔧|⬜)(.*)/);
    if (actionMatch && currentRule.ruleText) {
      const symbol = actionMatch[1];
      const detail = actionMatch[2]?.trim() ?? "";

      let action: AuditAction["action"];
      switch (symbol) {
        case "✅": action = "keep"; break;
        case "❌": action = "drop"; break;
        case "🔀": action = "retype"; break;
        case "🔧": action = "fix"; break;
        default: action = "pending"; break;
      }

      actions.push({
        ruleText: currentRule.ruleText!,
        writingType: currentRule.writingType ?? "",
        category: currentRule.category ?? "",
        action,
        detail,
      });

      currentRule = {};
    }
  }

  return actions;
}

function main() {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
    },
  });

  const dryRun = values["dry-run"]!;
  const reportPath = join(RESULTS_DIR, "audit-report.md");

  if (!existsSync(reportPath)) {
    console.error(`Audit report not found at ${reportPath}`);
    console.error("Run audit-rules.ts first, then review the report.");
    process.exit(1);
  }

  const content = readFileSync(reportPath, "utf-8");
  const actions = parseAuditReport(content);

  const drops = actions.filter((a) => a.action === "drop");
  const retypes = actions.filter((a) => a.action === "retype");
  const fixes = actions.filter((a) => a.action === "fix");
  const pending = actions.filter((a) => a.action === "pending");

  console.error(`\n=== Audit Application ===`);
  console.error(`Total reviewed: ${actions.length}`);
  console.error(`  Keep: ${actions.filter((a) => a.action === "keep").length}`);
  console.error(`  Drop: ${drops.length}`);
  console.error(`  Retype: ${retypes.length}`);
  console.error(`  Fix: ${fixes.length}`);
  console.error(`  Pending: ${pending.length}`);

  if (pending.length > 0) {
    console.error(`\n⚠️  ${pending.length} rules still pending review.`);
  }

  if (dryRun) {
    console.error(`\n[DRY RUN] Would apply:`);
    for (const d of drops) console.error(`  ❌ DELETE: "${d.ruleText}" (${d.writingType})`);
    for (const r of retypes) console.error(`  🔀 RETYPE: "${r.ruleText}" → ${r.detail}`);
    for (const f of fixes) console.error(`  🔧 FIX: "${f.ruleText}" — ${f.detail}`);
    return;
  }

  if (drops.length + retypes.length + fixes.length === 0) {
    console.error("\nNo changes to apply.");
    return;
  }

  const dbPath = join(homedir(), ".margin/margin.db");
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);

  let deleted = 0;
  let retyped = 0;
  let fixed = 0;

  // Apply drops
  for (const d of drops) {
    const result = db
      .prepare(
        "DELETE FROM writing_rules WHERE rule_text = ? AND writing_type = ? AND category = ?"
      )
      .run(d.ruleText, d.writingType, d.category);
    if (result.changes > 0) {
      deleted++;
      console.error(`  ❌ Deleted: "${d.ruleText}"`);
    }
  }

  // Apply retypes (move to a different writing_type)
  for (const r of retypes) {
    // Extract target type from detail (e.g., "→ cover-letter" or "move to blog")
    const typeMatch = r.detail.match(
      /(?:→|to)\s*(general|email|prd|blog|cover-letter|resume|slack|pitch|outreach|case-study|email-hiring|email-friend|social-post|text-friend)/i
    );
    if (typeMatch) {
      const newType = typeMatch[1].toLowerCase();
      const result = db
        .prepare(
          "UPDATE writing_rules SET writing_type = ?, updated_at = ? WHERE rule_text = ? AND writing_type = ?"
        )
        .run(newType, Date.now(), r.ruleText, r.writingType);
      if (result.changes > 0) {
        retyped++;
        console.error(`  🔀 Retyped: "${r.ruleText}" → ${newType}`);
      }
    } else {
      console.error(`  ⚠️  Could not parse target type for: "${r.ruleText}" — detail: "${r.detail}"`);
    }
  }

  // Apply fixes (category merges, register assignments)
  for (const f of fixes) {
    // Extract register from detail
    const registerMatch = f.detail.match(/register:\s*(casual|professional)/i);
    if (registerMatch) {
      db.prepare(
        "UPDATE writing_rules SET register = ?, updated_at = ? WHERE rule_text = ? AND writing_type = ?"
      ).run(registerMatch[1].toLowerCase(), Date.now(), f.ruleText, f.writingType);
      fixed++;
      console.error(`  🔧 Set register: "${f.ruleText}" → ${registerMatch[1]}`);
      continue;
    }

    // Extract category rename from detail
    const catMatch = f.detail.match(/category:\s*(\S+)/i);
    if (catMatch) {
      db.prepare(
        "UPDATE writing_rules SET category = ?, updated_at = ? WHERE rule_text = ? AND writing_type = ?"
      ).run(catMatch[1], Date.now(), f.ruleText, f.writingType);
      fixed++;
      console.error(`  🔧 Set category: "${f.ruleText}" → ${catMatch[1]}`);
      continue;
    }

    console.error(`  ⚠️  Could not parse fix for: "${f.ruleText}" — detail: "${f.detail}"`);
  }

  db.close();

  console.error(`\n=== Results ===`);
  console.error(`Deleted: ${deleted}`);
  console.error(`Retyped: ${retyped}`);
  console.error(`Fixed: ${fixed}`);
}

main();
