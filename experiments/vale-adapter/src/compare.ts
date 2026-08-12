import { isExecutableRule } from "./compiler.ts";
import type { Detection, MarginRule, Score } from "./types.ts";

function compilePythonStyleRegex(pattern: string): RegExp {
  let source = pattern;
  const flags = new Set<string>(["g"]);
  let matchedPrefix = true;
  while (matchedPrefix) {
    matchedPrefix = false;
    if (source.startsWith("(?i)")) {
      flags.add("i");
      source = source.slice(4);
      matchedPrefix = true;
    }
    if (source.startsWith("(?m)")) {
      flags.add("m");
      source = source.slice(4);
      matchedPrefix = true;
    }
  }
  return new RegExp(source, [...flags].join(""));
}

export function scanWithRawRegex(
  rules: readonly MarginRule[],
  text: string,
  writingType: string,
): Detection[] {
  const detections: Detection[] = [];
  for (const rule of rules) {
    if (!isExecutableRule(rule)) continue;
    if (rule.writingType !== "general" && rule.writingType !== writingType) continue;
    const pattern = rule.detectionPattern;
    if (!pattern) continue;
    const match = compilePythonStyleRegex(pattern).exec(text);
    if (!match || match.index == null) continue;
    detections.push({
      ruleId: rule.id,
      start: match.index,
      end: match.index + match[0].length,
      match: match[0],
    });
  }
  return detections.sort((a, b) => a.start - b.start || a.ruleId.localeCompare(b.ruleId));
}

interface ExpectedCase {
  name: string;
  expectedRuleIds: string[];
}

export function scoreCases(
  cases: readonly ExpectedCase[],
  actualByCase: ReadonlyMap<string, readonly string[]>,
): Score {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;

  for (const testCase of cases) {
    const expected = new Set(testCase.expectedRuleIds);
    const actual = new Set(actualByCase.get(testCase.name) ?? []);
    for (const ruleId of actual) {
      if (expected.has(ruleId)) truePositives += 1;
      else falsePositives += 1;
    }
    for (const ruleId of expected) {
      if (!actual.has(ruleId)) falseNegatives += 1;
    }
  }

  return { truePositives, falsePositives, falseNegatives };
}
