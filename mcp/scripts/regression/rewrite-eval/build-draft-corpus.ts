#!/usr/bin/env npx tsx
/**
 * Build the frozen draft corpus for the humanizer comparison.
 *
 *   cd mcp && pnpm exec tsx scripts/regression/rewrite-eval/build-draft-corpus.ts \
 *     [--db ~/.margin/margin.db] [--out ~/.margin/eval-corpus/humanizer-pilot] [--heldout 0.3]
 *     [--source files|passages]
 *
 * --source files (default): the draft is the document file the database points at.
 * --source passages: use the saved context around each flagged span as the unit,
 * for when the source files are gone. The split is always by document.
 *
 * Read-only on the database. Writes drafts and the manifest OUTSIDE the repo
 * because they contain private writing. To enable metric V2 for a draft, drop
 * Sam's final version at <out>/finals/<document id>.txt before scoring.
 */
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import { buildCandidates, buildPassageCandidates, readCorrectionRows, wordCount, type Manifest } from "./corpus.ts";
import { timeSplit } from "./split.ts";

const { values } = parseArgs({
  options: {
    db: { type: "string", default: join(homedir(), ".margin/margin.db") },
    out: { type: "string", default: join(homedir(), ".margin/eval-corpus/humanizer-pilot") },
    heldout: { type: "string", default: "0.3" },
    source: { type: "string", default: "files" },
  },
});

const { corrections, documents } = readCorrectionRows(values.db!);
if (values.source !== "files" && values.source !== "passages") throw new Error("--source must be files or passages");
const built = values.source === "passages" ? buildPassageCandidates(corrections) : buildCandidates(corrections, documents);
const { candidates, skipped } = built;
const unplaced = "unplacedRows" in built ? built.unplacedRows : 0;
console.error(`${corrections.length} usable correction rows, ${candidates.length} usable ${values.source}, ${skipped.length} documents skipped${unplaced ? `, ${unplaced} rows fit no passage` : ""}`);
for (const s of skipped) console.error(`  skipped ${s.id}: ${s.reason}`);
if (candidates.length < 2) {
  console.error("Not enough drafts to build a corpus.");
  process.exit(1);
}

const frac = Number(values.heldout);
// split by DOCUMENT so passages of one document never straddle train and held-out
const docTimes = new Map<string, { type: string; at: number }>();
for (const c of candidates) {
  const d = docTimes.get(c.documentId);
  if (!d || c.firstCorrectionAt < d.at) docTimes.set(c.documentId, { type: c.type, at: c.firstCorrectionAt });
}
const split = timeSplit([...docTimes].map(([id, d]) => ({ id, type: d.type, firstCorrectionAt: d.at })), frac);
const heldoutDocs = new Set(split.heldout);

mkdirSync(join(values.out!, "drafts"), { recursive: true });
mkdirSync(join(values.out!, "finals"), { recursive: true });
const manifest: Manifest = {
  created: new Date().toISOString(),
  cutoff: split.cutoff,
  heldoutFraction: frac,
  skipped,
  docs: candidates.map((c) => {
    writeFileSync(join(values.out!, "drafts", `${c.id}.txt`), c.text);
    return {
      id: c.id,
      documentId: c.documentId,
      type: c.type,
      title: c.title,
      words: wordCount(c.text),
      firstCorrectionAt: c.firstCorrectionAt,
      spans: c.spans,
      split: heldoutDocs.has(c.documentId) ? ("heldout" as const) : ("train" as const),
      hasFinal: existsSync(join(values.out!, "finals", `${c.id}.txt`)),
    };
  }),
};
writeFileSync(join(values.out!, "manifest.json"), JSON.stringify(manifest, null, 2));

const byType = new Map<string, { train: number; heldout: number }>();
for (const d of manifest.docs) {
  const row = byType.get(d.type) ?? { train: 0, heldout: 0 };
  row[d.split]++;
  byType.set(d.type, row);
}
console.log(`corpus: ${values.out}`);
console.log(`rule cutoff: ${new Date(split.cutoff).toISOString()} (A3 sees only rules last updated before this)`);
const heldUnits = manifest.docs.filter((d) => d.split === "heldout").length;
console.log(`held-out: ${heldUnits} units from ${split.heldout.length} documents; train: ${manifest.docs.length - heldUnits} units from ${split.train.length} documents`);
for (const [t, r] of byType) console.log(`  ${t.padEnd(14)} heldout ${r.heldout}  train ${r.train}`);
if (heldUnits < 30 || split.heldout.length < 10) console.log("PILOT: fewer than 30 held-out units or 10 held-out documents, so no win/loss verdict will be issued.");
