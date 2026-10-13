#!/usr/bin/env npx tsx
/**
 * Make the blind A/B sheet Sam fills in (V3). The arm-to-label key goes in a
 * separate file so the sheet itself reveals nothing.
 *
 *   cd mcp
 *   pnpm exec tsx scripts/regression/rewrite-eval/blind-sheet.ts \
 *     --corpus ~/.margin/eval-corpus/humanizer-pilot --a a3 --b a2 --run 1
 *
 * Writes blind-a3-vs-a2.md and blind-a3-vs-a2.key.json into the corpus folder.
 */
import { readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import type { Manifest } from "./corpus.ts";
import { makeBlindSheet, type BlindItem } from "./blind.ts";
import type { RewriteFile } from "./types.ts";

const { values } = parseArgs({
  options: {
    corpus: { type: "string", default: join(homedir(), ".margin/eval-corpus/humanizer-pilot") },
    a: { type: "string", default: "a3" },
    b: { type: "string", default: "a2" },
    run: { type: "string", default: "1" },
  },
});
const dir = values.corpus!;
const manifest: Manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
const load = (arm: string): RewriteFile => JSON.parse(readFileSync(join(dir, "outputs", `${arm}-run${values.run}.json`), "utf-8"));
const A = load(values.a!), B = load(values.b!);

const items: BlindItem[] = manifest.docs
  .filter((d) => d.split === "heldout")
  .map((d) => ({
    draftId: d.id,
    draft: readFileSync(join(dir, "drafts", `${d.id}.txt`), "utf-8"),
    outputs: { [values.a!]: A[d.id]?.text ?? "", [values.b!]: B[d.id]?.text ?? "" },
  }));
const { sheet, key } = makeBlindSheet(items, values.a!, values.b!);
const base = join(dir, `blind-${values.a}-vs-${values.b}`);
writeFileSync(`${base}.md`, sheet);
writeFileSync(`${base}.key.json`, JSON.stringify(key, null, 2));
console.log(`wrote ${base}.md (${Object.keys(key).length} drafts) and the key`);
