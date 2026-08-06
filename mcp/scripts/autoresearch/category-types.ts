/**
 * Shared types for the four-category autoresearch pipeline.
 *
 * Categories:
 *   recognition — can Claude detect when the user is giving a correction?
 *   creation    — given a correction, does the rule capture intent?
 *   enforcement — does the writing follow the rules? (existing)
 *   pipeline    — end-to-end: correction → rule → enforcement → no recurrence
 */

import type { EvalResult } from "./score.ts";

// ── Category 1: Recognition ─────────────────────────────────────────

export interface RecognitionResult {
  category: "recognition";
  f1: number;
  precision: number;
  recall: number;
  total: number;
  confusion: { tp: number; fp: number; tn: number; fn: number };
  worst_misses: {
    message: string;
    expected: boolean;
    predicted: boolean;
    confidence: number;
  }[];
  duration_seconds: number;
}

export interface RecognitionCase {
  message: string;
  is_correction: boolean;
  difficulty: "clear" | "ambiguous" | "edge";
  context?: string;
}

// ── Category 2: Creation ─────────────────────────────────────────────

export interface CreationResult {
  category: "creation";
  mean_score: number;
  dimension_means: {
    intent: number;
    severity: number;
    examples: number;
    specificity: number;
  };
  pass_rate: number;
  total: number;
  worst_cases: { scenario: string; score: number; reason: string }[];
  duration_seconds: number;
}

export interface CreationScenario {
  original_text: string;
  user_feedback: string;
  writing_type: string;
  expected_intent: string;
  expected_severity: "must-fix" | "should-fix";
  expected_category: string;
}

// ── Category 3: Enforcement (existing) ───────────────────────────────

export interface EnforcementResult extends EvalResult {
  category: "enforcement";
}

// ── Category 4: Pipeline ─────────────────────────────────────────────

export interface PipelineResult {
  category: "pipeline";
  non_recurrence_rate: number;
  total_scenarios: number;
  recurrences: {
    violation: string;
    original_text: string;
    regenerated_text: string;
  }[];
  mean_generation_quality: number;
  duration_seconds: number;
}

export interface PipelineScenario {
  writing_prompt: string;
  writing_type: string;
  register: string;
  correction: { feedback: string; pattern: string };
  expected_rule: string;
}

// ── Union type ───────────────────────────────────────────────────────

export type CategoryEvalResult =
  | RecognitionResult
  | CreationResult
  | EnforcementResult
  | PipelineResult;

// ── Category interface ───────────────────────────────────────────────

export interface Category {
  name: string;
  targetSection: string;
  runEval(): Promise<CategoryEvalResult>;
  isBetter(current: CategoryEvalResult, best: CategoryEvalResult): boolean;
  proposeChange(
    skillMd: string,
    evalResult: CategoryEvalResult
  ): Promise<string | null>;
  validateSkillMd(content: string): boolean;
  formatSummary(result: CategoryEvalResult): string;
}
