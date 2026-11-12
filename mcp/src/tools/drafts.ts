import { execFile } from "child_process";
import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { VALID_WRITING_TYPES } from "./writing-rules.js";

// --- Data shape (see docs/draft-review.md) ---

export interface DraftChange {
  before: string;
  after: string;
}

export interface DraftReview {
  checked_at: number;
  words_draft: number;
  words_final: number;
  still_claude: number;
  kept_of_draft: number;
  changes: DraftChange[];
}

export interface DraftManifest {
  id: string;
  title: string;
  writing_type: string;
  created_at: number;
  review: DraftReview | null;
}

export interface DraftDeps {
  baseDir?: string;
  now?: () => number;
  opener?: (path: string) => Promise<boolean>;
}

export const DEFAULT_DRAFTS_DIR = join(homedir(), ".margin", "drafts");
const MAX_TEXT_BYTES = 200 * 1024;
const MAX_TOKENS = 4000;
const ID_PATTERN = /^[a-z0-9-]+$/;

function resolveDeps(deps: DraftDeps = {}) {
  return {
    baseDir: deps.baseDir ?? DEFAULT_DRAFTS_DIR,
    now: deps.now ?? Date.now,
    opener: deps.opener ?? defaultOpener,
  };
}

function defaultOpener(path: string): Promise<boolean> {
  if (process.platform !== "darwin") return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      execFile("open", ["-a", process.env.MARGIN_APP_NAME ?? "Margin", path], (err) => resolve(!err));
    } catch {
      resolve(false);
    }
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// --- Comparison ---

export interface Token {
  text: string;
  key: string;
}

const LIST_MARKER = /^([-+*]|\d+[.)])$/;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const line of text.split(/\r?\n/)) {
    const words = line.split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
      // Only at line start: a mid-sentence "-" or "3." is prose, not a list marker.
      if (i === 0 && LIST_MARKER.test(word)) return;
      // Typography turns quotes Sam types curly, so quote style can't count as an edit.
      const key = word
        .replace(/[*_#>`\\]/g, "")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .toLowerCase();
      if (key) tokens.push({ text: word, key });
    });
  }
  return tokens;
}

export interface DraftComparison {
  words_draft: number;
  words_final: number;
  still_claude: number;
  kept_of_draft: number;
  changes: DraftChange[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;

type Op = { kind: "eq"; i: number; j: number } | { kind: "del"; i: number } | { kind: "ins"; j: number };

export function compareDrafts(draft: string, final: string): DraftComparison | { error: string } {
  const a = tokenize(draft);
  const b = tokenize(final);
  const n = a.length;
  const m = b.length;
  if (n > MAX_TOKENS || m > MAX_TOKENS) {
    return { error: `Draft too long to compare (${n} and ${m} words; max ${MAX_TOKENS} each).` };
  }

  // dp[i][j] = LCS length of a[i:] and b[j:], so the walk below runs forward.
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i].key === b[j].key
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const lcs = dp[0];

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].key === b[j].key) {
      ops.push({ kind: "eq", i, j });
      i++;
      j++;
    } else if (j >= m || (i < n && dp[(i + 1) * w + j] >= dp[i * w + j + 1])) {
      ops.push({ kind: "del", i });
      i++;
    } else {
      ops.push({ kind: "ins", j });
      j++;
    }
  }

  // Runs of non-eq ops as [start, end) ranges into ops, merging across gaps of <=2 unchanged tokens.
  const runs: [number, number][] = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].kind === "eq") { k++; continue; }
    const start = k;
    while (k < ops.length && ops[k].kind !== "eq") k++;
    const prev = runs[runs.length - 1];
    if (prev && start - prev[1] <= 2) prev[1] = k;
    else runs.push([start, k]);
  }

  const changes = runs.map(([s, e]) => {
    const before: string[] = [];
    const after: string[] = [];
    for (const op of ops.slice(s, e)) {
      if (op.kind !== "ins") before.push(a[op.i].text);
      if (op.kind !== "del") after.push(b[op.j].text);
    }
    return { before: before.join(" "), after: after.join(" ") };
  });

  return {
    words_draft: n,
    words_final: m,
    still_claude: m === 0 ? (n === 0 ? 1 : 0) : round2(lcs / m),
    kept_of_draft: n === 0 ? 1 : round2(lcs / n),
    changes,
  };
}

// --- Files ---

function paths(baseDir: string, id: string) {
  return {
    draft: join(baseDir, `${id}.md`),
    original: join(baseDir, ".claude", `${id}.md`),
    manifest: join(baseDir, ".claude", `${id}.json`),
  };
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "draft";
}

function localDate(ms: number): string {
  const d = new Date(ms);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function validWritingType(t: string): boolean {
  return (VALID_WRITING_TYPES as readonly string[]).includes(t);
}

function invalidWritingType(t: string) {
  return { error: `Invalid writing_type "${t}". Allowed: ${VALID_WRITING_TYPES.join(", ")}` };
}

export interface CreateDraftReviewParams {
  text: string;
  writing_type: string;
  title: string;
}

export async function createDraftReview(
  params: CreateDraftReviewParams,
  deps?: DraftDeps,
): Promise<{ id: string; path: string; opened: boolean } | { error: string }> {
  const { baseDir, now, opener } = resolveDeps(deps);
  if (!validWritingType(params.writing_type)) return invalidWritingType(params.writing_type);
  if (!params.text.trim()) return { error: "Draft text is empty." };
  if (Buffer.byteLength(params.text, "utf8") > MAX_TEXT_BYTES) {
    return { error: `Draft text is over ${MAX_TEXT_BYTES / 1024} KB.` };
  }

  const createdAt = now();
  const prefix = `${localDate(createdAt)}-${slugify(params.title)}`;
  let id: string;
  do {
    id = `${prefix}-${randomBytes(2).toString("hex")}`;
  } while (existsSync(paths(baseDir, id).manifest));
  const p = paths(baseDir, id);

  const manifest: DraftManifest = {
    id,
    title: params.title,
    writing_type: params.writing_type,
    created_at: createdAt,
    review: null,
  };
  try {
    mkdirSync(join(baseDir, ".claude"), { recursive: true });
    writeFileSync(p.original, params.text);
    writeFileSync(p.manifest, JSON.stringify(manifest, null, 2));
    writeFileSync(p.draft, params.text);
  } catch (err) {
    return { error: `Could not write draft: ${errorMessage(err)}` };
  }

  const opened = await opener(p.draft).catch(() => false);
  return { id, path: p.draft, opened };
}

export type DraftReviewResult = DraftReview & {
  id: string;
  title: string;
  writing_type: string;
  final_text: string;
  unchanged: boolean;
};

export function getDraftReview(id: string, deps?: DraftDeps): DraftReviewResult | { error: string } {
  const { baseDir, now } = resolveDeps(deps);
  if (!ID_PATTERN.test(id)) return { error: `Invalid draft_id "${id}".` };
  const p = paths(baseDir, id);

  let finalText: string;
  let original: string;
  let manifest: DraftManifest;
  try {
    finalText = readFileSync(p.draft, "utf8");
    original = readFileSync(p.original, "utf8");
    manifest = JSON.parse(readFileSync(p.manifest, "utf8")) as DraftManifest;
  } catch (err) {
    return { error: `Draft "${id}" not found or unreadable: ${errorMessage(err)}` };
  }

  const comparison = compareDrafts(original, finalText);
  if ("error" in comparison) return comparison;

  const review: DraftReview = { checked_at: now(), ...comparison };
  try {
    writeFileSync(p.manifest, JSON.stringify({ ...manifest, review }, null, 2));
  } catch (err) {
    return { error: `Could not save review: ${errorMessage(err)}` };
  }

  return {
    id,
    title: manifest.title,
    writing_type: manifest.writing_type,
    final_text: finalText,
    unchanged: review.changes.length === 0,
    ...review,
  };
}

// --- Stats ---

export interface WritingTypeStats {
  writing_type: string;
  drafts: number;
  reviewed: number;
  median_still_claude: number | null;
  median_kept_of_draft: number | null;
  /** Median still_claude of the earlier vs later half of reviewed drafts; null below 4 reviewed. */
  trend: { earlier_median_still_claude: number; later_median_still_claude: number } | null;
}

export interface DraftReviewStats {
  by_type: WritingTypeStats[];
  unreviewed: string[];
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}

export function draftReviewStats(deps?: DraftDeps, writing_type?: string): DraftReviewStats | { error: string } {
  const { baseDir } = resolveDeps(deps);
  if (writing_type !== undefined && !validWritingType(writing_type)) return invalidWritingType(writing_type);

  const dir = join(baseDir, ".claude");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }

  const manifests: DraftManifest[] = [];
  for (const f of files) {
    try {
      const m = JSON.parse(readFileSync(join(dir, f), "utf8")) as DraftManifest;
      if (typeof m.id !== "string" || typeof m.writing_type !== "string" || typeof m.created_at !== "number") continue;
      if (writing_type && m.writing_type !== writing_type) continue;
      manifests.push(m);
    } catch {
      // Skip a half-written or hand-edited manifest rather than failing the whole report.
    }
  }
  manifests.sort((x, y) => x.created_at - y.created_at);

  const groups = new Map<string, DraftManifest[]>();
  for (const m of manifests) {
    const g = groups.get(m.writing_type) ?? [];
    g.push(m);
    groups.set(m.writing_type, g);
  }

  const by_type: WritingTypeStats[] = [...groups.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([type, ms]) => {
      const reviewed = ms.filter((m) => m.review).map((m) => m.review as DraftReview);
      let trend: WritingTypeStats["trend"] = null;
      if (reviewed.length >= 4) {
        // With an odd count the middle draft belongs to neither half.
        const half = Math.floor(reviewed.length / 2);
        trend = {
          earlier_median_still_claude: median(reviewed.slice(0, half).map((r) => r.still_claude)) as number,
          later_median_still_claude: median(reviewed.slice(-half).map((r) => r.still_claude)) as number,
        };
      }
      return {
        writing_type: type,
        drafts: ms.length,
        reviewed: reviewed.length,
        median_still_claude: median(reviewed.map((r) => r.still_claude)),
        median_kept_of_draft: median(reviewed.map((r) => r.kept_of_draft)),
        trend,
      };
    });

  return { by_type, unreviewed: manifests.filter((m) => !m.review).map((m) => m.id) };
}
