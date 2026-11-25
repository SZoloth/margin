import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ThinkingPackResult {
  workspace: string;
  query: string;
  hash: string;
  itemsCount: number;
  conflicts?: unknown;
  degraded?: unknown;
  text: string;
}

export interface CompileThinkingPackOptions {
  query: string;
  maxTokens?: number;
  workspace?: string;
  marginBin?: string;
}

export function resolveMarginBin(override?: string): string {
  if (override) return override;
  const local = path.join(os.homedir(), ".local", "bin", "margin");
  if (fs.existsSync(local)) return local;
  return "margin";
}

/**
 * Compile a deterministic, BLAKE3-hashed Thinking Pack from Margin's optional
 * Eidetic Engine sidecar (`margin eidetic pack`). Fails cleanly with an
 * actionable message when `margin` or `ee` is unavailable.
 */
export function compileThinkingPack(
  opts: CompileThinkingPackOptions,
  runner: typeof execFileSync = execFileSync,
): ThinkingPackResult | { error: string } {
  const query = opts.query.trim();
  if (!query) {
    return { error: "query must not be empty" };
  }
  const maxTokens =
    opts.maxTokens && Number.isFinite(opts.maxTokens) && opts.maxTokens > 0
      ? Math.min(Math.floor(opts.maxTokens), 8000)
      : 2000;

  const args = ["eidetic", "pack", query, "--max-tokens", String(maxTokens)];
  if (opts.workspace) {
    args.push("--workspace", opts.workspace);
  }

  try {
    const raw = runner(resolveMarginBin(opts.marginBin), args, {
      encoding: "utf8",
      timeout: 15000,
    });
    return JSON.parse(raw) as ThinkingPackResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: `margin eidetic pack unavailable: ${msg}`,
    };
  }
}
