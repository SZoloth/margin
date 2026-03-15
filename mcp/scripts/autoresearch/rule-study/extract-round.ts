#!/usr/bin/env npx tsx

/**
 * Rule Study: Extract corrections from Margin for a completed review round.
 *
 * Usage:
 *   npx tsx extract-round.ts --round baseline
 *
 * Reads the round's results JSON to find which files were generated,
 * queries Margin's DB for corrections on those documents, and computes
 * corrections-per-sample by type.
 *
 * Output: results/<round>-corrections.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { parseArgs } from "util";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

interface CorrectionRecord {
  id: string;
  highlight_id: string;
  original_text: string;
  notes_json: string;
  polarity: string;
  writing_type: string | null;
  prefix_context: string | null;
  suffix_context: string | null;
  created_at: number;
}

interface HighlightRecord {
  id: string;
  document_id: string;
  text_content: string;
  color: string;
  note_text: string | null;
}

interface DocumentRecord {
  id: string;
  file_path: string | null;
  title: string | null;
}

interface SampleCorrections {
  type: string;
  sampleIndex: number;
  filePath: string;
  documentId: string | null;
  correctionCount: number;
  highlightCount: number;
  noteCount: number;
  corrections: {
    originalText: string;
    notes: string;
    polarity: string;
  }[];
  highlights: {
    text: string;
    color: string;
    note: string | null;
  }[];
}

interface ExtractionResult {
  round: string;
  extractedAt: string;
  samples: SampleCorrections[];
  summary: {
    totalSamples: number;
    totalCorrections: number;
    totalHighlights: number;
    totalNotes: number;
    correctionsPerSample: number;
    byType: Record<string, {
      samples: number;
      corrections: number;
      highlights: number;
      correctionsPerSample: number;
    }>;
  };
  proxyCorrelation: {
    proxyPassWithCorrections: number;
    proxyFailWithoutCorrections: number;
    agreement: number;
  } | null;
}

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const RESULTS_DIR = join(SCRIPT_DIR, "results");

function main() {
  const { values } = parseArgs({
    options: {
      round: { type: "string", default: "baseline" },
    },
  });

  const round = values.round!;
  const resultPath = join(RESULTS_DIR, `${round}.json`);

  if (!existsSync(resultPath)) {
    console.error(`No results found for round "${round}" at ${resultPath}`);
    console.error("Run generate-round.ts first.");
    process.exit(1);
  }

  const roundData = JSON.parse(readFileSync(resultPath, "utf-8"));

  // Open Margin DB
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) {
    console.error(`Margin database not found at ${dbPath}`);
    process.exit(1);
  }

  const Database = require("better-sqlite3");
  const db = new Database(dbPath, { readonly: true });

  const sampleResults: SampleCorrections[] = [];

  for (const sample of roundData.samples) {
    const filePath: string = sample.filePath;
    const type: string = sample.type;
    const sampleIndex: number = sample.sampleIndex;

    // Find document by file_path
    const doc = db
      .prepare("SELECT id, file_path, title FROM documents WHERE file_path = ?")
      .get(filePath) as DocumentRecord | undefined;

    if (!doc) {
      console.error(`  [NOT FOUND] ${type}: no document for ${filePath}`);
      console.error(`    → Sam may not have opened this file in Margin yet`);
      sampleResults.push({
        type,
        sampleIndex,
        filePath,
        documentId: null,
        correctionCount: 0,
        highlightCount: 0,
        noteCount: 0,
        corrections: [],
        highlights: [],
      });
      continue;
    }

    // Get corrections for this document's highlights
    const corrections = db
      .prepare(
        `SELECT c.id, c.highlight_id, c.original_text, c.notes_json,
                c.polarity, c.writing_type, c.prefix_context, c.suffix_context,
                c.created_at
         FROM corrections c
         JOIN highlights h ON c.highlight_id = h.id
         WHERE h.document_id = ?
         ORDER BY c.created_at ASC`
      )
      .all(doc.id) as CorrectionRecord[];

    // Get all highlights (some may be corrections, some plain highlights, some with notes)
    const highlights = db
      .prepare(
        `SELECT h.id, h.document_id, h.text_content, h.color,
                mn.text AS note_text
         FROM highlights h
         LEFT JOIN margin_notes mn ON mn.highlight_id = h.id
         WHERE h.document_id = ?`
      )
      .all(doc.id) as HighlightRecord[];

    const noteCount = highlights.filter((h) => h.note_text).length;

    sampleResults.push({
      type,
      sampleIndex,
      filePath,
      documentId: doc.id,
      correctionCount: corrections.length,
      highlightCount: highlights.length,
      noteCount,
      corrections: corrections.map((c) => {
        let notes: string;
        try {
          const parsed = JSON.parse(c.notes_json);
          notes = Array.isArray(parsed)
            ? parsed.map((n: { text?: string }) => n.text ?? String(n)).join("; ")
            : String(parsed);
        } catch {
          notes = c.notes_json ?? "";
        }
        return {
          originalText: c.original_text,
          notes,
          polarity: c.polarity,
        };
      }),
      highlights: highlights.map((h) => ({
        text: h.text_content,
        color: h.color,
        note: h.note_text,
      })),
    });

    // Total annotations = corrections + highlights with notes + plain highlights
    const totalAnnotations = corrections.length + noteCount + highlights.length;
    console.error(
      `  ${type}: ${corrections.length} corrections, ${highlights.length} highlights, ${noteCount} notes`
    );
  }

  db.close();

  // Build summary
  const byType: Record<string, { samples: number; corrections: number; highlights: number; correctionsPerSample: number }> = {};
  for (const s of sampleResults) {
    if (!byType[s.type]) {
      byType[s.type] = { samples: 0, corrections: 0, highlights: 0, correctionsPerSample: 0 };
    }
    byType[s.type].samples++;
    byType[s.type].corrections += s.correctionCount;
    byType[s.type].highlights += s.highlightCount;
  }
  for (const t of Object.keys(byType)) {
    byType[t].correctionsPerSample = byType[t].samples > 0
      ? Math.round((byType[t].corrections / byType[t].samples) * 10) / 10
      : 0;
  }

  const totalCorrections = sampleResults.reduce((s, x) => s + x.correctionCount, 0);
  const totalHighlights = sampleResults.reduce((s, x) => s + x.highlightCount, 0);
  const totalNotes = sampleResults.reduce((s, x) => s + x.noteCount, 0);

  // Proxy correlation (if round data has proxy scores)
  let proxyCorrelation: ExtractionResult["proxyCorrelation"] = null;
  if (roundData.samples[0]?.proxy) {
    let proxyPassWithCorrections = 0;
    let proxyFailWithoutCorrections = 0;
    let total = 0;

    for (let i = 0; i < roundData.samples.length; i++) {
      const proxy = roundData.samples[i].proxy;
      const sr = sampleResults[i];
      if (!sr.documentId) continue; // Skip samples Sam didn't review

      total++;
      const samFoundIssues = sr.correctionCount > 0 || sr.highlightCount > 0;

      if (proxy.pass && samFoundIssues) proxyPassWithCorrections++;
      if (!proxy.pass && !samFoundIssues) proxyFailWithoutCorrections++;
    }

    const agreed = total - proxyPassWithCorrections - proxyFailWithoutCorrections;
    proxyCorrelation = {
      proxyPassWithCorrections,
      proxyFailWithoutCorrections,
      agreement: total > 0 ? Math.round((agreed / total) * 1000) / 1000 : 0,
    };
  }

  const result: ExtractionResult = {
    round,
    extractedAt: new Date().toISOString(),
    samples: sampleResults,
    summary: {
      totalSamples: sampleResults.length,
      totalCorrections,
      totalHighlights,
      totalNotes,
      correctionsPerSample: sampleResults.length > 0
        ? Math.round((totalCorrections / sampleResults.length) * 10) / 10
        : 0,
      byType,
    },
    proxyCorrelation,
  };

  const outPath = join(RESULTS_DIR, `${round}-corrections.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");

  console.error(`\n=== Extraction Summary (Round "${round}") ===`);
  console.error(`Samples reviewed: ${sampleResults.filter((s) => s.documentId).length}/${sampleResults.length}`);
  console.error(`Total corrections: ${totalCorrections}`);
  console.error(`Total highlights: ${totalHighlights}`);
  console.error(`Total notes: ${totalNotes}`);
  console.error(`Corrections/sample: ${result.summary.correctionsPerSample}`);

  if (proxyCorrelation) {
    console.error(`\nProxy correlation:`);
    console.error(`  Proxy PASS but Sam corrected: ${proxyCorrelation.proxyPassWithCorrections}`);
    console.error(`  Proxy FAIL but Sam found nothing: ${proxyCorrelation.proxyFailWithoutCorrections}`);
    console.error(`  Agreement: ${(proxyCorrelation.agreement * 100).toFixed(1)}%`);
  }

  console.error(`\nType breakdown:`);
  for (const [type, data] of Object.entries(byType)) {
    console.error(`  ${type}: ${data.correctionsPerSample} corrections/sample (${data.corrections} total, ${data.samples} samples)`);
  }

  console.error(`\nOutput: ${outPath}`);
  console.error(`\nNext: Run synthesize-rules.ts to convert corrections into candidate rules`);

  // Also print JSON to stdout for piping
  console.log(JSON.stringify(result, null, 2));
}

main();
