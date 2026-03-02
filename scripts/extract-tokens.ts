/**
 * Token bridge: extracts CSS custom properties from Margin's stylesheets
 * and outputs a structured JSON file for design-tool ↔ code sync.
 *
 * Usage: npx tsx scripts/extract-tokens.ts
 * Output: src/tokens/margin-tokens.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const STYLES_DIR = resolve(ROOT, "src/styles");

// Files to parse (in order)
const CSS_FILES = [
  resolve(STYLES_DIR, "globals.css"),
  resolve(STYLES_DIR, "typography.css"),
  resolve(STYLES_DIR, "tabs.css"),
  resolve(STYLES_DIR, "diff.css"),
];

interface TokenMap {
  colors: { light: Record<string, string>; dark: Record<string, string> };
  radii: Record<string, string>;
  shadows: Record<string, string>;
  motion: Record<string, string>;
  typography: {
    families: Record<string, string>;
    readerFontSize: string;
    readerLineHeight: string;
    readerMaxWidth: string;
    headings: Record<string, { size: string; weight: string; lineHeight: string }>;
  };
  theme: Record<string, string>;
  reverseMap: Record<string, string>;
}

function extractCustomProperties(css: string, selectorPattern: string): Record<string, string> {
  // selectorPattern is a raw regex string — NOT escaped further
  const blockRegex = new RegExp(`${selectorPattern}\\s*\\{([^}]+)\\}`, "g");
  const props: Record<string, string> = {};

  let match;
  while ((match = blockRegex.exec(css)) !== null) {
    const body = match[1];
    const propRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let propMatch;
    while ((propMatch = propRegex.exec(body)) !== null) {
      props[propMatch[1].trim()] = propMatch[2].trim();
    }
  }
  return props;
}

function extractTypography(css: string): TokenMap["typography"] {
  const families: Record<string, string> = {};
  const headings: Record<string, { size: string; weight: string; lineHeight: string }> = {};

  // Extract unique font-family stacks, keyed by full value to avoid collisions
  const familyRegex = /font-family:\s*([^;]+);/g;
  let m;
  const seen = new Set<string>();
  let idx = 0;
  while ((m = familyRegex.exec(css)) !== null) {
    const val = m[1].trim();
    if (!seen.has(val)) {
      seen.add(val);
      const baseName = val.split(",")[0].replace(/['"]/g, "").trim().toLowerCase().replace(/\s+/g, "-");
      // Append index suffix when key already exists (e.g. newsreader body vs heading)
      const key = families[baseName] ? `${baseName}-${idx}` : baseName;
      families[key] = val;
      idx++;
    }
  }

  // Extract .reader-content base values
  const readerMatch = css.match(/\.reader-content\s*\{([^}]+)\}/);
  let readerFontSize = "1.125rem";
  let readerLineHeight = "1.72";
  let readerMaxWidth = "65ch";
  if (readerMatch) {
    const body = readerMatch[1];
    const sizeMatch = body.match(/font-size:\s*([^;]+);/);
    const lhMatch = body.match(/line-height:\s*([^;]+);/);
    const mwMatch = body.match(/max-width:\s*([^;]+);/);
    if (sizeMatch) readerFontSize = sizeMatch[1].trim();
    if (lhMatch) readerLineHeight = lhMatch[1].trim();
    if (mwMatch) readerMaxWidth = mwMatch[1].trim();
  }

  // Extract heading styles
  for (const level of ["h1", "h2", "h3"]) {
    const headingRegex = new RegExp(`\\.reader-content\\s+${level}\\s*\\{([^}]+)\\}`);
    const hMatch = css.match(headingRegex);
    if (hMatch) {
      const body = hMatch[1];
      const size = body.match(/font-size:\s*([^;]+);/)?.[1]?.trim() ?? "";
      const weight = body.match(/font-weight:\s*([^;]+);/)?.[1]?.trim() ?? "";
      const lh = body.match(/line-height:\s*([^;]+);/)?.[1]?.trim() ?? "";
      headings[level] = { size, weight, lineHeight: lh };
    }
  }

  return { families, readerFontSize, readerLineHeight, readerMaxWidth, headings };
}

function categorizeTokens(
  lightProps: Record<string, string>,
  darkProps: Record<string, string>,
  themeProps: Record<string, string>,
): Pick<TokenMap, "colors" | "radii" | "shadows" | "motion"> {
  const colors: TokenMap["colors"] = { light: {}, dark: {} };
  const radii: Record<string, string> = {};
  const shadows: Record<string, string> = {};
  const motion: Record<string, string> = {};

  for (const [key, value] of Object.entries(lightProps)) {
    if (key.startsWith("--color-") || key.startsWith("--hover-") || key.startsWith("--active-")) {
      colors.light[key] = value;
    } else if (key.startsWith("--radius-")) {
      radii[key] = value;
    } else if (key.startsWith("--shadow-")) {
      shadows[key] = value;
    } else if (key.startsWith("--ease-") || key.startsWith("--duration-")) {
      motion[key] = value;
    }
  }

  for (const [key, value] of Object.entries(darkProps)) {
    if (key.startsWith("--color-") || key.startsWith("--hover-") || key.startsWith("--active-")) {
      colors.dark[key] = value;
    } else if (key.startsWith("--shadow-")) {
      // Dark mode shadows override light ones — store under same key
      shadows[`${key}--dark`] = value;
    }
  }

  return { colors, radii, shadows, motion };
}

function buildReverseMap(lightColors: Record<string, string>): Record<string, string> {
  const reverse: Record<string, string> = {};
  for (const [key, value] of Object.entries(lightColors)) {
    // Normalize hex to lowercase for lookup
    const normalized = value.toLowerCase();
    reverse[normalized] = `var(${key})`;
  }
  return reverse;
}

function main() {
  // Extract from globals.css specifically for :root and dark blocks
  const globalsCss = readFileSync(CSS_FILES[0], "utf-8");
  const lightProps = extractCustomProperties(globalsCss, ":root(?![\\[])");
  const darkProps = extractCustomProperties(globalsCss, ':root\\[data-theme="dark"\\]');
  const themeProps = extractCustomProperties(globalsCss, "@theme");

  const { colors, radii, shadows, motion } = categorizeTokens(lightProps, darkProps, themeProps);

  // Typography from typography.css
  const typoCss = readFileSync(CSS_FILES[1], "utf-8");
  const typography = extractTypography(typoCss);

  // Reverse map: literal value → CSS variable
  const allLightValues = { ...colors.light };
  for (const [k, v] of Object.entries(radii)) allLightValues[k] = v;
  const reverseMap = buildReverseMap(allLightValues);

  const tokens: TokenMap = {
    colors,
    radii,
    shadows,
    motion,
    typography,
    theme: themeProps,
    reverseMap,
  };

  const outPath = resolve(ROOT, "src/tokens/margin-tokens.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(tokens, null, 2) + "\n");
  console.log(`✓ Wrote ${Object.keys(colors.light).length} light tokens, ${Object.keys(colors.dark).length} dark tokens`);
  console.log(`✓ ${Object.keys(reverseMap).length} reverse-map entries`);
  console.log(`✓ Output: ${outPath}`);
}

main();
