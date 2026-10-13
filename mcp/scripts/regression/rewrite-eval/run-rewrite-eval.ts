#!/usr/bin/env npx tsx
/**
 * Generate rewrites for each arm. Resumable: drafts already present in an
 * output file are skipped, so an interrupted humanizer run can be restarted.
 *
 *   cd mcp
 *   MARGIN_EVAL_CMD="claude --print --model sonnet" \
 *   pnpm exec tsx scripts/regression/rewrite-eval/run-rewrite-eval.ts \
 *     --corpus ~/.margin/eval-corpus/humanizer-pilot --arms a0,a1,a2,a3,a4 --run 1
 *
 * Humanizer arms (a2, a4) need llama-server running; see docs/humanizer-baseline-eval.md.
 * Run a2 with --run 1, 2, 3: it samples at temperature 1.0.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import { REGISTER_MAP } from "../../shared.ts";
import { ARMS, isArm, runArm, type Arm } from "./arms.ts";
import { loadRulesAsOf, type Manifest } from "./corpus.ts";
import type { RewriteFile } from "./types.ts";

const { values } = parseArgs({
  options: {
    corpus: { type: "string", default: join(homedir(), ".margin/eval-corpus/humanizer-pilot") },
    db: { type: "string", default: join(homedir(), ".margin/margin.db") },
    arms: { type: "string", default: ARMS.join(",") },
    run: { type: "string", default: "1" },
    split: { type: "string", default: "heldout" },
    limit: { type: "string" },
  },
});

const manifest: Manifest = JSON.parse(readFileSync(join(values.corpus!, "manifest.json"), "utf-8"));
const arms = values.arms!.split(",").map((a) => a.trim());
for (const a of arms) if (!isArm(a)) throw new Error(`unknown arm: ${a}`);
const outDir = join(values.corpus!, "outputs");
mkdirSync(outDir, { recursive: true });

let docs = manifest.docs.filter((d) => values.split === "all" || d.split === values.split);
if (values.limit) docs = docs.slice(0, Number(values.limit));
console.error(`${docs.length} drafts (${values.split}), arms ${arms.join(",")}, run ${values.run}`);

const loadOut = (arm: Arm): RewriteFile => {
  const p = join(outDir, `${arm}-run${values.run}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : {};
};
const saveOut = (arm: Arm, f: RewriteFile) => writeFileSync(join(outDir, `${arm}-run${values.run}.json`), JSON.stringify(f, null, 2));

// a2 first so a4 can reuse the same humanizer sample
const ordered = (arms as Arm[]).sort((x, y) => ARMS.indexOf(x) - ARMS.indexOf(y));
for (const arm of ordered) {
  const out = loadOut(arm);
  const a2 = arm === "a4" ? loadOut("a2") : {};
  for (const doc of docs) {
    if (out[doc.id]?.text && !out[doc.id].error) continue;
    const draft = readFileSync(join(values.corpus!, "drafts", `${doc.id}.txt`), "utf-8");
    const register = REGISTER_MAP[doc.type] ?? "casual";
    const rules = arm === "a3" || arm === "a4" ? loadRulesAsOf(values.db!, manifest.cutoff, doc.type, register) : "";
    const t0 = Date.now();
    try {
      const text = runArm(arm, draft, { rules }, undefined, a2[doc.id]?.text || undefined);
      if (!text) throw new Error("empty output");
      out[doc.id] = { text, ms: Date.now() - t0 };
      console.error(`  ${arm} ${doc.id} ok (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      // a failed generation is recorded, never scored as an output
      out[doc.id] = { text: "", ms: Date.now() - t0, error: (e as Error).message.slice(0, 300) };
      console.error(`  ${arm} ${doc.id} FAILED: ${out[doc.id].error}`);
    }
    saveOut(arm, out);
  }
}
console.log(`wrote outputs to ${outDir}`);
