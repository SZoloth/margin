/**
 * Architecture H: DSPy-optimized hybrid.
 *
 * Builds on Architecture E's full data pipeline (corrections + high-signal rules
 * + prohibitions from SQLite) and layers DSPy-optimized instruction text and
 * few-shot demonstrations on top. Falls back to E entirely when no optimization
 * exists for a writing type.
 *
 * The key insight from Phase 0: the Python eval (which injects corrections/rules
 * at call time) scored 70.4%, but the TS generator reading static JSON scored
 * 48.1%. The difference was missing data. This version keeps E's data pipeline
 * and only swaps in optimized instruction/demos from DSPy.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { createRequire } from "module";
import { cleanEnv, stripMetaCommentary } from "../../shared.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// ── DSPy config types (matches the actual saved format) ──────────────

interface DspySavedProgram {
  writer: {
    traces: unknown[];
    train: unknown[];
    demos: Array<Record<string, string>>;
    signature: {
      instructions: string;
      fields: Array<{ prefix: string; description: string }>;
    };
    lm: unknown;
  };
  metadata?: Record<string, unknown>;
}

// ── Data loading (shared with arch-e) ────────────────────────────────

interface CorrectionRow {
  original_text: string;
  notes_json: string;
  prefix_context: string | null;
  suffix_context: string | null;
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
    console.error("[arch-h] Failed to load corrections:", (err as Error).message);
    return [];
  }
}

function loadHighSignalRules(): string {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return "";

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT rule_text, severity, example_before, example_after, category
         FROM writing_rules
         WHERE signal_count >= 2 OR severity = 'must-fix'
         ORDER BY signal_count DESC
         LIMIT 30`
      )
      .all() as {
        rule_text: string;
        severity: string;
        example_before: string | null;
        example_after: string | null;
        category: string;
      }[];
    db.close();

    if (rows.length === 0) return "";

    return rows
      .map((r) => {
        let line = `- [${r.severity}] ${r.rule_text}`;
        if (r.example_before) line += `\n  Bad: "${r.example_before}"`;
        if (r.example_after) line += `\n  Good: "${r.example_after}"`;
        return line;
      })
      .join("\n");
  } catch {
    return "";
  }
}

function formatCorrections(corrections: CorrectionRow[]): string {
  return corrections
    .map((c, i) => {
      let notes: string;
      try {
        const parsed = JSON.parse(c.notes_json);
        notes = Array.isArray(parsed)
          ? parsed.map((n: { text?: string }) => n.text ?? String(n)).join("; ")
          : String(parsed);
      } catch {
        notes = c.notes_json;
      }

      const context = [
        c.prefix_context ? `...${c.prefix_context} ` : "",
        `[${c.original_text}]`,
        c.suffix_context ? ` ${c.suffix_context}...` : "",
      ].join("");

      return `${i + 1}. Flagged: "${c.original_text}"
   Context: ${context}
   Why: ${notes}`;
    })
    .join("\n\n");
}

// ── Prohibitions (same as arch-e) ────────────────────────────────────

const PROHIBITIONS = `<prohibitions>
<prohibition id="NEG_PARALLELISM" severity="BLOCK">
Never contrast what something "isn't" with what it "is."
Match variants: "isn't X — it's Y", "isn't X. It's Y", "not about X — it's about Y", "wasn't X — was Y", "don't X — Y", "more X, not Y", "X works. It fails Y"
Instead: state what it IS directly. Drop the contrast.
Bad: "The challenge isn't technical — it's organizational"
Good: "The challenge is organizational"
</prohibition>

<prohibition id="EM_DASH_LIMIT" severity="BLOCK">
Maximum 2 em dashes (—) per document. Zero is fine. Three or more is a violation.
Instead: use periods, commas, or restructure the sentence.
</prohibition>

<prohibition id="TERMINAL_PUNCTUATION" severity="BLOCK">
Every paragraph of prose must end with a period, question mark, or exclamation point. No trailing off without punctuation.
This applies to email bodies, message bodies, and all prose — not headers or signatures.
</prohibition>

<prohibition id="AI_SLOP" severity="BLOCK">
Never use "is the kind of X that" — this is a recognized AI writing tell.
Bad: "This is the kind of problem I want to work on"
Good: "I want to work on this problem"
Also avoid: hyperbolic claims like "the most [adj] thing", "thing nobody mentions", "the real X is"
</prohibition>

<prohibition id="COLON_LIMIT" severity="ADVISORY">
Maximum 1 colon in prose per document. Use sparingly.
</prohibition>
</prohibitions>`;

// ── DSPy config loading ──────────────────────────────────────────────

function loadDspyConfig(type: string): DspySavedProgram | null {
  const configPath = join(
    __dirname,
    "../../dspy/optimized_prompts",
    `${type}.json`
  );

  if (!existsSync(configPath)) return null;

  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

// ── Generator ────────────────────────────────────────────────────────

export function generate(type: string, prompt: string, register: string): string {
  const config = loadDspyConfig(type);
  const corrections = loadCorrections();
  const highSignalRules = loadHighSignalRules();

  if (corrections.length === 0 && !highSignalRules && !config) {
    console.error("[arch-h] No data available — falling back to E");
    const archE = require("./arch-e-hybrid.ts");
    return archE.generate(type, prompt, register);
  }

  // Use DSPy-optimized instruction if available and non-default,
  // otherwise use E's proven framing
  const defaultInstruction = "Write prose in a specific editorial voice, following corrections and rules.";
  const dspyInstruction = config?.writer?.signature?.instructions;
  const hasOptimizedInstruction = dspyInstruction && dspyInstruction !== defaultInstruction;

  const instructionBlock = hasOptimizedInstruction
    ? dspyInstruction
    : `You are writing in a specific editorial voice. Three sources of guidance plus hard prohibitions:

1. CORRECTIONS — real examples of text that was flagged in previous writing, with context and reasoning. These are your strongest signal for what to avoid.
2. STRUCTURAL RULES — high-signal patterns that have been reinforced by multiple corrections. Follow these strictly.
3. PROHIBITIONS — the patterns below must never appear in any form.`;

  // Build correction and rules blocks (same as E)
  const correctionBlock = corrections.length > 0
    ? `<corrections>\n${formatCorrections(corrections)}\n</corrections>`
    : "";

  const rulesBlock = highSignalRules
    ? `<structural-rules>\nThese are high-confidence structural rules. Follow them strictly:\n${highSignalRules}\n</structural-rules>`
    : "";

  // Add DSPy few-shot demonstrations if available
  let demosBlock = "";
  const demos = config?.writer?.demos;
  if (demos && demos.length > 0) {
    demosBlock = "<demonstrations>\n";
    for (const demo of demos) {
      if (demo.prose) {
        demosBlock += `<example>
Writing type: ${demo.writing_type || type}
Prompt: ${demo.prompt || ""}
Output: ${demo.prose}
</example>\n\n`;
      }
    }
    demosBlock += "</demonstrations>\n";
  }

  const fullPrompt = `${instructionBlock}

${PROHIBITIONS}

${correctionBlock}

${rulesBlock}

${demosBlock}

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
    console.error("[arch-h] Generation failed:", (err as Error).message);
    return "";
  }
}
