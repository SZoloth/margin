/**
 * Design-system token linter
 *
 * Catches hardcoded colors, raw font sizes, and undefined CSS variable
 * references in staged (or all) source files.
 *
 * Usage:
 *   node --experimental-strip-types scripts/lint-tokens.ts          # staged files only
 *   node --experimental-strip-types scripts/lint-tokens.ts --all    # entire src/
 *   node --experimental-strip-types scripts/lint-tokens.ts --dump-baseline
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative, extname } from "node:path";
import { execSync } from "node:child_process";

// ── paths ──────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const STYLES_DIR = resolve(ROOT, "src/styles");
const TOKENS_PATH = resolve(ROOT, "src/tokens/margin-tokens.json");
const BASELINE_PATH = resolve(ROOT, "scripts/lint-tokens-baseline.json");

// ── types ──────────────────────────────────────────────────────────────

interface Violation {
  file: string;      // relative path
  line: number;
  rule: "hardcoded-color" | "hardcoded-fontsize" | "undefined-css-var";
  snippet: string;   // the offending line (trimmed)
  suggestion?: string;
}

type BaselineEntry = Pick<Violation, "file" | "line" | "rule" | "snippet">;

// ── token registry ─────────────────────────────────────────────────────

function buildTokenRegistry(): Set<string> {
  const tokens = new Set<string>();
  const cssFiles = readdirSync(STYLES_DIR).filter(f => f.endsWith(".css"));

  for (const file of cssFiles) {
    const css = readFileSync(resolve(STYLES_DIR, file), "utf-8");
    const re = /(--[\w-]+)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
      tokens.add(m[1]);
    }
  }

  // Also pick up Tailwind @theme tokens from globals.css
  return tokens;
}

function loadReverseMap(): Record<string, string> {
  if (!existsSync(TOKENS_PATH)) return {};
  const data = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  return data.reverseMap ?? {};
}

// ── file collection ────────────────────────────────────────────────────

function getStagedFiles(): string[] {
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACM", {
      cwd: ROOT,
      encoding: "utf-8",
    });
    return out
      .split("\n")
      .map(f => f.trim())
      .filter(f => /\.(css|tsx?|ts)$/.test(f));
  } catch {
    return [];
  }
}

function getAllSourceFiles(): string[] {
  try {
    const out = execSync("git ls-files 'src/**/*.css' 'src/**/*.tsx' 'src/**/*.ts'", {
      cwd: ROOT,
      encoding: "utf-8",
    });
    return out.split("\n").map(f => f.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ── skip list ──────────────────────────────────────────────────────────

/** Files where token definitions live — not violations */
const COLOR_DEFINITION_FILES = new Set(["src/styles/globals.css"]);
const FONTSIZE_DEFINITION_FILES = new Set(["src/styles/typography.css"]);

/** Files to skip entirely (the linter itself, config, etc.) */
const SKIP_FILES = new Set(["scripts/lint-tokens.ts"]);

// ── inline suppression ─────────────────────────────────────────────────

const SUPPRESS_COMMENT = "ds-lint-disable";

function isSuppressed(lines: string[], lineIdx: number): boolean {
  const current = lines[lineIdx];
  if (current.includes(SUPPRESS_COMMENT)) return true;
  if (lineIdx > 0 && lines[lineIdx - 1].trim().startsWith("/*") && lines[lineIdx - 1].includes(SUPPRESS_COMMENT)) return true;
  if (lineIdx > 0 && lines[lineIdx - 1].trim().startsWith("//") && lines[lineIdx - 1].includes(SUPPRESS_COMMENT)) return true;
  return false;
}

// ── rules ──────────────────────────────────────────────────────────────

/**
 * Rule 1: hardcoded-color
 * Matches bare hex values (#fff, #1A1714, #ff000080) in CSS/TSX.
 * Skips:
 *   - globals.css (token definitions)
 *   - hex inside var() fallbacks, e.g. var(--color-danger, #ef4444)
 */
function checkHardcodedColor(
  relPath: string,
  lines: string[],
  reverseMap: Record<string, string>,
): Violation[] {
  if (COLOR_DEFINITION_FILES.has(relPath)) return [];

  const violations: Violation[] = [];
  // Match #hex that isn't inside a var() fallback
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;

  for (let i = 0; i < lines.length; i++) {
    if (isSuppressed(lines, i)) continue;
    const line = lines[i];
    let m: RegExpExecArray | null;
    hexRe.lastIndex = 0;
    while ((m = hexRe.exec(line)) !== null) {
      const hex = m[0];
      const matchIdx = m.index;

      // Skip if inside a var() fallback: look back for "var(--..., " pattern
      const before = line.slice(0, matchIdx);
      if (/var\(--[\w-]+,\s*$/.test(before)) continue;

      const suggestion = reverseMap[hex.toLowerCase()];
      violations.push({
        file: relPath,
        line: i + 1,
        rule: "hardcoded-color",
        snippet: line.trim(),
        suggestion: suggestion ? `Use ${suggestion}` : undefined,
      });
    }
  }
  return violations;
}

/**
 * Rule 2: hardcoded-fontsize
 * Matches raw font-size: NNpx in CSS, and fontSize: NN in TSX inline styles.
 * Skips typography.css (reader prose scale).
 */
function checkHardcodedFontSize(
  relPath: string,
  lines: string[],
): Violation[] {
  if (FONTSIZE_DEFINITION_FILES.has(relPath)) return [];

  const violations: Violation[] = [];
  const isCss = relPath.endsWith(".css");

  for (let i = 0; i < lines.length; i++) {
    if (isSuppressed(lines, i)) continue;
    const line = lines[i];

    if (isCss) {
      // font-size: 13px — but not font-size: var(...)
      if (/font-size:\s*\d+px/.test(line) && !/font-size:\s*var\(/.test(line)) {
        const sizeMatch = line.match(/font-size:\s*(\d+)px/);
        const size = sizeMatch?.[1];
        const tokenHint = size ? sizeHint(Number(size)) : undefined;
        violations.push({
          file: relPath,
          line: i + 1,
          rule: "hardcoded-fontsize",
          snippet: line.trim(),
          suggestion: tokenHint,
        });
      }
    } else {
      // fontSize: 13 or fontSize: "13px"
      if (/fontSize:\s*\d+/.test(line)) {
        const sizeMatch = line.match(/fontSize:\s*(\d+)/);
        const size = sizeMatch?.[1];
        const tokenHint = size ? sizeHint(Number(size)) : undefined;
        violations.push({
          file: relPath,
          line: i + 1,
          rule: "hardcoded-fontsize",
          snippet: line.trim(),
          suggestion: tokenHint,
        });
      }
    }
  }
  return violations;
}

/** Map common pixel sizes to design tokens */
function sizeHint(px: number): string | undefined {
  const map: Record<number, string> = {
    12: "var(--text-xs)",
    13: "var(--text-sm)",
    14: "var(--text-base)",
    16: "var(--text-lg)",
    20: "var(--text-xl)",
    28: "var(--text-2xl)",
  };
  return map[px] ? `Use ${map[px]}` : undefined;
}

/**
 * Rule 3: undefined-css-var
 * Matches var(--token) where --token isn't defined in src/styles/*.css.
 * Skips dynamic template-literal patterns like var(--color-highlight-${color}).
 */
function checkUndefinedCssVar(
  relPath: string,
  lines: string[],
  registry: Set<string>,
): Violation[] {
  const violations: Violation[] = [];
  const varRe = /var\((--[\w-]+)/g;

  for (let i = 0; i < lines.length; i++) {
    if (isSuppressed(lines, i)) continue;
    const line = lines[i];

    // Skip lines with template literal interpolation in var references
    if (/var\(--[\w-]*\$\{/.test(line)) continue;

    let m: RegExpExecArray | null;
    varRe.lastIndex = 0;
    while ((m = varRe.exec(line)) !== null) {
      const token = m[1];
      if (!registry.has(token)) {
        // Also skip Tailwind utility tokens (--tw-*, --spacing-*, etc.)
        if (token.startsWith("--tw-") || token.startsWith("--spacing")) continue;
        // Skip reader-* tokens (set at runtime via JS)
        if (token.startsWith("--reader-")) continue;
        // Skip font-family token (set at runtime)
        if (token === "--font-family") continue;
        violations.push({
          file: relPath,
          line: i + 1,
          rule: "undefined-css-var",
          snippet: line.trim(),
          suggestion: `--${token.slice(2)} is not defined in src/styles/`,
        });
      }
    }
  }
  return violations;
}

// ── baseline ───────────────────────────────────────────────────────────

function loadBaseline(): BaselineEntry[] {
  if (!existsSync(BASELINE_PATH)) return [];
  return JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
}

function baselineKey(v: BaselineEntry): string {
  return `${v.file}:${v.line}:${v.rule}:${v.snippet}`;
}

function filterBaseline(violations: Violation[], baseline: BaselineEntry[]): Violation[] {
  const known = new Set(baseline.map(baselineKey));
  return violations.filter(v => !known.has(baselineKey(v)));
}

function dumpBaseline(violations: Violation[]): void {
  const entries: BaselineEntry[] = violations.map(v => ({
    file: v.file,
    line: v.line,
    rule: v.rule,
    snippet: v.snippet,
  }));
  writeFileSync(BASELINE_PATH, JSON.stringify(entries, null, 2) + "\n");
  console.log(`Wrote ${entries.length} baseline entries to ${relative(ROOT, BASELINE_PATH)}`);
}

// ── main ───────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const dumpBaselineFlag = args.includes("--dump-baseline");
  const allFlag = args.includes("--all") || dumpBaselineFlag;

  const registry = buildTokenRegistry();
  const reverseMap = loadReverseMap();

  const files = allFlag ? getAllSourceFiles() : getStagedFiles();

  if (!allFlag && files.length === 0) {
    // No staged files to lint
    process.exit(0);
  }

  const allViolations: Violation[] = [];

  for (const relFile of files) {
    if (SKIP_FILES.has(relFile)) continue;
    const absPath = resolve(ROOT, relFile);
    if (!existsSync(absPath)) continue;

    const content = readFileSync(absPath, "utf-8");
    const lines = content.split("\n");

    allViolations.push(...checkHardcodedColor(relFile, lines, reverseMap));
    allViolations.push(...checkHardcodedFontSize(relFile, lines));
    allViolations.push(...checkUndefinedCssVar(relFile, lines, registry));
  }

  if (dumpBaselineFlag) {
    dumpBaseline(allViolations);
    return;
  }

  const baseline = loadBaseline();
  const newViolations = filterBaseline(allViolations, baseline);

  if (newViolations.length === 0) {
    if (allFlag && allViolations.length > 0) {
      console.log(`All ${allViolations.length} violations are baselined. No new issues.`);
    }
    process.exit(0);
  }

  // Report new violations
  console.error(`\n  Design-system token lint: ${newViolations.length} new violation(s)\n`);

  for (const v of newViolations) {
    const loc = `  ${v.file}:${v.line}`;
    const rule = `[${v.rule}]`;
    console.error(`${loc}  ${rule}`);
    console.error(`    ${v.snippet}`);
    if (v.suggestion) {
      console.error(`    → ${v.suggestion}`);
    }
    console.error("");
  }

  console.error("  Suppress with /* ds-lint-disable */ on the same line or line above.\n");
  process.exit(1);
}

main();
