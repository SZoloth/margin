import type { MarginRule } from "./types.ts";

export interface ValeProject {
  files: Record<string, string>;
  checkToRuleId: Record<string, string>;
  executableRuleIds: string[];
}

const severityMap: Record<string, string> = {
  "must-fix": "error",
  "should-fix": "warning",
  "nice-to-fix": "suggestion",
};

export function isExecutableRule(rule: MarginRule): boolean {
  if (!rule.detectionPattern?.trim()) return false;
  return !(rule.source === "synthesis-candidate" && rule.reviewedAt == null);
}

function pascalCase(value: string): string {
  const parts = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = parts
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
  return joined || "Rule";
}

function styleName(writingType: string): string {
  return `Margin${pascalCase(writingType)}`;
}

function level(severity: string): string {
  return severityMap[severity] ?? "warning";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function detectionScope(rule: MarginRule): "raw" | "text" {
  const pattern = rule.detectionPattern ?? "";
  return pattern.includes(String.raw`\*\*`) ? "raw" : "text";
}

function renderRule(rule: MarginRule): string {
  return [
    "extends: existence",
    `message: ${yamlString(rule.ruleText)}`,
    `level: ${level(rule.severity)}`,
    `scope: ${detectionScope(rule)}`,
    "nonword: true",
    "raw:",
    `  - ${yamlString(rule.detectionPattern ?? "")}`,
    "",
  ].join("\n");
}

function enabledStyles(rules: readonly MarginRule[], writingType: string): string[] {
  const available = new Set(
    rules.filter((rule) => isExecutableRule(rule)).map((rule) => rule.writingType),
  );
  const styles: string[] = [];
  if (available.has("general")) styles.push(styleName("general"));
  if (writingType !== "general" && available.has(writingType)) styles.push(styleName(writingType));
  return styles;
}

export function compileValeProject(
  rules: readonly MarginRule[],
  writingType = "general",
): ValeProject {
  const files: Record<string, string> = {
    ".vale.ini": [
      "StylesPath = styles",
      "MinAlertLevel = suggestion",
      "",
      "[*.md]",
      `BasedOnStyles = ${enabledStyles(rules, writingType).join(", ")}`,
      "",
    ].join("\n"),
  };
  const checkToRuleId: Record<string, string> = {};
  const executableRuleIds: string[] = [];

  for (const rule of rules) {
    if (!isExecutableRule(rule)) continue;
    const style = styleName(rule.writingType);
    const name = pascalCase(rule.id);
    const check = `${style}.${name}`;
    files[`styles/${style}/${name}.yml`] = renderRule(rule);
    checkToRuleId[check] = rule.id;
    executableRuleIds.push(rule.id);
  }

  executableRuleIds.sort();
  return { files, checkToRuleId, executableRuleIds };
}
