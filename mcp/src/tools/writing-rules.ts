import type Database from "better-sqlite3";
import type { CorrectionRecord } from "./corrections.js";
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

export interface CreateWritingRuleParams {
  rule_text: string;
  writing_type: string;
  category: string;
  severity: string;
  when_to_apply?: string | null;
  why?: string | null;
  example_before?: string | null;
  example_after?: string | null;
  notes?: string | null;
  source?: string;
  signal_count?: number;
}

export function createWritingRule(
  db: Database.Database,
  params: CreateWritingRuleParams,
): WritingRule | { error: string } {
  if (!VALID_SEVERITIES.includes(params.severity as (typeof VALID_SEVERITIES)[number])) {
    return { error: `Invalid severity "${params.severity}". Allowed: ${VALID_SEVERITIES.join(", ")}` };
  }

  if (!VALID_WRITING_TYPES.includes(params.writing_type as (typeof VALID_WRITING_TYPES)[number])) {
    return { error: `Invalid writing_type "${params.writing_type}". Allowed: ${VALID_WRITING_TYPES.join(", ")}` };
  }

  const id = crypto.randomUUID();
  const now = nowMillis();
  const source = params.source ?? "synthesis";
  const signalCount = params.signal_count ?? 1;
  if (!Number.isInteger(signalCount) || signalCount < 1) {
    return { error: `Invalid signal_count "${String(params.signal_count)}". Must be an integer >= 1.` };
  }

  db.prepare(
    `INSERT INTO writing_rules (id, writing_type, category, rule_text, when_to_apply, why, severity, example_before, example_after, source, signal_count, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(writing_type, category, rule_text) DO UPDATE SET
       when_to_apply = COALESCE(excluded.when_to_apply, writing_rules.when_to_apply),
       why = COALESCE(excluded.why, writing_rules.why),
       severity = CASE
         WHEN writing_rules.severity = 'must-fix' OR excluded.severity = 'must-fix' THEN 'must-fix'
         WHEN writing_rules.severity = 'should-fix' OR excluded.severity = 'should-fix' THEN 'should-fix'
         ELSE 'nice-to-fix'
       END,
       example_before = COALESCE(excluded.example_before, writing_rules.example_before),
       example_after = COALESCE(excluded.example_after, writing_rules.example_after),
       signal_count = writing_rules.signal_count + excluded.signal_count,
       notes = COALESCE(excluded.notes, writing_rules.notes),
       updated_at = excluded.updated_at`,
  ).run(
    id, params.writing_type, params.category, params.rule_text,
    params.when_to_apply ?? null, params.why ?? null, params.severity,
    params.example_before ?? null, params.example_after ?? null,
    source, signalCount, params.notes ?? null, now, now,
  );

  return db
    .prepare(
      `SELECT id, writing_type as writingType, category, rule_text as ruleText, when_to_apply as whenToApply,
              why, severity, example_before as exampleBefore, example_after as exampleAfter, source,
              signal_count as signalCount, notes, created_at as createdAt, updated_at as updatedAt
       FROM writing_rules WHERE writing_type = ? AND category = ? AND rule_text = ?`,
    )
    .get(params.writing_type, params.category, params.rule_text) as WritingRule;
}

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
  signal_count?: number;
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
  if (params.signal_count !== undefined) { sets.push("signal_count = ?"); values.push(params.signal_count); }

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
 * Rules-only markdown (used by MCP resource and get_writing_rules_markdown tool).
 * For the full unified profile written to ~/.margin/writing-rules.md, use getWritingProfileMarkdown.
 */
export function getWritingRulesMarkdown(rules: WritingRule[]): string {
  const lines: string[] = [];
  lines.push("# Writing Rules");
  lines.push("");
  lines.push(
    "_For AI agents: apply rules matching the writing type. General rules always apply._",
  );
  lines.push(...formatRulesSection(rules));
  lines.push("");
  return lines.join("\n");
}

/** Unicode-safe truncation — iterates code points, not UTF-16 code units. */
function truncate(text: string, max: number): string {
  const codePoints = [...text];
  if (codePoints.length <= max) return text;
  return codePoints.slice(0, max).join("") + "…";
}

/**
 * Unified writing profile: voice calibration + corrections + rules.
 * Mirrors generate_writing_profile_markdown in writing_rules.rs.
 */
export function getWritingProfileMarkdown(
  rules: WritingRule[],
  corrections: Pick<CorrectionRecord, "originalText" | "notes" | "polarity">[],
): string {
  const lines: string[] = [];
  lines.push("# Writing Profile");
  lines.push("");
  lines.push("_Generated by Margin. Voice calibration + corrections + writing rules in one file._");
  lines.push("_For AI agents: apply rules matching the writing type. General rules always apply._");

  // Voice calibration section
  const voiceRules = rules.filter((r) => r.category === "voice-calibration");
  if (voiceRules.length > 0) {
    lines.push("", "---", "", "## Voice Calibration", "");
    lines.push("_Statistical voice fingerprint. These are constraints, not suggestions._");
    for (const rule of voiceRules) {
      lines.push("", `- **${rule.ruleText}**`);
      if (rule.whenToApply) lines.push(`  - When: ${rule.whenToApply}`);
      if (rule.why) lines.push(`  - Why: ${rule.why}`);
    }
  }

  // Corrections by polarity
  const positive = corrections.filter((c) => c.polarity === "positive");
  const corrective = corrections.filter((c) => c.polarity === "corrective");
  const unclassified = corrections.filter((c) => c.polarity !== "positive" && c.polarity !== "corrective");

  if (positive.length > 0) {
    lines.push("", "---", "", "## Writing Samples", "");
    lines.push("_Patterns to emulate — do more of this._");
    for (const c of positive) {
      const snippet = truncate(c.originalText, 200);
      lines.push("", `> ${snippet.replace(/\n/g, "\n> ")}`);
      if (c.notes.length > 0) lines.push(`— ${c.notes.join("; ")}`);
    }
  }

  if (corrective.length > 0) {
    lines.push("", "---", "", "## Corrections", "");
    lines.push("_Patterns to avoid — don't do this._");
    for (const c of corrective) {
      const snippet = truncate(c.originalText, 200);
      lines.push("", `- **${snippet}** → ${c.notes.join("; ")}`);
    }
  }

  if (unclassified.length > 0) {
    lines.push("", "---", "", "## Unclassified", "");
    lines.push("_These annotations haven't been tagged as positive or corrective yet._");
    for (const c of unclassified) {
      const snippet = truncate(c.originalText, 120);
      const note = c.notes.length === 0 ? "flagged" : c.notes.join("; ");
      lines.push("", `- ${snippet} → ${note}`);
    }
  }

  // Non-voice rules
  const nonVoiceRules = rules.filter((r) => r.category !== "voice-calibration");
  if (nonVoiceRules.length > 0) {
    lines.push("", "---", "", "# Writing Rules", "");
    lines.push("_Synthesized from corrections and editorial preferences._");
    lines.push(...formatRulesSection(nonVoiceRules));
  }

  lines.push("");
  return lines.join("\n");
}

/** Shared rules section formatter (extracted from getWritingRulesMarkdown). */
function formatRulesSection(rules: WritingRule[]): string[] {
  const lines: string[] = [];

  const groups = new Map<string, WritingRule[]>();
  for (const rule of rules) {
    const existing = groups.get(rule.writingType);
    if (existing) existing.push(rule);
    else groups.set(rule.writingType, [rule]);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === "general") return -1;
    if (b === "general") return 1;
    return a.localeCompare(b);
  });

  for (const writingType of sortedKeys) {
    const groupRules = groups.get(writingType)!;
    lines.push("");
    lines.push(`## ${TYPE_LABELS[writingType] ?? writingType}`);

    const catGroups = new Map<string, WritingRule[]>();
    for (const rule of groupRules) {
      const existing = catGroups.get(rule.category);
      if (existing) existing.push(rule);
      else catGroups.set(rule.category, [rule]);
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
        if (rule.whenToApply) lines.push(`- When to apply: ${rule.whenToApply}`);
        if (rule.why) lines.push(`- Why: ${rule.why}`);
        lines.push(`- Signal: seen ${rule.signalCount} time(s)`);
        if (rule.exampleBefore || rule.exampleAfter) {
          lines.push("- Before -> After:");
          if (rule.exampleBefore) lines.push(`  - Before: "${rule.exampleBefore}"`);
          if (rule.exampleAfter) lines.push(`  - After: "${rule.exampleAfter}"`);
        }
        if (rule.notes) lines.push(`- Notes: ${rule.notes}`);
      }
    }
  }

  return lines;
}

/**
 * Port of generate_writing_guard_py from writing_rules.rs.
 * Generates the writing guard hook Python script from must-fix kill words and ai-slop patterns.
 */
export function getWritingGuardPy(rules: WritingRule[]): string {
  const killWords = rules
    .filter((r) => r.severity === "must-fix" && r.category === "kill-words")
    .map((r) => r.ruleText);

  const slopPatterns = rules
    .filter((r) => r.category === "ai-slop" && r.exampleBefore)
    .map((r) => [r.exampleBefore!, r.ruleText]);

  const killWordsJson = JSON.stringify(killWords);
  const slopPatternsJson = JSON.stringify(slopPatterns);

  if (killWordsJson.includes('"""') || slopPatternsJson.includes('"""')) {
    return `#!/usr/bin/env python3
# ERROR: A writing rule contains a triple-quote sequence that cannot be safely
# embedded. Remove the offending rule text and re-export.
import sys; print('writing_guard: triple-quote injection blocked — skipping guard', file=sys.stderr); sys.exit(1)
`;
  }

  return `#!/usr/bin/env python3
"""
Writing guard hook — AUTO-GENERATED by Margin's export_writing_rules command.
Do not edit manually. Changes will be overwritten.

Kill words and slop patterns are loaded from JSON data blobs for safety.
Source of truth: ~/.margin/margin.db (writing_rules table)
"""
import json, sys, re

# Only check prose file extensions
PROSE_EXTENSIONS = {".md", ".mdx", ".txt", ".html", ".htm"}

# Kill words — loaded from JSON for codegen safety.
KILL_WORDS = json.loads(r"""${killWordsJson}""")

# AI-slop sentence patterns — [pattern, explanation]
SLOP_PATTERNS = json.loads(r"""${slopPatternsJson}""")

def get_extension(path):
    if not path:
        return ""
    dot = path.rfind(".")
    return path[dot:].lower() if dot != -1 else ""

def main():
    try:
        data = json.load(sys.stdin)
        tool = data.get("tool_name", "")
        inp = data.get("tool_input") or {}

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
                violations.append(f'Kill word: "{word}"')

        # Check slop patterns
        for pattern, explanation in SLOP_PATTERNS:
            if re.search(pattern, text):
                violations.append(explanation)

        if violations:
            msg = "WRITING GUARD: AI-slop patterns detected:\\n"
            for v in violations:
                msg += f"  - {v}\\n"
            msg += "Rephrase to sound human. See ~/.margin/writing-rules.md for examples."

            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": msg
                }
            }))

    except Exception as e:
        # Fail-open: never block writes due to hook errors
        print(f"Writing guard encountered an error (fail-open): {e}", file=sys.stderr)

    sys.exit(0)

if __name__ == "__main__":
    main()
`;
}
