import type { Node as PMNode } from "@tiptap/pm/model";
import type { WritingRule } from "@/lib/tauri-commands";
import { compile, scan } from "@/lib/tells/tells.js";
import type { TellRule, TellTier, TellsEngine, TellsRulesDoc } from "@/lib/tells/tells.js";
import rulesJson from "@/lib/tells/tells.json";
import { scanDocForRules, type RuleMatch } from "./rule-scan";

export const TELLS_SOURCE = "tells";
const TELL_ID_PREFIX = "tells:";
const MAX_TELL_MATCHES = 200;

let engine: TellsEngine | null = null;
let rulesById: Map<string, TellRule> | null = null;

function getEngine(): TellsEngine {
  if (!engine) {
    engine = compile(rulesJson as TellsRulesDoc);
    rulesById = new Map(engine.compiled.map(({ rule }) => [rule.id, rule]));
  }
  return engine;
}

export function isTellRuleId(ruleId: string): boolean {
  return ruleId.startsWith(TELL_ID_PREFIX);
}

/**
 * Scan the doc for AI tells. Like scanDocForRules, each text node is scanned
 * on its own, so a phrase split by a mark or link isn't caught. Code and
 * blockquotes are skipped: quoted text isn't the writer's own.
 */
export function scanDocForTells(doc: PMNode, tiers: TellTier[] = ["flag"]): RuleMatch[] {
  const eng = getEngine();
  const matches: RuleMatch[] = [];
  doc.descendants((node, pos) => {
    if (matches.length >= MAX_TELL_MATCHES) return false;
    if (node.type.name === "codeBlock" || node.type.name === "blockquote") return false;
    if (!node.isText) return true;
    if (node.marks.some((m) => m.type.name === "code")) return true;

    const { matches: found } = scan(eng, node.text ?? "", { tiers });
    for (const m of found) {
      if (matches.length >= MAX_TELL_MATCHES) break;
      matches.push({
        from: pos + m.start,
        to: pos + m.end,
        ruleId: TELL_ID_PREFIX + m.id,
        ruleText: m.note,
        severity: "nice-to-fix",
        why: null,
        suggestion: m.fix,
      });
    }
    return true;
  });
  return matches;
}

/** Personal rules win: a tell touching any personal match is dropped. */
export function mergeRuleMatches(personal: RuleMatch[], tells: RuleMatch[]): RuleMatch[] {
  const kept = tells.filter((t) => !personal.some((p) => t.from < p.to && p.from < t.to));
  return [...personal, ...kept];
}

export function scanDocForMatches(
  doc: PMNode,
  rules: WritingRule[],
  { aiTells }: { aiTells: boolean },
): RuleMatch[] {
  const personal = scanDocForRules(doc, rules);
  return aiTells ? mergeRuleMatches(personal, scanDocForTells(doc)) : personal;
}

/** A tell shaped like a writing rule, so the rule card can show it. */
export function tellAsWritingRule(ruleId: string): WritingRule | null {
  if (!isTellRuleId(ruleId)) return null;
  getEngine();
  const tell = rulesById?.get(ruleId.slice(TELL_ID_PREFIX.length));
  if (!tell) return null;
  return {
    id: ruleId,
    writingType: "general",
    category: tell.category.replace(/^margin-/, ""),
    ruleText: tell.note,
    whenToApply: null,
    why: null,
    severity: "nice-to-fix",
    exampleBefore: null,
    exampleAfter: tell.fix,
    source: TELLS_SOURCE,
    signalCount: 0,
    notes: null,
    reviewedAt: null,
    detectionPattern: null,
    createdAt: 0,
    updatedAt: 0,
  };
}
