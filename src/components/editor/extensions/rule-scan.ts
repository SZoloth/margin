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
  /** Mark one match as open — renders data-open on its decoration span. */
  open?: { from: number; to: number } | null;
  /** A rule that was just made: its matches draw in, in reading order. */
  fresh?: string | null;
  /** One match to wash briefly, after "Caught N more" scrolls to it. */
  flash?: { from: number; to: number } | null;
}

type Range = { from: number; to: number };

interface RuleScanState {
  set: DecorationSet;
  matches: RuleMatch[];
  open: Range | null;
  fresh: string | null;
  flash: Range | null;
}

const ruleScanKey = new PluginKey<RuleScanState>("ruleScan");

const MAX_MATCHES = 200;

interface CompiledMatcher {
  rule: WritingRule;
  regex: RegExp;
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

  try {
    if (rule.detectionPattern) {
      return { rule, regex: new RegExp(rule.detectionPattern, "gi") };
    }
    if (rule.category === "kill-words") {
      return { rule, regex: new RegExp(escapeRegExp(rule.ruleText), "gi") };
    }
    if (rule.exampleBefore) {
      if (rule.category === "auto-synthesized") {
        return { rule, regex: new RegExp(escapeRegExp(rule.exampleBefore), "gi") };
      }
      if (rule.category === "ai-slop" || rule.category === "heading-patterns") {
        return { rule, regex: new RegExp(rule.exampleBefore, "gi") };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    for (const { rule, regex } of matchers) {
      if (matches.length >= MAX_MATCHES) break;
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
    }
    return true;
  });
  return matches;
}

interface DecoState {
  open: Range | null;
  fresh: string | null;
  flash: Range | null;
}

const FRESH_STAGGER_MS = 180;

function sameRange(m: Range, r: Range | null): boolean {
  return !!r && m.from === r.from && m.to === r.to;
}

function buildDecorations(state: EditorState, matches: RuleMatch[], s: DecoState): DecorationSet {
  let freshIndex = 0;
  const decos = matches
    .filter((m) => m.from < m.to && m.to <= state.doc.content.size)
    .map((m) => {
      const isFresh = s.fresh !== null && m.ruleId === s.fresh;
      const delay = isFresh ? freshIndex++ * FRESH_STAGGER_MS : 0;
      return Decoration.inline(m.from, m.to, {
        class: `rule-violation rule-violation--${m.severity}${isFresh ? " rule-violation--fresh" : ""}`,
        "data-rule-id": m.ruleId,
        ...(isFresh ? { style: `--rv-d: ${delay}ms` } : {}),
        ...(sameRange(m, s.open) ? { "data-open": "" } : {}),
        ...(sameRange(m, s.flash) ? { "data-flash": "" } : {}),
      });
    });
  return DecorationSet.create(state.doc, decos);
}

/** Dispatch updated matches into the scan plugin. */
export function setRuleScanMatches(tr: Transaction, matches: RuleMatch[]): Transaction {
  return tr.setMeta(ruleScanKey, { ...(tr.getMeta(ruleScanKey) ?? {}), matches } satisfies RuleScanMeta);
}

/** Mark a just-made rule so its matches draw in; null clears it. */
export function setRuleScanFresh(tr: Transaction, ruleId: string | null): Transaction {
  return tr.setMeta(ruleScanKey, { ...(tr.getMeta(ruleScanKey) ?? {}), fresh: ruleId } satisfies RuleScanMeta);
}

/** Wash one match briefly (data-flash); null clears it. */
export function setRuleScanFlash(tr: Transaction, range: Range | null): Transaction {
  return tr.setMeta(ruleScanKey, {
    ...(tr.getMeta(ruleScanKey) ?? {}),
    flash: range ? { from: range.from, to: range.to } : null,
  } satisfies RuleScanMeta);
}

/** Mark/unmark the match whose card is open — drives the data-open wash. */
export function setRuleScanOpen(
  tr: Transaction,
  open: { from: number; to: number } | null,
): Transaction {
  return tr.setMeta(ruleScanKey, { ...(tr.getMeta(ruleScanKey) ?? {}), open } satisfies RuleScanMeta);
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
      new Plugin<RuleScanState>({
        key: ruleScanKey,
        state: {
          init: (_config, state) => ({
            set: buildDecorations(state, [], { open: null, fresh: null, flash: null }),
            matches: [],
            open: null,
            fresh: null,
            flash: null,
          }),
          apply(tr, old, _oldState, newState) {
            const meta = tr.getMeta(ruleScanKey) as RuleScanMeta | undefined;
            if (meta) {
              const next = {
                matches: meta.matches !== undefined ? meta.matches : old.matches,
                open: "open" in meta ? (meta.open ?? null) : old.open,
                fresh: "fresh" in meta ? (meta.fresh ?? null) : old.fresh,
                flash: "flash" in meta ? (meta.flash ?? null) : old.flash,
              };
              return { ...next, set: buildDecorations(newState, next.matches, next) };
            }
            if (!tr.docChanged) return old;
            const mapRange = (r: Range | null) =>
              r ? { from: tr.mapping.map(r.from), to: tr.mapping.map(r.to) } : null;
            return {
              set: old.set.map(tr.mapping, tr.doc),
              matches: old.matches,
              open: mapRange(old.open),
              fresh: old.fresh,
              flash: mapRange(old.flash),
            };
          },
        },
        props: {
          decorations(state) {
            return ruleScanKey.getState(state)?.set ?? DecorationSet.empty;
          },
          handleClick(view, _pos, event) {
            const el = (event.target as HTMLElement).closest?.(".rule-violation");
            if (!el) return false;
            // The match payload isn't on the decoration — the listener
            // resolves ruleId → rule from the rules list it already holds.
            const from = view.posAtDOM(el, 0);
            const to = from + ((el as HTMLElement).textContent?.length ?? 0);
            const ruleId = (el as HTMLElement).dataset.ruleId ?? "";
            const tr = setRuleScanOpen(view.state.tr, { from, to });
            tr.setMeta("addToHistory", false);
            view.dispatch(tr);
            // All ranges for this rule — lets the card offer "N of M"
            // context and a replace-all without re-scanning.
            const all =
              ruleScanKey
                .getState(view.state)
                ?.matches.filter((m) => m.ruleId === ruleId)
                .map((m) => ({ from: m.from, to: m.to })) ?? [];
            window.dispatchEvent(
              new CustomEvent("margin:rule-violation", {
                detail: {
                  ruleId,
                  rect: (el as HTMLElement).getBoundingClientRect(),
                  el,
                  from,
                  to,
                  allRanges: all,
                  matched: (el as HTMLElement).textContent ?? "",
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
