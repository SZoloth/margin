/**
 * Scorer for Category 1: Recognition.
 * Measures precision/recall of correction detection from SKILL.md step 4 instructions.
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { cleanEnv } from "../shared.ts";
import type { RecognitionResult, RecognitionCase } from "./category-types.ts";

const SKILL_PATH = join(homedir(), ".claude/skills/writing-voice/SKILL.md");
const CASES_PATH = join(import.meta.dirname ?? ".", "test-data/recognition-cases.json");

function loadCases(): RecognitionCase[] {
  return JSON.parse(readFileSync(CASES_PATH, "utf-8"));
}

function extractStep4(skillMd: string): string {
  const match = skillMd.match(/### 4\. Capture feedback\n([\s\S]*?)(?=### What this skill|$)/);
  return match ? match[1].trim() : "";
}

interface Prediction {
  message: string;
  expected: boolean;
  predicted: boolean;
  confidence: number;
}

function classify(message: string, step4Text: string, context?: string): { predicted: boolean; confidence: number } {
  const prompt = `You are evaluating whether a user message is a writing correction (feedback about writing quality that should become a rule) or something else (approval, revision request, general conversation).

Here are the instructions you follow for detecting corrections:
<instructions>
${step4Text}
</instructions>

The user said this after receiving a draft:
"${message}"
${context ? `\nContext: The draft contained: "${context}"` : ""}

Classify this message. Respond with EXACTLY one line in this format:
CORRECTION <confidence 0-100>
or
NOT_CORRECTION <confidence 0-100>

A correction is feedback about writing quality/voice/style that should be captured as a reusable rule. A revision request ("make it longer", "add a section") is NOT a correction. Approval ("looks good") is NOT a correction.`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: prompt,
      encoding: "utf-8",
      timeout: 30_000,
      maxBuffer: 512 * 1024,
      env: cleanEnv(),
    }).trim();

    const correctionMatch = result.match(/^CORRECTION\s+(\d+)/m);
    const notMatch = result.match(/^NOT_CORRECTION\s+(\d+)/m);

    if (correctionMatch) {
      return { predicted: true, confidence: parseInt(correctionMatch[1], 10) };
    }
    if (notMatch) {
      return { predicted: false, confidence: parseInt(notMatch[1], 10) };
    }

    // Fallback: look for keywords
    const lower = result.toLowerCase();
    if (lower.includes("correction")) return { predicted: true, confidence: 50 };
    return { predicted: false, confidence: 50 };
  } catch {
    return { predicted: false, confidence: 0 };
  }
}

export function scoreRecognition(): RecognitionResult {
  const startTime = Date.now();
  const cases = loadCases();
  const skillMd = readFileSync(SKILL_PATH, "utf-8");
  const step4Text = extractStep4(skillMd);

  const predictions: Prediction[] = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    console.error(`  [recognition] ${i + 1}/${cases.length}: "${c.message.slice(0, 40)}..."`);

    const { predicted, confidence } = classify(c.message, step4Text, c.context);
    predictions.push({
      message: c.message,
      expected: c.is_correction,
      predicted,
      confidence,
    });
  }

  // Compute confusion matrix
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const p of predictions) {
    if (p.expected && p.predicted) tp++;
    else if (!p.expected && p.predicted) fp++;
    else if (!p.expected && !p.predicted) tn++;
    else fn++;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // Worst misses: all incorrect predictions sorted by confidence (high-confidence errors are worst)
  const misses = predictions
    .filter((p) => p.expected !== p.predicted)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);

  return {
    category: "recognition",
    f1: Math.round(f1 * 1000) / 1000,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    total: cases.length,
    confusion: { tp, fp, tn, fn },
    worst_misses: misses,
    duration_seconds: Math.round((Date.now() - startTime) / 1000),
  };
}
