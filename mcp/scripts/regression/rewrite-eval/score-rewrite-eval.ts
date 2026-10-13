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
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
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

/**
 * Judge calls are slow and can return junk (refusals, rate-limit text). Cache parsed results by
 * prompt hash so a rerun resumes instead of repeating ~20 minutes of calls, and record unparseable
 * replies as failed judgements (raw reply goes to a private log in the corpus dir, never the report).
 */
const cachePath = join(dir, "judge-cache.json");
const failLog = join(dir, "judge-failures.log");
const cache: Record<string, unknown> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf-8")) : {};
let judgeFailures = 0;
function judged<T>(kind: string, prompt: string, parse: (raw: string) => T): T | undefined {
  const key = createHash("sha256").update(kind + "\0" + prompt).digest("hex");
  if (key in cache) return cache[key] as T;
  let raw = "";
  try {
    raw = runCmd(evalCmd(), prompt, 180_000);
    const out = parse(raw);
    cache[key] = out;
    writeFileSync(cachePath, JSON.stringify(cache));
    return out;
  } catch (e) {
    judgeFailures++;
    appendFileSync(failLog, `--- ${kind} ${new Date().toISOString()} ${(e as Error).message}\n${raw}\n`);
    return undefined;
  }
}

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
            const ids = spans.map((x) => x.id);
            const verdicts = judged("v1", spanJudgePrompt(spans, s.text), (raw) => parseSpanVerdicts(raw, ids));
            return verdicts ? spans.filter((sp) => verdicts[sp.id] === "fixed").length / spans.length : undefined;
          })()
        : arm === "a0" ? 0 : undefined;
      const f2 = values.judge && arm !== "a0"
        ? (() => {
            const j = judged("f2", factJudgePrompt(draft, s.text), parseFactJudgement);
            return j ? j.dropped.length + j.altered.length + j.invented.length : undefined;
          })()
        : undefined;
      const v2 = final ? 1 - editDistance(s.text, final) / Math.max(editDistance(draft, final), 1e-9) : undefined;
      return { hardFail: c.hardFail ? 1 : 0, recall: c.recall, lengthRatio: words(s.text) / Math.max(words(draft), 1), v1, v2, f2 };
    });
    const opt = (k: "v1" | "v2" | "f2") => {
      const xs = per.map((p) => p[k]).filter((v): v is number => v !== undefined);
      return xs.length ? avg(xs) : undefined; // failed judgements drop out of the average
    };
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

const docOf = new Map(manifest.docs.map((d) => [d.id, d.documentId ?? d.id]));

/** Paired differences averaged within each source document, then bootstrapped over documents. */
function paired(a: Arm, b: Arm, key: keyof DraftMetrics): Interval | null {
  const ma = metrics[a], mb = metrics[b];
  if (!ma || !mb) return null;
  const perDoc = new Map<string, number[]>();
  for (const id of Object.keys(ma)) {
    const x = ma[id]?.[key], y = mb[id]?.[key];
    if (typeof x === "number" && typeof y === "number") {
      const doc = docOf.get(id) ?? id;
      perDoc.set(doc, [...(perDoc.get(doc) ?? []), x - y]);
    }
  }
  const diffs = [...perDoc.values()].map(avg);
  return diffs.length ? pairedBootstrap(diffs) : null;
}
const fmt = (i: Interval | null) => (i ? `${i.mean.toFixed(3)} [${i.lo.toFixed(3)}, ${i.hi.toFixed(3)}] n=${i.n}` : "n/a");

const v1 = paired("a3", "a2", "v1");
const rulesVsGeneric = paired("a3", "a1", "v1");
const factsAdv = paired("a2", "a3", "hardFail"); // positive = A3 safer
lines.push("", "## Paired comparisons (mean diff [95% bootstrap interval]; n = source documents)", "");
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
  nDocs: new Set(Object.keys(metrics["a3"] ?? {}).map((id) => docOf.get(id) ?? id)).size,
  v1,
  v3,
  factsAdvantage: factsAdv,
  rulesVsGeneric,
  a3HardFail: a3Rows.length ? avg(a3Rows.map((r) => r.hardFail)) : 1,
});
lines.push("", `## Verdict: ${verdict.outcome}${verdict.pilot ? " (PILOT: direction only, not a call)" : ""}`, "", ...verdict.reasons.map((r) => `- ${r}`));
if (!values.judge) lines.push("", "_V1 and F2 judges were not run (no --judge); V1-based comparisons are n/a._");

if (judgeFailures) lines.push("", `Judge replies that could not be parsed (excluded from V1/F2 averages): ${judgeFailures}. Raw replies are in judge-failures.log in the corpus folder; rerun to retry them.`);

const failed = files.flatMap((f) => {
  const r = JSON.parse(readFileSync(join(outDir, f), "utf-8")) as RewriteFile;
  return Object.entries(r).filter(([, v]) => v.error || !v.text).map(([id]) => `${f}:${id}`);
});
if (failed.length) lines.push("", `Failed generations excluded from scoring: ${failed.length}`, ...failed.map((f) => `- ${f}`));

const report = lines.join("\n");
writeFileSync(join(dir, "report.md"), report);
console.log(report);
