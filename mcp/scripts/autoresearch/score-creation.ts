/**
 * Scorer for Category 2: Creation.
 * Evaluates rule quality via LLM-as-judge against a 4-dimension rubric.
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { cleanEnv } from "../shared.ts";
import type { CreationResult, CreationScenario } from "./category-types.ts";

const SKILL_PATH = join(homedir(), ".claude/skills/writing-voice/SKILL.md");
const SCENARIOS_PATH = join(import.meta.dirname ?? ".", "test-data/creation-scenarios.json");

function loadScenarios(): CreationScenario[] {
  return JSON.parse(readFileSync(SCENARIOS_PATH, "utf-8"));
}

function extractStep4(skillMd: string): string {
  const match = skillMd.match(/### 4\. Capture feedback\n([\s\S]*?)(?=### What this skill|$)/);
  return match ? match[1].trim() : "";
}

function generateRuleCommand(
  scenario: CreationScenario,
  step4Text: string
): string {
  const prompt = `You are Claude following the /writing-voice skill. The user gave you feedback on a draft. Follow these instructions for capturing the feedback as a rule:

<instructions>
${step4Text}
</instructions>

The writing type is: ${scenario.writing_type}
You wrote: "${scenario.original_text}"
The user said: "${scenario.user_feedback}"

Generate ONLY the \`margin rules create\` command you would run. Output the complete command on a single line, nothing else.`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: prompt,
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 512 * 1024,
      env: cleanEnv(),
    }).trim();

    // Extract the margin rules create command if wrapped in backticks or extra text
    const cmdMatch = result.match(/margin rules create[^\n]*/);
    return cmdMatch ? cmdMatch[0] : result;
  } catch {
    return "";
  }
}

interface DimensionScores {
  intent: number;
  severity: number;
  examples: number;
  specificity: number;
  reason: string;
}

function judgeRule(
  scenario: CreationScenario,
  ruleCommand: string
): DimensionScores {
  const prompt = `You are a strict judge evaluating whether an AI-generated writing rule correctly captures user feedback.

Scenario:
- Original text: "${scenario.original_text}"
- User feedback: "${scenario.user_feedback}"
- Expected intent: "${scenario.expected_intent}"
- Expected severity: ${scenario.expected_severity}
- Expected category: ${scenario.expected_category}

The AI generated this command:
${ruleCommand}

Score each dimension 0-5:

1. **Intent match**: Does the --text flag capture what the user meant? (0=completely wrong, 5=perfect capture)
2. **Severity appropriateness**: Is --severity correct? Expected: ${scenario.expected_severity} (0=opposite, 3=close, 5=exact match)
3. **Example quality**: Do --before and --after demonstrate the violation clearly? (0=missing/wrong, 5=perfect demonstration)
4. **Specificity**: Is the rule actionable and precise, not vague? (0="write better", 5="never use X, use Y instead")

Respond with EXACTLY this format (4 numbers and a reason):
INTENT: <0-5>
SEVERITY: <0-5>
EXAMPLES: <0-5>
SPECIFICITY: <0-5>
REASON: <one sentence explaining the biggest gap>`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: prompt,
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 512 * 1024,
      env: cleanEnv(),
    }).trim();

    const parseScore = (label: string): number => {
      const match = result.match(new RegExp(`${label}:\\s*(\\d)`));
      return match ? parseInt(match[1], 10) : 0;
    };

    const reasonMatch = result.match(/REASON:\s*(.+)/);

    return {
      intent: parseScore("INTENT"),
      severity: parseScore("SEVERITY"),
      examples: parseScore("EXAMPLES"),
      specificity: parseScore("SPECIFICITY"),
      reason: reasonMatch ? reasonMatch[1].trim() : "parse error",
    };
  } catch {
    return { intent: 0, severity: 0, examples: 0, specificity: 0, reason: "judge call failed" };
  }
}

export function scoreCreation(): CreationResult {
  const startTime = Date.now();
  const scenarios = loadScenarios();
  const skillMd = readFileSync(SKILL_PATH, "utf-8");
  const step4Text = extractStep4(skillMd);

  const scores: { scenario: string; dims: DimensionScores; mean: number }[] = [];

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    console.error(`  [creation] ${i + 1}/${scenarios.length}: "${s.user_feedback.slice(0, 40)}..."`);

    const ruleCommand = generateRuleCommand(s, step4Text);
    if (!ruleCommand) {
      console.error(`    Generation failed, scoring 0`);
      scores.push({
        scenario: s.user_feedback,
        dims: { intent: 0, severity: 0, examples: 0, specificity: 0, reason: "generation failed" },
        mean: 0,
      });
      continue;
    }

    console.error(`    Command: ${ruleCommand.slice(0, 80)}...`);
    const dims = judgeRule(s, ruleCommand);
    const mean = (dims.intent + dims.severity + dims.examples + dims.specificity) / 4;

    scores.push({ scenario: s.user_feedback, dims, mean });
  }

  const validScores = scores.filter((s) => s.mean > 0);
  const totalMean = validScores.length > 0
    ? validScores.reduce((sum, s) => sum + s.mean, 0) / validScores.length
    : 0;

  const dimMeans = {
    intent: validScores.length > 0
      ? validScores.reduce((s, x) => s + x.dims.intent, 0) / validScores.length : 0,
    severity: validScores.length > 0
      ? validScores.reduce((s, x) => s + x.dims.severity, 0) / validScores.length : 0,
    examples: validScores.length > 0
      ? validScores.reduce((s, x) => s + x.dims.examples, 0) / validScores.length : 0,
    specificity: validScores.length > 0
      ? validScores.reduce((s, x) => s + x.dims.specificity, 0) / validScores.length : 0,
  };

  const passCount = scores.filter((s) => s.mean >= 3.5).length;

  const worstCases = scores
    .sort((a, b) => a.mean - b.mean)
    .slice(0, 5)
    .map((s) => ({ scenario: s.scenario, score: Math.round(s.mean * 10) / 10, reason: s.dims.reason }));

  return {
    category: "creation",
    mean_score: Math.round(totalMean * 100) / 100,
    dimension_means: {
      intent: Math.round(dimMeans.intent * 10) / 10,
      severity: Math.round(dimMeans.severity * 10) / 10,
      examples: Math.round(dimMeans.examples * 10) / 10,
      specificity: Math.round(dimMeans.specificity * 10) / 10,
    },
    pass_rate: Math.round((passCount / scenarios.length) * 1000) / 1000,
    total: scenarios.length,
    worst_cases: worstCases,
    duration_seconds: Math.round((Date.now() - startTime) / 1000),
  };
}
