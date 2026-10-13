/** Prompts for the rewrite arms and the two LLM judges. */

/**
 * A1: the generic rewriter. Intent matches the humanizer's instruction, but this
 * is NOT its verbatim text (that lives in the model's prompt_format.json), and
 * it runs on the Margin editor model. Its job is to separate "was asked to
 * humanize" from "had Sam's rules".
 */
export function genericEditPrompt(draft: string): string {
  return `Rewrite the text below so it reads like a person wrote it, not a language model. Keep every fact, number, date, name and quotation exactly as written. Add nothing new. Keep the length close to the original.

Output ONLY the rewritten text, with no commentary.

TEXT:
${draft.trim()}`;
}

/** A3: same shape as editWithRules() in autoresearch/generators/arch-c-editor.ts, fed a fixed draft. */
export function ruleEditPrompt(draft: string, rules: string): string {
  return `You are an editor. Revise the draft below to comply with the writing rules. Make minimal changes: only what's needed to fix violations. Preserve the meaning, structure and every fact (numbers, dates, names, quotations).

WRITING RULES:
${rules}

---

DRAFT TO EDIT:
${draft.trim()}

---

Output ONLY the revised prose: no commentary, explanations, or tracking changes.`;
}

export interface Span {
  id: string;
  text: string;
  notes: string[];
}

/** V1 judge: one call per (draft, arm) covering all flagged spans. */
export function spanJudgePrompt(spans: Span[], output: string): string {
  const list = spans
    .map((s) => `- id: ${s.id}\n  flagged text: ${JSON.stringify(s.text)}\n  author's note: ${JSON.stringify(s.notes.join(" | "))}`)
    .join("\n");
  return `An author flagged passages in an earlier draft and wrote a note saying what was wrong. Below is a REWRITE of that draft. For each flagged passage, decide whether the problem the note describes is fixed in the rewrite.

Verdicts:
- "fixed": the passage was changed in a way that resolves the note
- "unchanged": the passage (or an equivalent) is still there with the same problem
- "worse": the passage was changed but the problem persists or a new problem of the same kind appeared
- "removed": the content was cut entirely (note whether the cut resolves the problem in "evidence")

FLAGGED PASSAGES:
${list}

REWRITE:
${output.trim()}

Respond with ONLY a JSON array, one object per id: [{"id":"...","verdict":"fixed|unchanged|worse|removed","evidence":"one short sentence"}]`;
}

export function factJudgePrompt(draft: string, output: string): string {
  return `Compare an ORIGINAL text with a REWRITE. List factual claims that the rewrite dropped, altered or invented. Style, tone and wording changes are NOT problems. Be strict about numbers, dates, names, quantities, causal claims and commitments.

ORIGINAL:
${draft.trim()}

REWRITE:
${output.trim()}

Respond with ONLY JSON: {"dropped":["..."],"altered":["..."],"invented":["..."]}. Use empty arrays when there are none.`;
}

function firstJson(text: string, open: "[" | "{"): unknown {
  const close = open === "[" ? "]" : "}";
  const a = text.indexOf(open);
  const b = text.lastIndexOf(close);
  if (a < 0 || b <= a) throw new Error("no JSON found in judge output");
  return JSON.parse(text.slice(a, b + 1));
}

export type SpanVerdict = "fixed" | "unchanged" | "worse" | "removed";

export function parseSpanVerdicts(text: string, expectedIds: string[]): Record<string, SpanVerdict> {
  const arr = firstJson(text, "[") as Array<{ id?: string; verdict?: string }>;
  const ok = new Set<string>(["fixed", "unchanged", "worse", "removed"]);
  const out: Record<string, SpanVerdict> = {};
  for (const row of arr) {
    if (row?.id && expectedIds.includes(row.id) && row.verdict && ok.has(row.verdict)) {
      out[row.id] = row.verdict as SpanVerdict;
    }
  }
  const missing = expectedIds.filter((id) => !(id in out));
  if (missing.length) throw new Error(`judge omitted or mis-labelled spans: ${missing.join(", ")}`);
  return out;
}

export interface FactJudgement {
  dropped: string[];
  altered: string[];
  invented: string[];
}

export function parseFactJudgement(text: string): FactJudgement {
  const o = firstJson(text, "{") as Partial<FactJudgement>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return { dropped: arr(o.dropped), altered: arr(o.altered), invented: arr(o.invented) };
}
