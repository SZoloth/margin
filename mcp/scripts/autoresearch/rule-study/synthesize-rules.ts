#!/usr/bin/env npx tsx

/**
 * Rule Study: LLM-assisted correction → rule generalization.
 *
 * Usage:
 *   npx tsx synthesize-rules.ts --round baseline [--dry-run]
 *
 * Reads the corrections extracted from a round, clusters them by type and
 * category, then uses Claude to generalize each cluster into durable writing
 * rules. Outputs candidate rules for Sam's binary approve/reject review.
 *
 * With --dry-run: outputs candidates but doesn't insert into DB.
 * Without --dry-run: inserts approved candidates (after Sam reviews the output).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { parseArgs } from "util";
import { createRequire } from "module";
import { cleanEnv } from "../../shared.ts";

const require = createRequire(import.meta.url);

interface CorrectionInput {
  type: string;
  originalText: string;
  notes: string;
  polarity: string;
}

interface CandidateRule {
  writing_type: string;
  category: string;
  rule_text: string;
  severity: "must-fix" | "should-fix" | "nice-to-fix";
  example_before: string | null;
  example_after: string | null;
  when_to_apply: string | null;
  why: string | null;
  register: "casual" | "professional" | null;
  source_corrections: string[];
}

interface SynthesisResult {
  round: string;
  synthesizedAt: string;
  candidates: CandidateRule[];
  clusterCount: number;
  correctionCount: number;
}

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const RESULTS_DIR = join(SCRIPT_DIR, "results");

function clusterCorrections(
  corrections: CorrectionInput[]
): Map<string, CorrectionInput[]> {
  // Group by type first, then we'll let Claude cluster by theme within each type
  const byType = new Map<string, CorrectionInput[]>();
  for (const c of corrections) {
    const key = c.type;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(c);
  }
  return byType;
}

function synthesizeCluster(
  type: string,
  corrections: CorrectionInput[]
): CandidateRule[] {
  if (corrections.length === 0) return [];

  const correctionList = corrections
    .map(
      (c, i) =>
        `${i + 1}. Flagged: "${c.originalText}"\n   Correction: ${c.notes}\n   Polarity: ${c.polarity}`
    )
    .join("\n\n");

  const prompt = `You are an editorial rule synthesizer. Given these specific corrections that a writer made while reviewing AI-generated text, generalize them into durable writing rules.

Each correction is a specific instance. Your job is to find the PATTERN and express it as a general rule that would prevent ALL similar issues in the future — not just the specific case shown.

Writing type: ${type}

CORRECTIONS:
${correctionList}

For each distinct pattern you identify (there may be 1-5 patterns in this set), output a JSON object with these fields:
- rule_text: The general rule (imperative voice, specific enough to enforce, e.g. "Avoid hyperbolic openers that overpromise impact")
- category: One of: "voice-calibration", "structure", "word-choice", "tone", "grammar", "punctuation", "content", "flow"
- severity: "must-fix" for things that fundamentally break voice, "should-fix" for strong preferences, "nice-to-fix" for polish
- example_before: A representative bad pattern (from the corrections, shortened)
- example_after: What it should say instead (if derivable from the correction notes)
- when_to_apply: Brief context for when this rule matters (null if always)
- why: One sentence explaining WHY this matters for voice/quality

Output ONLY a JSON array of rule objects. No commentary.`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: prompt,
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv(),
    });

    // Parse JSON from response (handle potential markdown code blocks)
    let jsonStr = result.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as Array<{
      rule_text: string;
      category: string;
      severity: string;
      example_before?: string;
      example_after?: string;
      when_to_apply?: string;
      why?: string;
    }>;

    return parsed.map((r) => ({
      writing_type: type,
      category: r.category || "voice-calibration",
      rule_text: r.rule_text,
      severity: (["must-fix", "should-fix", "nice-to-fix"].includes(r.severity)
        ? r.severity
        : "should-fix") as CandidateRule["severity"],
      example_before: r.example_before ?? null,
      example_after: r.example_after ?? null,
      when_to_apply: r.when_to_apply ?? null,
      why: r.why ?? null,
      register: null, // Filled in by type mapping below
      source_corrections: corrections.map((c) => c.originalText),
    }));
  } catch (err) {
    console.error(
      `  Synthesis failed for ${type}: ${(err as Error).message}`
    );
    return [];
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      round: { type: "string", default: "baseline" },
      "dry-run": { type: "boolean", default: false },
      apply: { type: "string" },
    },
  });

  const round = values.round!;
  const dryRun = values["dry-run"]!;
  const applyPath = values.apply;

  const correctionsPath = join(RESULTS_DIR, `${round}-corrections.json`);

  if (!existsSync(correctionsPath)) {
    console.error(
      `No corrections found for round "${round}" at ${correctionsPath}`
    );
    console.error("Run extract-round.ts first.");
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(correctionsPath, "utf-8"));

  // Collect all corrections with their type
  const allCorrections: CorrectionInput[] = [];
  for (const sample of data.samples) {
    for (const c of sample.corrections) {
      allCorrections.push({
        type: sample.type,
        originalText: c.originalText,
        notes: c.notes,
        polarity: c.polarity,
      });
    }
    // Also include highlights with notes as implicit corrections
    for (const h of sample.highlights) {
      if (h.note) {
        allCorrections.push({
          type: sample.type,
          originalText: h.text,
          notes: h.note,
          polarity: "corrective",
        });
      }
    }
  }

  if (allCorrections.length === 0) {
    console.error("No corrections found in this round. Nothing to synthesize.");
    process.exit(0);
  }

  console.error(`\n=== Rule Synthesis: Round "${round}" ===`);
  console.error(`Total corrections: ${allCorrections.length}`);

  // Cluster by type
  const clusters = clusterCorrections(allCorrections);
  console.error(`Clusters (by type): ${clusters.size}\n`);

  // Synthesize each cluster
  const allCandidates: CandidateRule[] = [];

  for (const [type, corrections] of clusters) {
    console.error(`Synthesizing ${type} (${corrections.length} corrections)...`);
    const candidates = synthesizeCluster(type, corrections);
    console.error(`  → ${candidates.length} candidate rules`);
    allCandidates.push(...candidates);
  }

  const result: SynthesisResult = {
    round,
    synthesizedAt: new Date().toISOString(),
    candidates: allCandidates,
    clusterCount: clusters.size,
    correctionCount: allCorrections.length,
  };

  // Save candidates
  const outPath = join(RESULTS_DIR, `${round}-candidates.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");

  // Also output a human-readable review format
  const reviewLines: string[] = [
    `# Rule Candidates — Round "${round}"`,
    ``,
    `Generated: ${result.synthesizedAt}`,
    `From: ${allCorrections.length} corrections across ${clusters.size} types`,
    ``,
    `## Review Instructions`,
    `Mark each rule: ✅ (approve) or ❌ (reject)`,
    `Then run: npx tsx synthesize-rules.ts --round ${round} --apply <path-to-reviewed-file>`,
    ``,
  ];

  for (const c of allCandidates) {
    reviewLines.push(`### [${c.writing_type}] ${c.rule_text}`);
    reviewLines.push(`- **Category:** ${c.category}`);
    reviewLines.push(`- **Severity:** ${c.severity}`);
    if (c.example_before) reviewLines.push(`- **Before:** "${c.example_before}"`);
    if (c.example_after) reviewLines.push(`- **After:** "${c.example_after}"`);
    if (c.when_to_apply) reviewLines.push(`- **When:** ${c.when_to_apply}`);
    if (c.why) reviewLines.push(`- **Why:** ${c.why}`);
    reviewLines.push(`- **Status:** ⬜ (pending)`);
    reviewLines.push(``);
  }

  const reviewPath = join(RESULTS_DIR, `${round}-review.md`);
  writeFileSync(reviewPath, reviewLines.join("\n"), "utf-8");

  console.error(`\n=== Summary ===`);
  console.error(`Candidates: ${allCandidates.length}`);
  console.error(`\nReview file: ${reviewPath}`);
  console.error(`Candidates JSON: ${outPath}`);

  if (dryRun) {
    console.error(`\n[DRY RUN] No rules inserted. Review candidates and re-run without --dry-run.`);
  } else if (!applyPath) {
    console.error(`\nNext: Review ${reviewPath}, then run with --apply to insert approved rules.`);
  }

  // If --apply is provided, read the reviewed file and insert approved candidates
  if (applyPath) {
    applyApprovedRules(applyPath, allCandidates);
  }

  console.log(JSON.stringify(result, null, 2));
}

function applyApprovedRules(reviewPath: string, candidates: CandidateRule[]) {
  if (!existsSync(reviewPath)) {
    console.error(`Review file not found: ${reviewPath}`);
    process.exit(1);
  }

  const reviewContent = readFileSync(reviewPath, "utf-8");

  // Find approved rules by matching ✅ status markers
  const approvedRules: CandidateRule[] = [];
  const sections = reviewContent.split("### ");

  for (const section of sections) {
    if (!section.includes("✅")) continue;

    // Match the rule text from the section header
    const headerMatch = section.match(/^\[([^\]]+)\]\s+(.+)/);
    if (!headerMatch) continue;

    const type = headerMatch[1];
    const ruleText = headerMatch[2].trim();

    const candidate = candidates.find(
      (c) => c.writing_type === type && c.rule_text === ruleText
    );
    if (candidate) approvedRules.push(candidate);
  }

  if (approvedRules.length === 0) {
    console.error("No approved rules found (mark with ✅). Nothing to insert.");
    return;
  }

  console.error(`\nInserting ${approvedRules.length} approved rules...`);

  const dbPath = join(homedir(), ".margin/margin.db");
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);

  const insert = db.prepare(`
    INSERT INTO writing_rules (id, writing_type, category, rule_text, severity,
      example_before, example_after, when_to_apply, why, source, signal_count,
      register, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'rule-study', 1, ?, ?, ?)
    ON CONFLICT(writing_type, category, rule_text) DO UPDATE SET
      signal_count = writing_rules.signal_count + 1,
      updated_at = excluded.updated_at
  `);

  const now = Date.now();
  let inserted = 0;

  for (const rule of approvedRules) {
    const id = crypto.randomUUID();
    try {
      insert.run(
        id,
        rule.writing_type,
        rule.category,
        rule.rule_text,
        rule.severity,
        rule.example_before,
        rule.example_after,
        rule.when_to_apply,
        rule.why,
        rule.register,
        now,
        now
      );
      inserted++;
      console.error(`  ✅ [${rule.writing_type}] ${rule.rule_text}`);
    } catch (err) {
      console.error(
        `  ❌ Failed: [${rule.writing_type}] ${rule.rule_text}: ${(err as Error).message}`
      );
    }
  }

  db.close();
  console.error(`\nInserted: ${inserted}/${approvedRules.length}`);
}

main();
