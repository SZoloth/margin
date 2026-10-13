/**
 * V3: blind pairwise preference. Sam picks which of two rewrites sounds more
 * like him without seeing which arm wrote which.
 */
import { mulberry32, binomLowerBound95, binomTwoSidedP } from "./stats.ts";

export interface BlindItem {
  draftId: string;
  draft: string;
  outputs: Record<string, string>;
}

export type BlindKey = Record<string, { A: string; B: string }>;

export function makeBlindSheet(
  items: BlindItem[],
  armX: string,
  armY: string,
  seed = 7,
): { sheet: string; key: BlindKey } {
  const rnd = mulberry32(seed);
  const key: BlindKey = {};
  const parts: string[] = [
    "# Blind comparison: which sounds more like you?",
    "",
    "For each draft, read A and B and replace the Pick line with `Pick: A`, `Pick: B` or `Pick: tie`.",
    "Do not look at the key file until you are done.",
    "",
  ];
  let usable = 0;
  for (const it of items) {
    const x = it.outputs[armX];
    const y = it.outputs[armY];
    if (!x || !y) continue;
    usable++;
    const swap = rnd() < 0.5;
    key[it.draftId] = swap ? { A: armY, B: armX } : { A: armX, B: armY };
    const a = swap ? y : x;
    const b = swap ? x : y;
    parts.push(`## Draft ${it.draftId}`, "", "### Original draft", "", it.draft.trim(), "", "### A", "", a.trim(), "", "### B", "", b.trim(), "", "Pick: ?", "");
  }
  if (usable === 0) throw new Error(`no draft has outputs for both ${armX} and ${armY}`);
  return { sheet: parts.join("\n"), key };
}

export interface BlindScore {
  wins: Record<string, number>;
  ties: number;
  decided: number;
  /** share of decided picks won by the first arm */
  firstArmShare: number;
  lowerBound95: number;
  pTwoSided: number;
  unanswered: string[];
}

export function scoreBlindSheet(sheet: string, key: BlindKey, firstArm: string): BlindScore {
  const wins: Record<string, number> = {};
  let ties = 0;
  const unanswered: string[] = [];
  const sections = sheet.split(/^## Draft /m).slice(1);
  const seen = new Set<string>();
  for (const sec of sections) {
    const id = sec.split("\n", 1)[0].trim();
    seen.add(id);
    const m = sec.match(/^Pick:\s*(A|B|tie)\s*$/im);
    const k = key[id];
    if (!k || !m) {
      unanswered.push(id);
      continue;
    }
    const pick = m[1].toLowerCase();
    if (pick === "tie") ties++;
    else {
      const arm = pick === "a" ? k.A : k.B;
      wins[arm] = (wins[arm] ?? 0) + 1;
    }
  }
  for (const id of Object.keys(key)) if (!seen.has(id)) unanswered.push(id);
  const decided = Object.values(wins).reduce((a, b) => a + b, 0);
  const first = wins[firstArm] ?? 0;
  return {
    wins,
    ties,
    decided,
    firstArmShare: decided ? first / decided : NaN,
    lowerBound95: binomLowerBound95(first, decided),
    pTwoSided: binomTwoSidedP(first, decided),
    unanswered,
  };
}
