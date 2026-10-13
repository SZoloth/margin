/**
 * Decision rules from docs/humanizer-baseline-eval.md, as code, so the call
 * cannot drift after the results are in. Thresholds are fixed here BEFORE any
 * model output is seen.
 */
import type { Interval } from "./stats.ts";
import type { BlindScore } from "./blind.ts";

export const THRESHOLDS = {
  minDrafts: 30,
  minDocs: 10,
  v1MarginPp: 0.1,
  v3Share: 0.6,
  maxArmHardFail: 0.1,
} as const;

export interface VerdictInput {
  nDrafts: number;
  /** distinct source documents; units from one document are not independent */
  nDocs: number;
  /** A3 minus A2, per-draft V1 recovery rate */
  v1: Interval | null;
  /** blind picks with A3 as the first arm */
  v3: BlindScore | null;
  /** A2 hard-fail rate minus A3 hard-fail rate, per draft (positive means A3 safer) */
  factsAdvantage: Interval | null;
  /** A3 minus A1, per-draft V1 recovery rate */
  rulesVsGeneric: Interval | null;
  /** A3 hard-fail rate overall */
  a3HardFail: number;
}

export type Outcome = "win" | "partial-voice-only" | "partial-facts-only" | "loss" | "inconclusive" | "dead-g2";

export interface Verdict {
  outcome: Outcome;
  /** true when n is below the bar: the outcome is direction only, not a call */
  pilot: boolean;
  reasons: string[];
}

export function decide(i: VerdictInput): Verdict {
  const reasons: string[] = [];
  const pilot = i.nDrafts < THRESHOLDS.minDrafts || i.nDocs < THRESHOLDS.minDocs;
  if (pilot) reasons.push(`pilot: ${i.nDrafts} units from ${i.nDocs} documents (bars: ${THRESHOLDS.minDrafts} units, ${THRESHOLDS.minDocs} documents), direction only`);

  // G2: if the rules add nothing over a generic editor, the claim is dead whatever A2 does
  if (i.rulesVsGeneric && !(i.rulesVsGeneric.lo > 0)) {
    reasons.push("G2: A3 does not beat the generic editor (A1) on V1, so the rules add nothing demonstrable");
    return { outcome: "dead-g2", pilot, reasons };
  }
  if (i.a3HardFail > THRESHOLDS.maxArmHardFail) {
    reasons.push(`G1: A3 hard-fail rate ${(i.a3HardFail * 100).toFixed(0)}% exceeds ${THRESHOLDS.maxArmHardFail * 100}%`);
  }

  const v3Loss = i.v3 && i.v3.decided > 0 && i.v3.firstArmShare <= 0.5;
  const v1Loss = i.v1 && !(i.v1.mean > 0);
  if (v3Loss || v1Loss) {
    if (v3Loss) reasons.push("Sam prefers A2 in half or more of decided picks");
    if (v1Loss) reasons.push("A2 recovers at least as many flagged spans as A3");
    return { outcome: "loss", pilot, reasons };
  }

  const voiceV1 = !!i.v1 && i.v1.mean >= THRESHOLDS.v1MarginPp && i.v1.lo > 0;
  const voiceV3 = !!i.v3 && i.v3.firstArmShare >= THRESHOLDS.v3Share && i.v3.lowerBound95 > 0.5;
  const voice = voiceV1 && voiceV3;
  const facts = !!i.factsAdvantage && i.factsAdvantage.lo > 0;
  if (!i.v3) reasons.push("no blind picks yet: voice cannot be called");
  if (voice) reasons.push("voice: V1 margin and V3 preference both met");
  if (facts) reasons.push("facts: A3 hard-fail rate strictly lower than A2, interval excludes 0");
  else reasons.push("facts: A3 not strictly safer than A2 (non-inferior is Partial, not Win)");

  if (voice && facts) return { outcome: "win", pilot, reasons };
  if (voice) return { outcome: "partial-voice-only", pilot, reasons };
  if (facts) return { outcome: "partial-facts-only", pilot, reasons };
  reasons.push("intervals span the deciding thresholds");
  return { outcome: "inconclusive", pilot, reasons };
}
