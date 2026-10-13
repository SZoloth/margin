import type { WritingRule } from "@/lib/tauri-commands";
import { isSuggested } from "./rules-model";

/**
 * A browser-side copy of what the writing guard checks (GenerateWritingGuardPy
 * in cli/profile/export.go), so "Try your rules" shows the same hits:
 *   - hard: must-fix kill words, prohibition patterns, must-fix heading patterns
 *   - soft: every other detection pattern, grouped by family; soft hits only
 *     block when two or more families show up together
 * The guard only blocks on published paths; elsewhere it warns.
 */
export interface BenchHit {
  ruleId: string;
  start: number;
  end: number;
  kind: "hard" | "soft";
  family?: string;
}

export interface BenchResult {
  hits: BenchHit[];
  hardRuleIds: string[];
  softFamilies: string[];
  /** Whether the guard would stop this save on a published file. */
  wouldBlock: boolean;
}

/** Python patterns may lead with an inline flag group; JS wants real flags. */
export function toRegExp(pattern: string): RegExp | null {
  let source = pattern;
  let flags = "g";
  const inline = /^\(\?([aimsux]+)\)/.exec(source);
  if (inline) {
    source = source.slice(inline[0].length);
    if (inline[1]!.includes("i")) flags += "i";
    if (inline[1]!.includes("m")) flags += "m";
    if (inline[1]!.includes("s")) flags += "s";
  }
  try {
    return new RegExp(source, flags);
  } catch {
    return null; // The guard skips invalid patterns too (fail-open per pattern).
  }
}

function familyOf(rule: WritingRule): string {
  for (const line of (rule.notes ?? "").split("\n")) {
    if (line.startsWith("slop-family:")) return line.slice("slop-family:".length).trim();
  }
  return rule.category;
}

function allMatches(rx: RegExp, text: string, offset = 0): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  rx.lastIndex = 0;
  for (let m = rx.exec(text); m; m = rx.exec(text)) {
    if (m[0].length === 0) {
      rx.lastIndex += 1;
      continue;
    }
    out.push([offset + m.index, offset + m.index + m[0].length]);
  }
  return out;
}

export function scanDraft(text: string, rules: WritingRule[]): BenchResult {
  const hits: BenchHit[] = [];
  const lower = text.toLowerCase();

  for (const rule of rules) {
    if (isSuggested(rule)) continue;
    const mustFix = rule.severity === "must-fix";

    if (mustFix && rule.category === "kill-words") {
      const word = rule.ruleText.toLowerCase();
      if (!word) continue;
      for (let i = lower.indexOf(word); i !== -1; i = lower.indexOf(word, i + word.length)) {
        hits.push({ ruleId: rule.id, start: i, end: i + word.length, kind: "hard" });
      }
    }

    if (mustFix && rule.category === "heading-patterns" && rule.exampleBefore) {
      const rx = toRegExp(rule.exampleBefore);
      if (rx) {
        let lineStart = 0;
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("##")) {
            const heading = trimmed.replace(/^#+/, "").trim();
            const at = lineStart + line.indexOf(heading);
            if (heading && allMatches(rx, heading).length > 0) {
              hits.push({ ruleId: rule.id, start: at, end: at + heading.length, kind: "hard" });
            }
          }
          lineStart += line.length + 1;
        }
      }
    }

    if (rule.detectionPattern) {
      const rx = toRegExp(rule.detectionPattern);
      if (!rx) continue;
      const kind = rule.category === "prohibition" ? "hard" : "soft";
      for (const [start, end] of allMatches(rx, text)) {
        hits.push({ ruleId: rule.id, start, end, kind, family: kind === "soft" ? familyOf(rule) : undefined });
      }
    }
  }

  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const hardRuleIds = [...new Set(hits.filter((h) => h.kind === "hard").map((h) => h.ruleId))];
  const softFamilies = [...new Set(hits.filter((h) => h.kind === "soft").map((h) => h.family!))].sort();
  return { hits, hardRuleIds, softFamilies, wouldBlock: hardRuleIds.length > 0 || softFamilies.length >= 2 };
}
