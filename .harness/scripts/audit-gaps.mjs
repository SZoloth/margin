#!/usr/bin/env node

/**
 * audit-gaps.mjs — validates .harness/gaps.jsonl
 *
 * Checks:
 * 1. Every line parses as valid JSON with required fields
 * 2. All closed entries have non-empty test_added and commit_fixed
 * 3. Referenced test files exist on disk
 * 4. No duplicate IDs
 * 5. IDs follow GAP-NNN format
 *
 * Usage: node .harness/scripts/audit-gaps.mjs
 * Exit code: 0 if all checks pass, 1 if any fail
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAPS_FILE = resolve(__dirname, "..", "gaps.jsonl");
const PROJECT_ROOT = resolve(__dirname, "..", "..");

const REQUIRED_FIELDS = [
  "id",
  "date",
  "description",
  "root_cause",
  "escaped_tier",
  "status",
];
const ID_PATTERN = /^GAP-\d{3,}$/;
const VALID_TIERS = ["data-layer", "standard"];
const VALID_STATUSES = ["open", "closed"];

let errors = [];
let warnings = [];

function error(line, msg) {
  errors.push(`Line ${line}: ${msg}`);
}

function warn(line, msg) {
  warnings.push(`Line ${line}: ${msg}`);
}

// Read gaps file
let lines;
try {
  const content = readFileSync(GAPS_FILE, "utf-8").trim();
  if (content === "") {
    console.log("gaps.jsonl is empty — nothing to audit.");
    process.exit(0);
  }
  lines = content.split("\n");
} catch (e) {
  if (e.code === "ENOENT") {
    console.error(`gaps.jsonl not found at ${GAPS_FILE}`);
    process.exit(1);
  }
  throw e;
}

const seenIds = new Set();
const entries = [];

// Parse and validate each line
for (let i = 0; i < lines.length; i++) {
  const lineNum = i + 1;
  const raw = lines[i].trim();
  if (raw === "") continue;

  let entry;
  try {
    entry = JSON.parse(raw);
  } catch {
    error(lineNum, `Invalid JSON: ${raw.slice(0, 80)}...`);
    continue;
  }

  entries.push({ lineNum, entry });

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!entry[field] && entry[field] !== 0) {
      error(lineNum, `Missing required field: ${field}`);
    }
  }

  // ID format
  if (entry.id) {
    if (!ID_PATTERN.test(entry.id)) {
      error(lineNum, `ID "${entry.id}" does not match GAP-NNN format`);
    }
    if (seenIds.has(entry.id)) {
      error(lineNum, `Duplicate ID: ${entry.id}`);
    }
    seenIds.add(entry.id);
  }

  // Valid tier
  if (entry.escaped_tier && !VALID_TIERS.includes(entry.escaped_tier)) {
    error(
      lineNum,
      `Invalid escaped_tier "${entry.escaped_tier}" — expected: ${VALID_TIERS.join(", ")}`,
    );
  }

  // Valid status
  if (entry.status && !VALID_STATUSES.includes(entry.status)) {
    error(
      lineNum,
      `Invalid status "${entry.status}" — expected: ${VALID_STATUSES.join(", ")}`,
    );
  }

  // Closed entries must have test_added and commit_fixed
  if (entry.status === "closed") {
    if (!entry.commit_fixed) {
      error(lineNum, `Closed entry ${entry.id} missing commit_fixed`);
    }
    if (!entry.test_added) {
      error(lineNum, `Closed entry ${entry.id} missing test_added`);
    }
  }

  // Verify referenced test file exists
  if (entry.test_added) {
    const testPath = entry.test_added.split(":")[0];
    const fullPath = resolve(PROJECT_ROOT, testPath);
    if (!existsSync(fullPath)) {
      error(
        lineNum,
        `Referenced test file does not exist: ${testPath}`,
      );
    }
  }

  // Warn on open entries older than 14 days
  if (entry.status === "open" && entry.date) {
    const age = Math.floor(
      (Date.now() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (age > 14) {
      warn(lineNum, `${entry.id} has been open for ${age} days`);
    }
  }
}

// Report
console.log(`Audited ${entries.length} gap entries.\n`);

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log();
}

if (errors.length > 0) {
  console.log("Errors:");
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(`\n${errors.length} error(s) found.`);
  process.exit(1);
}

console.log("All checks passed.");
process.exit(0);
