// Types for the vendored Tells scanner in tells.js.

export type TellTier = "flag" | "hint" | "off";

export interface TellRule {
  id: string;
  category: string;
  pattern: string;
  flags?: string;
  note: string;
  fix: string | null;
  source?: string;
  tier?: TellTier;
}

export interface TellsRulesDoc {
  name?: string;
  version: string;
  rules: TellRule[];
}

export interface TellsEngine {
  compiled: { rule: TellRule; regex: RegExp }[];
  skipped: { id: string; error: string }[];
  version: string;
}

export interface TellMatch {
  start: number;
  end: number;
  text: string;
  id: string;
  category: string;
  note: string;
  fix: string | null;
  tier: TellTier;
}

export interface TellsScanResult {
  matches: TellMatch[];
  words: number;
  perHundredWords: number;
}

export function compile(doc: TellsRulesDoc): TellsEngine;
export function maskQuoted(text: string): string;
export function countWords(text: string): number;
export function scan(
  engine: TellsEngine,
  text: string,
  options?: { tiers?: TellTier[]; limit?: number; overlap?: boolean },
): TellsScanResult;
