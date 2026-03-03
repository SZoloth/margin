import type Database from "better-sqlite3";
import { nowMillis } from "../db.js";

export interface WritingRule {
  id: string;
  writingType: string;
  category: string;
  ruleText: string;
  whenToApply: string | null;
  why: string | null;
  severity: string;
  exampleBefore: string | null;
  exampleAfter: string | null;
  source: string;
  signalCount: number;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export function getWritingRules(
  db: Database.Database,
  writingType?: string,
): WritingRule[] {
  if (writingType) {
    return db
      .prepare(
        `SELECT id, writing_type as writingType, category, rule_text as ruleText, when_to_apply as whenToApply,
                why, severity, example_before as exampleBefore, example_after as exampleAfter, source,
                signal_count as signalCount, notes, created_at as createdAt, updated_at as updatedAt
         FROM writing_rules WHERE writing_type = ?
         ORDER BY signal_count DESC, created_at DESC`,
      )
      .all(writingType) as WritingRule[];
  }

  return db
    .prepare(
      `SELECT id, writing_type as writingType, category, rule_text as ruleText, when_to_apply as whenToApply,
              why, severity, example_before as exampleBefore, example_after as exampleAfter, source,
              signal_count as signalCount, notes, created_at as createdAt, updated_at as updatedAt
       FROM writing_rules
       ORDER BY writing_type, signal_count DESC, created_at DESC`,
    )
    .all() as WritingRule[];
}

const VALID_SEVERITIES = ["must-fix", "should-fix", "nice-to-fix"] as const;
const VALID_WRITING_TYPES = [
  "general", "email", "prd", "blog", "cover-letter",
  "resume", "slack", "pitch", "outreach",
] as const;

export interface UpdateWritingRuleParams {
  id: string;
  rule_text?: string;
  severity?: string;
  when_to_apply?: string | null;
  why?: string | null;
  example_before?: string | null;
  example_after?: string | null;
  notes?: string | null;
  writing_type?: string;
}

export function updateWritingRule(
  db: Database.Database,
  params: UpdateWritingRuleParams,
): WritingRule | { error: string } {
  const existing = db
    .prepare("SELECT id FROM writing_rules WHERE id = ?")
    .get(params.id) as { id: string } | undefined;

  if (!existing) {
    return { error: `Writing rule not found: ${params.id}` };
  }

  if (params.severity && !VALID_SEVERITIES.includes(params.severity as (typeof VALID_SEVERITIES)[number])) {
    return { error: `Invalid severity "${params.severity}". Allowed: ${VALID_SEVERITIES.join(", ")}` };
  }

  if (params.writing_type && !VALID_WRITING_TYPES.includes(params.writing_type as (typeof VALID_WRITING_TYPES)[number])) {
    return { error: `Invalid writing_type "${params.writing_type}". Allowed: ${VALID_WRITING_TYPES.join(", ")}` };
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (params.rule_text !== undefined) { sets.push("rule_text = ?"); values.push(params.rule_text); }
  if (params.severity !== undefined) { sets.push("severity = ?"); values.push(params.severity); }
  if (params.when_to_apply !== undefined) { sets.push("when_to_apply = ?"); values.push(params.when_to_apply); }
  if (params.why !== undefined) { sets.push("why = ?"); values.push(params.why); }
  if (params.example_before !== undefined) { sets.push("example_before = ?"); values.push(params.example_before); }
  if (params.example_after !== undefined) { sets.push("example_after = ?"); values.push(params.example_after); }
  if (params.notes !== undefined) { sets.push("notes = ?"); values.push(params.notes); }
  if (params.writing_type !== undefined) { sets.push("writing_type = ?"); values.push(params.writing_type); }

  if (sets.length === 0) {
    return { error: "No fields to update" };
  }

  const now = nowMillis();
  sets.push("updated_at = ?");
  values.push(now);
  values.push(params.id);

  db.prepare(`UPDATE writing_rules SET ${sets.join(", ")} WHERE id = ?`).run(...values);

  return db
    .prepare(
      `SELECT id, writing_type as writingType, category, rule_text as ruleText, when_to_apply as whenToApply,
              why, severity, example_before as exampleBefore, example_after as exampleAfter, source,
              signal_count as signalCount, notes, created_at as createdAt, updated_at as updatedAt
       FROM writing_rules WHERE id = ?`,
    )
    .get(params.id) as WritingRule;
}

export function deleteWritingRule(
  db: Database.Database,
  ruleId: string,
): { success: true } | { error: string } {
  const result = db.prepare("DELETE FROM writing_rules WHERE id = ?").run(ruleId);

  if (result.changes === 0) {
    return { error: `Writing rule not found: ${ruleId}` };
  }

  return { success: true };
}

const TYPE_LABELS: Record<string, string> = {
  general: "General",
  email: "Email",
  prd: "PRD",
  blog: "Blog / essay",
  "cover-letter": "Cover letter",
  resume: "Resume",
  slack: "Slack",
  pitch: "Pitch",
  outreach: "Outreach",
};

/**
 * Port of generate_writing_rules_markdown from writing_rules.rs:68-178.
 * Groups rules by writing_type → category, formats with severity badges.
 */
export function getWritingRulesMarkdown(rules: WritingRule[]): string {
  const lines: string[] = [];
  lines.push("# Writing Rules");
  lines.push("");
  lines.push(
    "_For AI agents: apply rules matching the writing type. General rules always apply._",
  );

  // Group by writing_type preserving insertion order
  const groups = new Map<string, WritingRule[]>();
  for (const rule of rules) {
    const existing = groups.get(rule.writingType);
    if (existing) {
      existing.push(rule);
    } else {
      groups.set(rule.writingType, [rule]);
    }
  }

  // Sort: "general" first, then alphabetical
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "general") return -1;
    if (b === "general") return 1;
    return a.localeCompare(b);
  });

  for (const writingType of sortedKeys) {
    const groupRules = groups.get(writingType)!;
    lines.push("");
    const label = TYPE_LABELS[writingType] ?? writingType;
    lines.push(`## ${label}`);

    // Sub-group by category
    const catGroups = new Map<string, WritingRule[]>();
    for (const rule of groupRules) {
      const existing = catGroups.get(rule.category);
      if (existing) {
        existing.push(rule);
      } else {
        catGroups.set(rule.category, [rule]);
      }
    }

    for (const [category, catRules] of catGroups) {
      lines.push("");
      const catLabel = category
        .replace(/-/g, " ")
        .split(/\s+/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
        .join(" ");
      lines.push(`### ${catLabel}`);

      for (const rule of catRules) {
        lines.push("");
        lines.push(`**Rule: ${rule.ruleText}** [${rule.severity}]`);
        if (rule.whenToApply) {
          lines.push(`- When to apply: ${rule.whenToApply}`);
        }
        if (rule.why) {
          lines.push(`- Why: ${rule.why}`);
        }
        lines.push(`- Signal: seen ${rule.signalCount} time(s)`);
        if (rule.exampleBefore || rule.exampleAfter) {
          lines.push("- Before -> After:");
          if (rule.exampleBefore) {
            lines.push(`  - Before: "${rule.exampleBefore}"`);
          }
          if (rule.exampleAfter) {
            lines.push(`  - After: "${rule.exampleAfter}"`);
          }
        }
        if (rule.notes) {
          lines.push(`- Notes: ${rule.notes}`);
        }
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
