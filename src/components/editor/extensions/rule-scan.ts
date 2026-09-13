import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { WritingRule } from "@/lib/tauri-commands";

export interface RuleMatch {
  from: number;
  to: number;
  ruleId: string;
  ruleText: string;
  severity: string;
  why: string | null;
  suggestion: string | null;
}

interface RuleScanMeta {
  matches?: RuleMatch[];
}

const ruleScanKey = new PluginKey<DecorationSet>("ruleScan");

const MAX_MATCHES = 200;

interface CompiledMatcher {
  rule: WritingRule;
  regex: RegExp | null;
  literal: string | null;
}

/**
 * Compile a rule into something that can scan text, mirroring the guard
 * hook's semantics: detection_pattern and ai-slop/heading-patterns
 * example_before are regexes; kill-words rule_text and auto-synthesized
 * example_before are literal substrings.
 */
function compileRule(rule: WritingRule): CompiledMatcher | null {
  const isCandidate = rule.source === "synthesis-candidate" && rule.reviewedAt === null;
  if (isCandidate || rule.writingType !== "general") return null;

  if (rule.detectionPattern) {
    try {
      return { rule, regex: new RegExp(rule.detectionPattern, "gi"), literal: null };
    } catch {
      return null;
    }
  }
  if (rule.category === "kill-words") {
    return { rule, regex: null, literal: rule.ruleText };
  }
  if (rule.exampleBefore) {
    if (rule.category === "auto-synthesized") {
      return { rule, regex: null, literal: rule.exampleBefore };
    }
    if (rule.category === "ai-slop" || rule.category === "heading-patterns") {
      try {
        return { rule, regex: new RegExp(rule.exampleBefore, "gi"), literal: null };
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Scan the doc for rule violations. Pure + synchronous — regexes run per
 * text node so match positions never cross node boundaries (a deliberate
 * limit; every seeded pattern is single-phrase).
 */
export function scanDocForRules(doc: PMNode, rules: WritingRule[]): RuleMatch[] {
  const matchers = rules.map(compileRule).filter((m): m is CompiledMatcher => m !== null);
  if (matchers.length === 0) return [];

  const matches: RuleMatch[] = [];
  doc.descendants((node, pos) => {
    if (matches.length >= MAX_MATCHES) return false;
    if (node.type.name === "codeBlock") return false;
    if (!node.isText) return true;
    if (node.marks.some((m) => m.type.name === "code")) return true;

    const text = node.text ?? "";
    for (const { rule, regex, literal } of matchers) {
      if (matches.length >= MAX_MATCHES) break;
      if (regex) {
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) {
          if (m[0].length === 0) break;
          matches.push({
            from: pos + m.index,
            to: pos + m.index + m[0].length,
            ruleId: rule.id,
            ruleText: rule.ruleText,
            severity: rule.severity,
            why: rule.why,
            suggestion: rule.exampleAfter,
          });
          if (matches.length >= MAX_MATCHES) break;
        }
      } else if (literal) {
        let idx = text.indexOf(literal);
        while (idx !== -1 && matches.length < MAX_MATCHES) {
          matches.push({
            from: pos + idx,
            to: pos + idx + literal.length,
            ruleId: rule.id,
            ruleText: rule.ruleText,
            severity: rule.severity,
            why: rule.why,
            suggestion: rule.exampleAfter,
          });
          idx = text.indexOf(literal, idx + literal.length);
        }
      }
    }
    return true;
  });
  return matches;
}

function buildDecorations(state: EditorState, matches: RuleMatch[]): DecorationSet {
  const decos = matches
    .filter((m) => m.from < m.to && m.to <= state.doc.content.size)
    .map((m) =>
      Decoration.inline(m.from, m.to, {
        class: `rule-violation rule-violation--${m.severity}`,
        "data-rule-id": m.ruleId,
      }),
    );
  return DecorationSet.create(state.doc, decos);
}

/** Dispatch updated matches into the scan plugin. */
export function setRuleScanMatches(tr: Transaction, matches: RuleMatch[]): Transaction {
  return tr.setMeta(ruleScanKey, { matches } satisfies RuleScanMeta);
}

/**
 * Decorations for text matching active writing rules — corrections
 * resurfacing in the reader. Matches arrive via setRuleScanMatches; the
 * plugin maps them across transactions between scans.
 */
export const RuleScan = Extension.create({
  name: "ruleScan",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: ruleScanKey,
        state: {
          init: (_config, state) => buildDecorations(state, []),
          apply(tr, old, _oldState, newState) {
            const meta = tr.getMeta(ruleScanKey) as RuleScanMeta | undefined;
            if (meta?.matches !== undefined) {
              return buildDecorations(newState, meta.matches);
            }
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
          },
        },
        props: {
          decorations(state) {
            return ruleScanKey.getState(state);
          },
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement).closest?.(".rule-violation");
            if (!el) return false;
            // The match payload isn't on the decoration — the listener
            // resolves ruleId → rule from the rules list it already holds.
            window.dispatchEvent(
              new CustomEvent("margin:rule-violation", {
                detail: {
                  ruleId: (el as HTMLElement).dataset.ruleId ?? "",
                  rect: (el as HTMLElement).getBoundingClientRect(),
                },
              }),
            );
            return false;
          },
        },
      }),
    ];
  },
});
