import type Database from "better-sqlite3";

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
