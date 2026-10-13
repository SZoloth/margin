#!/usr/bin/env npx tsx
/**
 * Score rewrites: F1 (deterministic), F3 hygiene, optional V1/F2 judges, V2 when
 * finals exist, paired comparisons and the pre-registered verdict.
 *
 *   cd mcp
 *   pnpm exec tsx scripts/regression/rewrite-eval/score-rewrite-eval.ts \
 *     --corpus ~/.margin/eval-corpus/humanizer-pilot [--judge] [--blind-picks blind-a3-vs-a2.md]
 *
 * --judge makes LLM calls through MARGIN_EVAL_CMD (V1 per draft per arm, plus F2).
 * Without it only the deterministic metrics are computed.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import { ARMS, ARM_LABELS, runCmd, type Arm } from "./arms.ts";
import type { Manifest } from "./corpus.ts";
import { compareFacts } from "./facts.ts";
import { factJudgePrompt, parseFactJudgement, parseSpanVerdicts, spanJudgePrompt } from "./prompts.ts";
import { pairedBootstrap, type Interval } from "./stats.ts";
import { scoreBlindSheet, type BlindKey, type BlindScore } from "./blind.ts";
import { decide } from "./verdict.ts";
import { evalCmd } from "../../shared.ts";
import type { RewriteFile } from "./types.ts";

const { values } = parseArgs({
  options: {
    corpus: { type: "string", default: join(homedir(), ".margin/eval-corpus/humanizer-pilot") },
    judge: { type: "boolean", default: false },
    "blind-picks": { type: "string" },
  },
});
const dir = values.corpus!;
const manifest: Manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
const heldout = manifest.docs.filter((d) => d.split === "heldout");
const outDir = join(dir, "outputs");

/** per-arm, per-draft metrics averaged over available runs (humanizer samples at T=1.0) */
interface DraftMetrics {
  hardFail: number;
  recall: number;
  lengthRatio: number;
  v1?: number;
  v2?: number;
  f2Problems?: number;
}
const metrics: Record<string, Record<string, DraftMetrics>> = {};

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function editDistance(a: string, b: string): number {
  const x = a.split(/\s+/), y = b.split(/\s+/);
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length] / Math.max(x.length, y.length, 1);
}

const files = existsSync(outDir) ? readdirSync(outDir).filter((f) => /^a[0-4]-run\d+\.json$/.test(f)) : [];
for (const arm of ARMS) {
  const runs = files.filter((f) => f.startsWith(`${arm}-`)).map((f) => JSON.parse(readFileSync(join(outDir, f), "utf-8")) as RewriteFile);
  if (runs.length === 0) continue;
  metrics[arm] = {};
  for (const doc of heldout) {
    const draft = readFileSync(join(dir, "drafts", `${doc.id}.txt`), "utf-8");
    const finalPath = join(dir, "finals", `${doc.id}.txt`);
    const final = existsSync(finalPath) ? readFileSync(finalPath, "utf-8") : null;
    const samples = runs.map((r) => r[doc.id]).filter((r) => r && r.text && !r.error);
    if (samples.length === 0) continue; // failed generations are excluded from the arm, and counted below
    const per = samples.map((s) => {
      const c = compareFacts(draft, s.text);
      const v1 = values.judge && arm !== "a0"
        ? (() => {
            const spans = doc.spans.map((sp) => ({ id: sp.id, text: sp.text, notes: sp.notes }));
            const verdicts = parseSpanVerdicts(runCmd(evalCmd(), spanJudgePrompt(spans, s.text), 180_000), spans.map((x) => x.id));
            return spans.filter((sp) => verdicts[sp.id] === "fixed").length / spans.length;
          })()
        : arm === "a0" ? 0 : undefined;
      const f2 = values.judge && arm !== "a0"
        ? (() => {
            const j = parseFactJudgement(runCmd(evalCmd(), factJudgePrompt(draft, s.text), 180_000));
            return j.dropped.length + j.altered.length + j.invented.length;
          })()
        : undefined;
      const v2 = final ? 1 - editDistance(s.text, final) / Math.max(editDistance(draft, final), 1e-9) : undefined;
      return { hardFail: c.hardFail ? 1 : 0, recall: c.recall, lengthRatio: words(s.text) / Math.max(words(draft), 1), v1, v2, f2 };
    });
    const opt = (k: "v1" | "v2" | "f2") => (per.every((p) => p[k] !== undefined) ? avg(per.map((p) => p[k] as number)) : undefined);
    metrics[arm][doc.id] = {
      hardFail: avg(per.map((p) => p.hardFail)),
      recall: avg(per.map((p) => p.recall)),
      lengthRatio: avg(per.map((p) => p.lengthRatio)),
      v1: opt("v1"),
      v2: opt("v2"),
      f2Problems: opt("f2"),
    };
  }
}

const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "n/a");
const lines: string[] = ["# Humanizer comparison: scored", "", `held-out drafts in manifest: ${heldout.length}`, ""];
lines.push("| arm | drafts scored | F1 hard-fail | F1 recall | length ratio | V1 recovery | V2 gap closed | F2 problems/draft |", "|---|---|---|---|---|---|---|---|");
for (const arm of ARMS) {
  const m = metrics[arm];
  if (!m) continue;
  const rows = Object.values(m);
  const mean = (k: keyof DraftMetrics) => {
    const xs = rows.map((r) => r[k]).filter((v): v is number => typeof v === "number");
    return xs.length ? avg(xs) : NaN;
  };
  lines.push(`| ${arm} ${ARM_LABELS[arm]} | ${rows.length} | ${pct(mean("hardFail"))} | ${pct(mean("recall"))} | ${mean("lengthRatio").toFixed(2)} | ${pct(mean("v1"))} | ${pct(mean("v2"))} | ${Number.isFinite(mean("f2Problems")) ? mean("f2Problems").toFixed(2) : "n/a"} |`);
}

function paired(a: Arm, b: Arm, key: keyof DraftMetrics): Interval | null {
  const ma = metrics[a], mb = metrics[b];
  if (!ma || !mb) return null;
  const diffs: number[] = [];
  for (const id of Object.keys(ma)) {
    const x = ma[id]?.[key], y = mb[id]?.[key];
    if (typeof x === "number" && typeof y === "number") diffs.push(x - y);
  }
  return diffs.length ? pairedBootstrap(diffs) : null;
}
const fmt = (i: Interval | null) => (i ? `${i.mean.toFixed(3)} [${i.lo.toFixed(3)}, ${i.hi.toFixed(3)}] n=${i.n}` : "n/a");

const v1 = paired("a3", "a2", "v1");
const rulesVsGeneric = paired("a3", "a1", "v1");
const factsAdv = paired("a2", "a3", "hardFail"); // positive = A3 safer
lines.push("", "## Paired comparisons (mean diff [95% bootstrap interval])", "");
lines.push(`- V1 A3 minus A2: ${fmt(v1)}`, `- V1 A3 minus A1 (gate G2): ${fmt(rulesVsGeneric)}`, `- F1 hard-fail, A2 minus A3 (positive = A3 safer): ${fmt(factsAdv)}`);

let v3: BlindScore | null = null;
if (values["blind-picks"]) {
  const keyPath = values["blind-picks"].replace(/\.md$/, ".key.json");
  const key = JSON.parse(readFileSync(keyPath, "utf-8")) as BlindKey;
  v3 = scoreBlindSheet(readFileSync(values["blind-picks"], "utf-8"), key, "a3");
  lines.push(`- V3 blind picks, A3 vs A2: A3 won ${v3.wins["a3"] ?? 0}, A2 won ${v3.wins["a2"] ?? 0}, ties ${v3.ties}, unanswered ${v3.unanswered.length}; A3 share ${pct(v3.firstArmShare)} (95% lower bound ${pct(v3.lowerBound95)}, two-sided p=${v3.pTwoSided.toFixed(3)})`);
}

const a3Rows = Object.values(metrics["a3"] ?? {});
const verdict = decide({
  nDrafts: a3Rows.length,
  v1,
  v3,
  factsAdvantage: factsAdv,
  rulesVsGeneric,
  a3HardFail: a3Rows.length ? avg(a3Rows.map((r) => r.hardFail)) : 1,
});
lines.push("", `## Verdict: ${verdict.outcome}${verdict.pilot ? " (PILOT: direction only, not a call)" : ""}`, "", ...verdict.reasons.map((r) => `- ${r}`));
if (!values.judge) lines.push("", "_V1 and F2 judges were not run (no --judge); V1-based comparisons are n/a._");

const failed = files.flatMap((f) => {
  const r = JSON.parse(readFileSync(join(outDir, f), "utf-8")) as RewriteFile;
  return Object.entries(r).filter(([, v]) => v.error || !v.text).map(([id]) => `${f}:${id}`);
});
if (failed.length) lines.push("", `Failed generations excluded from scoring: ${failed.length}`, ...failed.map((f) => `- ${f}`));

const report = lines.join("\n");
writeFileSync(join(dir, "report.md"), report);
console.log(report);
