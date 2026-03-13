/**
 * Architecture F: Aegis-structured governance schema.
 *
 * Same underlying data as Architecture E (corrections + high-signal rules),
 * but represented as a structured, machine-readable governance specification
 * instead of prose instructions. Inspired by github.com/cleburn/aegis-spec.
 *
 * Hypothesis: Claude complies better with deterministic, schema-structured
 * rule definitions than with prose/markdown rule descriptions.
 *
 * Key differences from E:
 * - Rules organized into typed JSON-like governance tiers (conservative/advisory/delegated)
 * - Corrections formatted as structured violation records, not narrative
 * - Per-writing-type scoping via governance domains
 * - Explicit pattern definitions with match/severity/replacement fields
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createRequire } from "module";
import {
  REGISTER_MAP,
  stripMetaCommentary,
  cleanEnv,
} from "../../shared.ts";

const require = createRequire(import.meta.url);

interface CorrectionRow {
  original_text: string;
  notes_json: string;
  prefix_context: string | null;
  suffix_context: string | null;
}

interface RuleRow {
  rule_text: string;
  severity: string;
  example_before: string | null;
  example_after: string | null;
  category: string;
  signal_count: number;
}

function loadCorrections(): CorrectionRow[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT original_text, notes_json, prefix_context, suffix_context
         FROM corrections
         WHERE notes_json IS NOT NULL AND notes_json != '[]'
         ORDER BY created_at DESC LIMIT 30`
      )
      .all() as CorrectionRow[];
    db.close();
    return rows;
  } catch (err) {
    console.error("Failed to load corrections:", (err as Error).message);
    return [];
  }
}

function loadHighSignalRules(): RuleRow[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT rule_text, severity, example_before, example_after, category, signal_count
         FROM writing_rules
         WHERE signal_count >= 2 OR severity = 'must-fix'
         ORDER BY signal_count DESC
         LIMIT 30`
      )
      .all() as RuleRow[];
    db.close();
    return rows;
  } catch {
    return [];
  }
}

// ── Build Aegis-style governance schema ──────────────────────────────

function buildConstitution(type: string, register: string): string {
  return `{
  "voice_identity": {
    "register": "${register}",
    "writing_type": "${type}",
    "principle": "Direct, specific, outcome-oriented. State what IS, not what isn't."
  },
  "absolute_prohibitions": [
    {
      "id": "NEG_PARALLELISM",
      "pattern": "negative parallelism — contrasting what something ISN'T vs what it IS",
      "match_variants": [
        "isn't X — it's Y",
        "isn't X. It's Y",
        "not about X — it's about Y",
        "wasn't X — was Y",
        "not X but Y",
        "less about X and more about Y"
      ],
      "severity": "BLOCK",
      "replacement_strategy": "State what it IS directly. Drop the contrast entirely.",
      "examples": [
        {"bad": "The challenge isn't technical — it's organizational", "good": "The challenge is organizational"},
        {"bad": "This isn't about shipping faster. It's about shipping the right thing.", "good": "Ship the right thing, not just the next thing."}
      ]
    }
  ]
}`;
}

function buildGovernance(rules: RuleRow[]): string {
  const conservative: string[] = [];
  const advisory: string[] = [];
  const delegated: string[] = [];

  for (const r of rules) {
    const entry = formatRuleEntry(r);
    if (r.severity === "must-fix") {
      conservative.push(entry);
    } else if (r.severity === "should-fix") {
      advisory.push(entry);
    } else {
      delegated.push(entry);
    }
  }

  return `{
  "autonomy_tiers": {
    "conservative": {
      "description": "NEVER violate. Zero tolerance. Fail the output if present.",
      "rules": [${conservative.join(",\n        ")}
      ]
    },
    "advisory": {
      "description": "Strong preference. Violate only with clear justification.",
      "rules": [${advisory.join(",\n        ")}
      ]
    },
    "delegated": {
      "description": "Use judgment. Prefer compliance but context may override.",
      "rules": [${delegated.join(",\n        ")}
      ]
    }
  }
}`;
}

function formatRuleEntry(r: RuleRow): string {
  const parts: string[] = [
    `\n        {`,
    `          "rule": ${JSON.stringify(r.rule_text)}`,
    `          "category": ${JSON.stringify(r.category)}`,
    `          "signal_count": ${r.signal_count}`,
  ];
  if (r.example_before) {
    parts.push(`          "violation_example": ${JSON.stringify(r.example_before)}`);
  }
  if (r.example_after) {
    parts.push(`          "compliant_example": ${JSON.stringify(r.example_after)}`);
  }
  parts.push(`        }`);
  return parts.join(",\n");
}

function buildViolationLedger(corrections: CorrectionRow[]): string {
  const entries = corrections.map((c, i) => {
    let notes: string;
    try {
      const parsed = JSON.parse(c.notes_json);
      notes = Array.isArray(parsed)
        ? parsed.map((n: { text?: string }) => n.text ?? String(n)).join("; ")
        : String(parsed);
    } catch {
      notes = c.notes_json;
    }

    return `    {
      "id": ${i + 1},
      "flagged_text": ${JSON.stringify(c.original_text)},
      "context_before": ${JSON.stringify(c.prefix_context ?? "")},
      "context_after": ${JSON.stringify(c.suffix_context ?? "")},
      "violation_reason": ${JSON.stringify(notes)}
    }`;
  });

  return `{
  "description": "Real violations from prior outputs. Each was flagged by the editor. Do not reproduce these patterns.",
  "records": [
${entries.join(",\n")}
  ]
}`;
}

// ── Generator ────────────────────────────────────────────────────────

export function generate(type: string, prompt: string, register: string): string {
  const corrections = loadCorrections();
  const rules = loadHighSignalRules();

  if (corrections.length === 0 && rules.length === 0) {
    console.error("No corrections or rules found — Architecture F cannot run");
    return "";
  }

  const constitution = buildConstitution(type, register);
  const governance = buildGovernance(rules);
  const ledger = buildViolationLedger(corrections);

  const fullPrompt = `You are a writing agent operating under a governance specification. Your output must comply with the spec below. The spec is structured as machine-readable policy — treat each field as a deterministic constraint, not a suggestion.

<agent-policy>

<constitution>
${constitution}
</constitution>

<governance>
${governance}
</governance>

<violation-ledger>
${ledger}
</violation-ledger>

</agent-policy>

COMPLIANCE PROTOCOL:
1. Before generating, internalize all "conservative" tier rules as hard constraints.
2. Check each sentence against "absolute_prohibitions" patterns before including it.
3. Cross-reference output against "violation-ledger" records — if your text resembles any flagged_text, rewrite.
4. "advisory" tier rules: comply unless the writing type demands an exception.
5. "delegated" tier rules: use judgment.

Writing type: ${type}
Register: ${register}

Output ONLY the prose — no commentary, critique, word counts, or meta-discussion.

${prompt}`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: fullPrompt,
      encoding: "utf-8",
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv(),
    });
    return stripMetaCommentary(result.trim());
  } catch (err) {
    console.error("Generation failed:", (err as Error).message);
    return "";
  }
}
