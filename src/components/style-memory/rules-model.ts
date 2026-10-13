import { WRITING_TYPES } from "@/lib/writing-types";
import type { WritingRule, WritingRuleSeverity } from "@/lib/tauri-commands";
import { plural } from "./controls";

export interface RuleCounts {
  inEffect: number;
  suggested: number;
}

/** Mirrors the export gate in cli/db/rules.go (unreviewedCandidateFilter). */
export function isSuggested(rule: Pick<WritingRule, "source" | "reviewedAt">): boolean {
  return rule.source === "synthesis-candidate" && rule.reviewedAt == null;
}

export function countRules(rules: WritingRule[]): RuleCounts {
  let suggested = 0;
  for (const r of rules) if (isSuggested(r)) suggested += 1;
  return { inEffect: rules.length - suggested, suggested };
}

/**
 * Three severities, two behaviours. Only must-fix changes what happens: the
 * guard checks must-fix word bans and heading patterns, and the review prompt
 * always includes must-fix rules (cli/profile/export.go, coaching.go). Should-fix
 * and nice-to-fix differ only in the tag Claude reads, so the app shows them as
 * one level. The database keeps all three values.
 */
export type Strictness = "hard" | "preference";

export function strictnessOf(severity: WritingRuleSeverity | string): Strictness {
  return severity === "must-fix" ? "hard" : "preference";
}

/** Changing strictness keeps a preference's existing severity where it can. */
export function severityFor(strictness: Strictness, current: WritingRuleSeverity): WritingRuleSeverity {
  if (strictness === "hard") return "must-fix";
  return current === "must-fix" ? "should-fix" : current;
}

export const STRICTNESS_LABEL: Record<Strictness, string> = {
  hard: "Hard rule",
  preference: "Preference",
};

export const STRICTNESS_HELP: Record<Strictness, string> = {
  hard: "Claude must not do this. Margin also checks for it on save where it can.",
  preference: "Claude leans this way and weighs it against your other rules.",
};

/**
 * Mirrors GenerateWritingGuardPy in cli/profile/export.go: which rules the
 * writing guard scans for, as opposed to rules Claude is only told about.
 */
export function isChecked(
  rule: Pick<WritingRule, "detectionPattern" | "severity" | "category" | "exampleBefore">,
): boolean {
  if (rule.detectionPattern) return true;
  if (rule.severity !== "must-fix") return false;
  return rule.category === "kill-words" || (rule.category === "heading-patterns" && rule.exampleBefore != null);
}

export function typeLabel(value: string): string {
  return WRITING_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** Writing types in the app's own order, unknown ones last. */
export function typeOrder(value: string): number {
  const i = WRITING_TYPES.findIndex((t) => t.value === value);
  return i === -1 ? WRITING_TYPES.length : i;
}

/** Category ids are pipeline vocabulary; these are the names a writer would use. */
const CATEGORY_LABELS: Record<string, string> = {
  "kill-words": "Words to cut",
  "ai-slop": "AI tells",
  "voice-calibration": "Voice",
  prohibition: "Never",
  "heading-patterns": "Headings",
};

export function categoryLabel(category: string): string {
  const known = CATEGORY_LABELS[category];
  if (known) return known;
  const s = category.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Where a rule came from, in the user's words rather than the source column. */
export function provenance(rule: Pick<WritingRule, "source" | "signalCount">): string {
  if (rule.source === "seed") return "From your style guide";
  if (rule.source === "manual") return "Added by you";
  return `From ${plural(rule.signalCount, "note", "notes")}`;
}

/**
 * The highlight ids a synthesized rule was made from. Same format the backend
 * parses (parse_synthesized_from in writing_rules.rs): the list ends at the
 * first ";" or newline.
 */
export function sourceNoteIds(notes: string | null): string[] {
  if (!notes?.startsWith("synthesized-from:")) return [];
  const list = notes.slice("synthesized-from:".length).split(/[;\n]/)[0] ?? "";
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function matchesQuery(rule: WritingRule, q: string): boolean {
  if (!q) return true;
  return [rule.ruleText, rule.whenToApply, rule.why, rule.category, rule.exampleBefore, rule.exampleAfter]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .includes(q);
}

/** Hard rules first, then the ones with the most notes behind them. */
export function compareRules(a: WritingRule, b: WritingRule): number {
  const sa = strictnessOf(a.severity) === "hard" ? 0 : 1;
  const sb = strictnessOf(b.severity) === "hard" ? 0 : 1;
  return sa - sb || b.signalCount - a.signalCount || b.createdAt - a.createdAt;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
