#!/usr/bin/env npx tsx
/**
 * Build the frozen draft corpus for the humanizer comparison.
 *
 *   cd mcp && pnpm exec tsx scripts/regression/rewrite-eval/build-draft-corpus.ts \
 *     [--db ~/.margin/margin.db] [--out ~/.margin/eval-corpus/humanizer-pilot] [--heldout 0.3]
 *
 * Read-only on the database. Writes drafts and the manifest OUTSIDE the repo
 * because they contain private writing. To enable metric V2 for a draft, drop
 * Sam's final version at <out>/finals/<document id>.txt before scoring.
 */
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import { buildCandidates, readCorrectionRows, wordCount, type Manifest } from "./corpus.ts";
import { timeSplit } from "./split.ts";

const { values } = parseArgs({
  options: {
    db: { type: "string", default: join(homedir(), ".margin/margin.db") },
    out: { type: "string", default: join(homedir(), ".margin/eval-corpus/humanizer-pilot") },
    heldout: { type: "string", default: "0.3" },
  },
});

const { corrections, documents } = readCorrectionRows(values.db!);
const { candidates, skipped } = buildCandidates(corrections, documents);
console.error(`${corrections.length} usable correction rows, ${candidates.length} usable drafts, ${skipped.length} documents skipped`);
for (const s of skipped) console.error(`  skipped ${s.id}: ${s.reason}`);
if (candidates.length < 2) {
  console.error("Not enough drafts to build a corpus.");
  process.exit(1);
}

const frac = Number(values.heldout);
const split = timeSplit(candidates.map((c) => ({ id: c.id, type: c.type, firstCorrectionAt: c.firstCorrectionAt })), frac);
const heldout = new Set(split.heldout);

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
      type: c.type,
      title: c.title,
      words: wordCount(c.text),
      firstCorrectionAt: c.firstCorrectionAt,
      spans: c.spans,
      split: heldout.has(c.id) ? ("heldout" as const) : ("train" as const),
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
console.log(`held-out drafts: ${split.heldout.length}, train drafts: ${split.train.length}`);
for (const [t, r] of byType) console.log(`  ${t.padEnd(14)} heldout ${r.heldout}  train ${r.train}`);
if (split.heldout.length < 30) console.log("PILOT: fewer than 30 held-out drafts, so no win/loss verdict will be issued.");
