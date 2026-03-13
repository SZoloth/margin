import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateTail } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as path from "node:path";

const CONFIG_FILE = "autoresearch.config.json";
const SESSION_FILE = "autoresearch.md";
const BENCHMARK_FILE = "autoresearch.sh";
const CHECKS_FILE = "autoresearch.checks.sh";
const IDEAS_FILE = "autoresearch.ideas.md";
const RESULTS_FILE = "autoresearch.jsonl";
const SAFE_BRANCH_PREFIX = "feat/autoresearch-";
const SUPPORT_FILES = [CONFIG_FILE, SESSION_FILE, BENCHMARK_FILE, CHECKS_FILE, IDEAS_FILE];
const FORBIDDEN_GIT_PATTERNS = [
  /\bgit\s+add\s+-A\b/,
  /\bgit\s+add\s+\.\b/,
  /\bgit\s+checkout\s+--\s+\.\b/,
  /\bgit\s+restore\s+--staged\s+--worktree\s+--source=HEAD\s+--\s+\.\b/,
  /\bgit\s+clean\s+-fd\b/,
];

type Direction = "lower" | "higher";
type ExperimentStatus = "keep" | "discard" | "crash" | "checks_failed";

interface AutoresearchConfig {
  name: string;
  objective: string;
  benchmarkCommand: string;
  primaryMetric: {
    name: string;
    unit: string;
    direction: Direction;
  };
  secondaryMetrics: string[];
  filesInScope: string[];
  offLimits: string[];
  constraints: string[];
  checksCommands: string[];
  createdAt: string;
  branch: string;
  repoRoot: string;
}

interface ExperimentResult {
  commit: string;
  metric: number;
  metrics: Record<string, number>;
  status: ExperimentStatus;
  description: string;
  timestamp: number;
  segment: number;
}

interface ExperimentState {
  name: string | null;
  metricName: string;
  metricUnit: string;
  bestDirection: Direction;
  bestMetric: number | null;
  currentSegment: number;
  results: ExperimentResult[];
}

interface RunDetails {
  command: string;
  durationSeconds: number;
  exitCode: number | null;
  passed: boolean;
  timedOut: boolean;
  tailOutput: string;
  reportedMetrics: Record<string, number>;
  checksPass: boolean | null;
  checksTimedOut: boolean;
  checksOutput: string;
  checksDuration: number;
}

interface LogDetails {
  experiment: ExperimentResult;
  state: ExperimentState;
}

const setupSessionParams = Type.Object({
  name: Type.String({ description: "Human-readable experiment name" }),
  objective: Type.String({ description: "Specific optimization goal and workload description" }),
  benchmark_command: Type.String({ description: `Shell command written to ${BENCHMARK_FILE}` }),
  primary_metric_name: Type.String({ description: "Name of the primary metric to optimize" }),
  primary_metric_unit: Type.Optional(Type.String({ description: "Metric unit such as ms, s, KB, or empty string" })),
  primary_metric_direction: Type.Optional(
    StringEnum(["lower", "higher"] as const, {
      description: "Whether lower or higher is better for the primary metric",
    })
  ),
  secondary_metrics: Type.Optional(
    Type.Array(Type.String({ description: "Additional metric name to monitor" }))
  ),
  files_in_scope: Type.Array(Type.String({ description: "Repo-relative file or directory path the loop may edit" })),
  off_limits: Type.Optional(
    Type.Array(Type.String({ description: "Repo-relative file or directory path the loop must not edit" }))
  ),
  constraints: Type.Optional(
    Type.Array(Type.String({ description: "Hard rule the loop must respect" }))
  ),
  checks_commands: Type.Optional(
    Type.Array(Type.String({ description: `One shell command per line written to ${CHECKS_FILE}` }))
  ),
});

const runExperimentParams = Type.Object({
  command: Type.Optional(Type.String({ description: `Optional override for ${BENCHMARK_FILE}` })),
  timeout_seconds: Type.Optional(Type.Number({ description: "Benchmark timeout in seconds (default 600)" })),
  checks_timeout_seconds: Type.Optional(Type.Number({ description: "Checks timeout in seconds (default 300)" })),
});

const logExperimentParams = Type.Object({
  metric: Type.Number({ description: "Primary metric value for this run" }),
  status: StringEnum(["keep", "discard", "crash", "checks_failed"] as const),
  description: Type.String({ description: "Short summary of what the run tried" }),
  metrics: Type.Optional(
    Type.Record(Type.String(), Type.Number(), {
      description: "Secondary metrics as { name: value }",
    })
  ),
  force: Type.Optional(
    Type.Boolean({ description: "Allow adding a new secondary metric not present in config" })
  ),
});

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
}

function isSafeRepoRelative(input: string): boolean {
  if (!input.trim()) return false;
  if (path.isAbsolute(input)) return false;
  const normalized = path.posix.normalize(input.replace(/\\/g, "/"));
  return normalized !== "." && !normalized.startsWith("../") && normalized !== "..";
}

function sanitizeTitle(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 68) || "update experiment";
}

function formatMetric(value: number | null, unit: string): string {
  if (value === null) return "—";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${formatted}${unit || ""}`;
}

function isBetter(current: number, baseline: number, direction: Direction): boolean {
  return direction === "lower" ? current < baseline : current > baseline;
}

function parseMetricLines(output: string): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const line of normalizeLineEndings(output).split("\n")) {
    const match = line.match(/^METRIC\s+([A-Za-z0-9._-]+)=([+-]?\d+(?:\.\d+)?)$/);
    if (!match) continue;
    metrics[match[1]] = Number(match[2]);
  }
  return metrics;
}

function currentResults(results: ExperimentResult[], segment: number): ExperimentResult[] {
  return results.filter((result) => result.segment === segment);
}

function loadState(cwd: string): ExperimentState {
  const state: ExperimentState = {
    name: null,
    metricName: "metric",
    metricUnit: "",
    bestDirection: "lower",
    bestMetric: null,
    currentSegment: 0,
    results: [],
  };

  const resultsPath = path.join(cwd, RESULTS_FILE);
  if (!fs.existsSync(resultsPath)) return state;

  const lines = normalizeLineEndings(fs.readFileSync(resultsPath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let segment = 0;
  let sawConfig = false;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.type === "config") {
        state.name = typeof parsed.name === "string" ? parsed.name : state.name;
        state.metricName = typeof parsed.metricName === "string" ? parsed.metricName : state.metricName;
        state.metricUnit = typeof parsed.metricUnit === "string" ? parsed.metricUnit : state.metricUnit;
        state.bestDirection = parsed.bestDirection === "higher" ? "higher" : "lower";
        if (sawConfig || state.results.length > 0) segment += 1;
        sawConfig = true;
        state.currentSegment = segment;
        continue;
      }
      if (parsed.type === "run") {
        state.results.push({
          commit: typeof parsed.commit === "string" ? parsed.commit : "",
          metric: typeof parsed.metric === "number" ? parsed.metric : 0,
          metrics: typeof parsed.metrics === "object" && parsed.metrics ? (parsed.metrics as Record<string, number>) : {},
          status:
            parsed.status === "discard" || parsed.status === "crash" || parsed.status === "checks_failed"
              ? parsed.status
              : "keep",
          description: typeof parsed.description === "string" ? parsed.description : "",
          timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
          segment: typeof parsed.segment === "number" ? parsed.segment : segment,
        });
      }
    } catch {
      // Ignore malformed lines.
    }
  }

  const current = currentResults(state.results, state.currentSegment);
  state.bestMetric = current.length > 0 ? current[0].metric : null;
  return state;
}

function readConfig(cwd: string): AutoresearchConfig | null {
  const configPath = path.join(cwd, CONFIG_FILE);
  if (!fs.existsSync(configPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as AutoresearchConfig;
  return parsed;
}

function renderSessionMarkdown(config: AutoresearchConfig): string {
  const secondary = config.secondaryMetrics.length > 0 ? config.secondaryMetrics.join(", ") : "none";
  const filesInScope = config.filesInScope.map((file) => `- ${file}`).join("\n");
  const offLimits =
    config.offLimits.length > 0 ? config.offLimits.map((file) => `- ${file}`).join("\n") : "- None specified";
  const constraints =
    config.constraints.length > 0
      ? config.constraints.map((constraint) => `- ${constraint}`).join("\n")
      : "- Keep experiments scoped to the declared files in scope.";

  return `# Autoresearch: ${config.name}

## Objective
${config.objective}

## Metrics
- **Primary**: ${config.primaryMetric.name} (${config.primaryMetric.unit || "unitless"}, ${config.primaryMetric.direction} is better)
- **Secondary**: ${secondary}

## How to Run
- Benchmark: \`./${BENCHMARK_FILE}\`
${config.checksCommands.length > 0 ? `- Backpressure checks: \`./${CHECKS_FILE}\`\n` : ""}- Results log: \`${RESULTS_FILE}\`

## Files in Scope
${filesInScope}

## Off Limits
${offLimits}

## Constraints
${constraints}

## What's Been Tried
- Baseline pending.
`;
}

function renderBenchmarkScript(command: string): string {
  return `#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

${command.trim()}
`;
}

function renderChecksScript(commands: string[]): string {
  return `#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

${commands.map((command) => command.trim()).join("\n")}
`;
}

async function git(pi: ExtensionAPI, cwd: string, ...args: string[]) {
  return pi.exec("git", args, { cwd, timeout: 15000 });
}

async function getRepoRoot(pi: ExtensionAPI, cwd: string): Promise<string | null> {
  const result = await git(pi, cwd, "rev-parse", "--show-toplevel");
  if (result.code !== 0) return null;
  return result.stdout.trim() || null;
}

async function getBranch(pi: ExtensionAPI, cwd: string): Promise<string> {
  const result = await git(pi, cwd, "branch", "--show-current");
  return result.stdout.trim();
}

async function getStatusLines(pi: ExtensionAPI, cwd: string): Promise<string[]> {
  const status = await git(pi, cwd, "status", "--short");
  if (status.code !== 0) return [];
  return status.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildSkillInvocation(args?: string): string {
  const trimmed = args?.trim();
  return trimmed ? `/skill:margin-autoresearch ${trimmed}` : "/skill:margin-autoresearch";
}

function extractAutoresearchArgs(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/")) return null;

  const directMatch = trimmed.match(/^autoresearch(?:\s+(?:on|for))?\s*(.*)$/i);
  if (directMatch) return directMatch[1].trim();

  const naturalMatch = trimmed.match(
    /^(?:hey\s+pi[,\s]*)?(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:(?:let'?s|lets|we should|we need to|i want to)\s+)?(?:run|start|begin|kick\s+off|do|set\s+up|setup)\s+autoresearch(?:\s+(?:on|for))?\s*(.*)$/i
  );
  if (naturalMatch) return naturalMatch[1].trim();

  return null;
}

function buildPiLaunchCommand(worktreePath: string, args?: string): string {
  return `cd ${shellQuote(worktreePath)} && pi ${shellQuote(buildSkillInvocation(args))}`;
}

async function writeWorktreeExclude(pi: ExtensionAPI, worktreePath: string) {
  const gitDirResult = await git(pi, worktreePath, "rev-parse", "--git-dir");
  const gitDir = gitDirResult.stdout.trim();
  if (!gitDir) return;

  const excludePath = path.join(gitDir, "info", "exclude");
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
  const additions = [RESULTS_FILE, IDEAS_FILE]
    .filter((entry) => !existing.split(/\r?\n/).includes(entry))
    .map((entry) => `${entry}\n`)
    .join("");
  if (additions) fs.appendFileSync(excludePath, additions);
}

async function createDedicatedWorktree(
  pi: ExtensionAPI,
  cwd: string,
  topic: string
): Promise<{ repoRoot: string; branch: string; baseRef: string; worktreePath: string } | { error: string }> {
  const repoRoot = await getRepoRoot(pi, cwd);
  if (!repoRoot) return { error: "Not inside a git repo." };

  const slug = slugify(topic);
  if (!slug) return { error: "Need a topic with letters or numbers." };

  const currentBranch = await getBranch(pi, repoRoot);
  const baseRefCheck = await git(pi, repoRoot, "rev-parse", "--verify", "origin/main");
  const fallbackBaseRef = baseRefCheck.code === 0 ? "origin/main" : "main";
  const baseRef = currentBranch || fallbackBaseRef;
  const branch = `${SAFE_BRANCH_PREFIX}${slug}`;
  const worktreePath = path.resolve(repoRoot, "..", `${path.basename(repoRoot)}-autoresearch-${slug}`);

  if (fs.existsSync(worktreePath)) {
    return { error: `Worktree path already exists: ${worktreePath}` };
  }

  const branchExists = await git(pi, repoRoot, "show-ref", "--verify", `refs/heads/${branch}`);
  if (branchExists.code === 0) {
    return { error: `Branch already exists: ${branch}` };
  }

  const result = await git(pi, repoRoot, "worktree", "add", "-b", branch, worktreePath, baseRef);
  if (result.code !== 0) {
    return { error: `git worktree add failed: ${(result.stderr || result.stdout).trim()}` };
  }

  await writeWorktreeExclude(pi, worktreePath);
  return { repoRoot, branch, baseRef, worktreePath };
}

async function launchAutoresearchTerminal(
  pi: ExtensionAPI,
  worktreePath: string,
  args?: string
): Promise<{ ok: boolean; launchCommand: string; error?: string }> {
  const launchCommand = buildPiLaunchCommand(worktreePath, args);
  const script = `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(launchCommand)}\nend tell`;
  const result = await pi.exec("osascript", ["-e", script], { timeout: 15000 });
  if (result.code !== 0) {
    return {
      ok: false,
      launchCommand,
      error: (result.stderr || result.stdout).trim() || "Failed to launch Terminal.",
    };
  }
  return { ok: true, launchCommand };
}

async function ensureDedicatedBranch(pi: ExtensionAPI, cwd: string): Promise<string | null> {
  const branch = await getBranch(pi, cwd);
  if (!branch.startsWith(SAFE_BRANCH_PREFIX)) {
    return `Autoresearch must run on a dedicated ${SAFE_BRANCH_PREFIX}* branch. Current branch: ${branch || "(detached)"}. Run /autoresearch-worktree first.`;
  }
  return null;
}

async function ensureCleanWorktree(pi: ExtensionAPI, cwd: string): Promise<string | null> {
  const statusLines = await getStatusLines(pi, cwd);
  if (statusLines.length > 0) {
    return `Autoresearch setup requires a clean worktree. Current status:\n${statusLines.join("\n")}`;
  }
  return null;
}

function appendResultsLine(cwd: string, payload: Record<string, unknown>) {
  fs.appendFileSync(path.join(cwd, RESULTS_FILE), `${JSON.stringify(payload)}\n`);
}

async function restoreScopedFiles(pi: ExtensionAPI, cwd: string, pathsInScope: string[]): Promise<{ restored: string[]; untracked: string[] }> {
  if (pathsInScope.length === 0) return { restored: [], untracked: [] };

  const diffAgainstHead = await git(pi, cwd, "diff", "--name-only", "HEAD", "--", ...pathsInScope);
  const restored = diffAgainstHead.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (restored.length > 0) {
    const restoreResult = await git(pi, cwd, "restore", "--staged", "--worktree", "--source=HEAD", "--", ...restored);
    if (restoreResult.code !== 0) {
      throw new Error((restoreResult.stderr || restoreResult.stdout).trim() || "Scoped restore failed.");
    }
  }

  const statusAfter = await git(pi, cwd, "status", "--short", "--", ...pathsInScope);
  const untracked = statusAfter.stdout
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  return { restored, untracked };
}

function updateWidget(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;
  const config = readConfig(ctx.cwd);
  if (!config) {
    ctx.ui.setWidget("margin-autoresearch", undefined);
    return;
  }

  const state = loadState(ctx.cwd);
  const current = currentResults(state.results, state.currentSegment);
  if (current.length === 0) {
    ctx.ui.setWidget("margin-autoresearch", [
      `🔬 autoresearch ready: ${config.name}`,
      `Branch ${config.branch} • baseline pending • scope: ${config.filesInScope.join(", ")}`,
    ]);
    return;
  }

  const kept = current.filter((result) => result.status === "keep").length;
  let best = state.bestMetric;
  for (const result of current) {
    if (result.status !== "keep") continue;
    if (best === null || isBetter(result.metric, best, state.bestDirection)) best = result.metric;
  }

  ctx.ui.setWidget("margin-autoresearch", [
    `🔬 ${config.name}: ${current.length} run${current.length === 1 ? "" : "s"} • ${kept} kept • best ${formatMetric(best, state.metricUnit)}`,
    `Scope: ${config.filesInScope.join(", ")}`,
  ]);
}

export default function marginAutoresearch(pi: ExtensionAPI) {
  let lastRunChecks: { pass: boolean; output: string; duration: number } | null = null;

  const refresh = (ctx: ExtensionContext) => updateWidget(ctx);

  pi.on("session_start", async (_event, ctx) => refresh(ctx));
  pi.on("session_switch", async (_event, ctx) => refresh(ctx));
  pi.on("session_fork", async (_event, ctx) => refresh(ctx));
  pi.on("session_tree", async (_event, ctx) => refresh(ctx));

  pi.on("before_agent_start", async (event, ctx) => {
    if (!readConfig(ctx.cwd) || !fs.existsSync(path.join(ctx.cwd, SESSION_FILE))) return;
    return {
      systemPrompt:
        `${event.systemPrompt}\n\n## Margin autoresearch mode\n` +
        `Read ${SESSION_FILE} at the start of each session and after compaction.\n` +
        `Use setup_autoresearch_session, init_experiment, run_experiment, and log_experiment.\n` +
        `Never use git add -A, git add ., git checkout -- ., or repo-wide clean/reset commands.\n` +
        `Autoresearch must stay inside the declared files in scope and on the dedicated ${SAFE_BRANCH_PREFIX}* branch.\n` +
        `log_experiment performs scoped staging for keep runs and scoped restore for non-keep runs.`,
    };
  });

  const runAutoresearchEntry = async (ctx: ExtensionContext, rawArgs?: string) => {
    const branch = await getBranch(pi, ctx.cwd);
    const trimmedArgs = rawArgs?.trim();

    if (branch.startsWith(SAFE_BRANCH_PREFIX)) {
      pi.sendUserMessage(buildSkillInvocation(trimmedArgs));
      if (ctx.hasUI) ctx.ui.notify("Queued margin-autoresearch in this dedicated worktree", "info");
      return;
    }

    const kickoff = trimmedArgs || (ctx.hasUI ? await ctx.ui.input("What should we optimize?", "search speed") : undefined);
    if (!kickoff) {
      if (ctx.hasUI) ctx.ui.notify(trimmedArgs ? "Need an optimization target" : "Cancelled", trimmedArgs ? "error" : "info");
      return;
    }

    const statusLines = await getStatusLines(pi, ctx.cwd);
    if (statusLines.length > 0) {
      if (!ctx.hasUI) {
        return;
      }
      const confirmedDirty = await ctx.ui.confirm(
        "Current worktree has uncommitted changes",
        `The new autoresearch worktree will start from committed HEAD only.\n\n${statusLines.join("\n")}`
      );
      if (!confirmedDirty) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }
    }

    const plan = await createDedicatedWorktree(pi, ctx.cwd, kickoff);
    if ("error" in plan) {
      if (ctx.hasUI) ctx.ui.notify(plan.error, "error");
      return;
    }

    if (!ctx.hasUI) {
      return;
    }

    const launch = await launchAutoresearchTerminal(pi, plan.worktreePath, kickoff);
    if (launch.ok) {
      ctx.ui.notify(`Created ${plan.branch}`, "info");
      ctx.ui.notify(`Launched pi in ${plan.worktreePath}`, "info");
      return;
    }

    ctx.ui.notify(`Created ${plan.branch}`, "info");
    ctx.ui.notify(`Automatic Terminal launch failed: ${launch.error}`, "warning");
    ctx.ui.notify(`Run manually: ${launch.launchCommand}`, "warning");
  };

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;
    const command = String((event.input as { command?: string }).command ?? "");
    if (FORBIDDEN_GIT_PATTERNS.some((pattern) => pattern.test(command))) {
      return {
        block: true,
        reason:
          "Blocked by Margin autoresearch safety rules. Use /autoresearch or the autoresearch tools instead of repo-wide git add/reset commands.",
      };
    }
  });

  pi.on("input", async (event, ctx) => {
    const args = extractAutoresearchArgs(event.text);
    if (args === null) return { action: "continue" };

    await runAutoresearchEntry(ctx, args);
    return { action: "handled" };
  });

  pi.registerCommand("autoresearch", {
    description: "Create a dedicated worktree and launch Margin autoresearch with minimal input",
    handler: async (args, ctx) => {
      await runAutoresearchEntry(ctx, args);
    },
  });

  pi.registerCommand("autoresearch-worktree", {
    description: "Create a dedicated Margin autoresearch worktree and branch",
    handler: async (args, ctx) => {
      const argTopic = args?.trim();
      const topic = argTopic || (ctx.hasUI ? await ctx.ui.input("Autoresearch topic", "search-speed") : undefined);
      if (!topic) {
        ctx.ui.notify(argTopic ? "Need a topic with letters or numbers" : "Cancelled", argTopic ? "error" : "info");
        return;
      }

      const plan = await createDedicatedWorktree(pi, ctx.cwd, topic);
      if ("error" in plan) {
        ctx.ui.notify(plan.error, "error");
        return;
      }

      ctx.ui.notify(`Created ${plan.branch}`, "info");
      ctx.ui.notify(`Next: cd ${plan.worktreePath} && pi`, "info");
      ctx.ui.notify(`Then run /skill:margin-autoresearch`, "info");
    },
  });

  pi.registerTool({
    name: "setup_autoresearch_session",
    label: "Setup Autoresearch Session",
    description:
      "Write Margin-specific autoresearch session files (config, markdown, benchmark script, optional checks script). Use once after clarifying the target and scope.",
    promptSnippet: "Scaffold autoresearch session files from structured inputs",
    promptGuidelines: [
      `Run /autoresearch-worktree first, then use this tool exactly once inside the dedicated ${SAFE_BRANCH_PREFIX}* worktree.`,
      `Only include repo-relative paths in files_in_scope and keep the list tight.`,
    ],
    parameters: setupSessionParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const branchError = await ensureDedicatedBranch(pi, ctx.cwd);
      if (branchError) {
        return { content: [{ type: "text", text: `❌ ${branchError}` }], details: {} };
      }

      const cleanError = await ensureCleanWorktree(pi, ctx.cwd);
      if (cleanError) {
        return { content: [{ type: "text", text: `❌ ${cleanError}` }], details: {} };
      }

      const repoRoot = await getRepoRoot(pi, ctx.cwd);
      if (!repoRoot) {
        return { content: [{ type: "text", text: "❌ Could not resolve repo root." }], details: {} };
      }

      const filesInScope = [...new Set(params.files_in_scope.map((entry) => entry.trim()))];
      if (filesInScope.length === 0) {
        return { content: [{ type: "text", text: "❌ files_in_scope cannot be empty." }], details: {} };
      }

      for (const entry of filesInScope) {
        if (!isSafeRepoRelative(entry)) {
          return { content: [{ type: "text", text: `❌ Unsafe scope path: ${entry}` }], details: {} };
        }
        if (!fs.existsSync(path.join(ctx.cwd, entry))) {
          return {
            content: [{ type: "text", text: `❌ Scope path does not exist in this worktree: ${entry}` }],
            details: {},
          };
        }
      }

      const offLimits = [...new Set((params.off_limits ?? []).map((entry) => entry.trim()).filter(Boolean))];
      for (const entry of offLimits) {
        if (!isSafeRepoRelative(entry)) {
          return { content: [{ type: "text", text: `❌ Unsafe off-limits path: ${entry}` }], details: {} };
        }
      }

      const config: AutoresearchConfig = {
        name: params.name.trim(),
        objective: params.objective.trim(),
        benchmarkCommand: params.benchmark_command.trim(),
        primaryMetric: {
          name: params.primary_metric_name.trim(),
          unit: params.primary_metric_unit?.trim() ?? "",
          direction: params.primary_metric_direction === "higher" ? "higher" : "lower",
        },
        secondaryMetrics: [...new Set((params.secondary_metrics ?? []).map((metric) => metric.trim()).filter(Boolean))],
        filesInScope,
        offLimits,
        constraints: [...new Set((params.constraints ?? []).map((constraint) => constraint.trim()).filter(Boolean))],
        checksCommands: (params.checks_commands ?? []).map((command) => command.trim()).filter(Boolean),
        createdAt: new Date().toISOString(),
        branch: await getBranch(pi, ctx.cwd),
        repoRoot,
      };

      fs.writeFileSync(path.join(ctx.cwd, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
      fs.writeFileSync(path.join(ctx.cwd, SESSION_FILE), renderSessionMarkdown(config));
      fs.writeFileSync(path.join(ctx.cwd, BENCHMARK_FILE), renderBenchmarkScript(config.benchmarkCommand));
      fs.chmodSync(path.join(ctx.cwd, BENCHMARK_FILE), 0o755);

      if (config.checksCommands.length > 0) {
        fs.writeFileSync(path.join(ctx.cwd, CHECKS_FILE), renderChecksScript(config.checksCommands));
        fs.chmodSync(path.join(ctx.cwd, CHECKS_FILE), 0o755);
      } else if (fs.existsSync(path.join(ctx.cwd, CHECKS_FILE))) {
        fs.rmSync(path.join(ctx.cwd, CHECKS_FILE));
      }

      refresh(ctx);
      return {
        content: [
          {
            type: "text",
            text:
              `✅ Wrote ${CONFIG_FILE}, ${SESSION_FILE}, and ${BENCHMARK_FILE}` +
              `${config.checksCommands.length > 0 ? ` plus ${CHECKS_FILE}` : ""}.\n` +
              `Scope: ${config.filesInScope.join(", ")}\n` +
              `Primary metric: ${config.primaryMetric.name} (${config.primaryMetric.unit || "unitless"}, ${config.primaryMetric.direction} is better)` ,
          },
        ],
        details: { config },
      };
    },
  });

  pi.registerTool({
    name: "init_experiment",
    label: "Init Experiment",
    description: `Read ${CONFIG_FILE} and initialize or re-initialize the current experiment segment in ${RESULTS_FILE}.`,
    promptSnippet: `Initialize ${RESULTS_FILE} from ${CONFIG_FILE}`,
    promptGuidelines: [
      `Call this once after setup_autoresearch_session writes ${CONFIG_FILE}.`,
      `If you later change the benchmark or metric in ${CONFIG_FILE}, call init_experiment again to start a new segment.`,
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const branchError = await ensureDedicatedBranch(pi, ctx.cwd);
      if (branchError) {
        return { content: [{ type: "text", text: `❌ ${branchError}` }], details: {} };
      }

      const config = readConfig(ctx.cwd);
      if (!config) {
        return { content: [{ type: "text", text: `❌ Missing ${CONFIG_FILE}. Run setup_autoresearch_session first.` }], details: {} };
      }

      const state = loadState(ctx.cwd);
      const activeSegmentRuns = currentResults(state.results, state.currentSegment).length;
      if (!fs.existsSync(path.join(ctx.cwd, RESULTS_FILE))) {
        fs.writeFileSync(path.join(ctx.cwd, RESULTS_FILE), "");
      }

      if (state.results.length === 0 || activeSegmentRuns > 0) {
        appendResultsLine(ctx.cwd, {
          type: "config",
          name: config.name,
          metricName: config.primaryMetric.name,
          metricUnit: config.primaryMetric.unit,
          bestDirection: config.primaryMetric.direction,
          timestamp: Date.now(),
        });
      }

      refresh(ctx);
      return {
        content: [
          {
            type: "text",
            text:
              `✅ Experiment ready: ${config.name}\n` +
              `Metric: ${config.primaryMetric.name} (${config.primaryMetric.unit || "unitless"}, ${config.primaryMetric.direction} is better)\n` +
              `Run the baseline next with run_experiment.`,
          },
        ],
        details: { state: loadState(ctx.cwd) },
      };
    },
  });

  pi.registerTool({
    name: "run_experiment",
    label: "Run Experiment",
    description: `Run ${BENCHMARK_FILE} or an override command, time wall-clock duration, and run optional checks from ${CHECKS_FILE}.`,
    promptSnippet: "Run the autoresearch benchmark and optional backpressure checks",
    promptGuidelines: [
      `Prefer calling run_experiment without arguments so it uses ${BENCHMARK_FILE}.`,
      `After every run_experiment call, follow with log_experiment.`,
    ],
    parameters: runExperimentParams,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const branchError = await ensureDedicatedBranch(pi, ctx.cwd);
      if (branchError) {
        return { content: [{ type: "text", text: `❌ ${branchError}` }], details: {} };
      }

      const config = readConfig(ctx.cwd);
      if (!config) {
        return { content: [{ type: "text", text: `❌ Missing ${CONFIG_FILE}.` }], details: {} };
      }

      const command = params.command?.trim() || `./${BENCHMARK_FILE}`;
      const timeout = (params.timeout_seconds ?? 600) * 1000;
      const benchmarkStartedAt = Date.now();
      const benchmark = await pi.exec("bash", ["-lc", command], { cwd: ctx.cwd, timeout, signal });
      const durationSeconds = (Date.now() - benchmarkStartedAt) / 1000;
      const fullOutput = normalizeLineEndings(`${benchmark.stdout}\n${benchmark.stderr}`.trim());
      const reportedMetrics = parseMetricLines(fullOutput);
      const benchmarkPassed = benchmark.code === 0 && !benchmark.killed;

      let checksPass: boolean | null = null;
      let checksTimedOut = false;
      let checksOutput = "";
      let checksDuration = 0;
      if (benchmarkPassed && fs.existsSync(path.join(ctx.cwd, CHECKS_FILE))) {
        const checksTimeout = (params.checks_timeout_seconds ?? 300) * 1000;
        const startedAt = Date.now();
        const checks = await pi.exec("bash", ["-lc", `./${CHECKS_FILE}`], { cwd: ctx.cwd, timeout: checksTimeout, signal });
        checksDuration = (Date.now() - startedAt) / 1000;
        checksPass = checks.code === 0 && !checks.killed;
        checksTimedOut = Boolean(checks.killed);
        checksOutput = normalizeLineEndings(`${checks.stdout}\n${checks.stderr}`.trim());
      }

      lastRunChecks =
        checksPass === null
          ? null
          : {
              pass: checksPass,
              output: checksOutput,
              duration: checksDuration,
            };

      const details: RunDetails = {
        command,
        durationSeconds,
        exitCode: benchmark.code,
        passed: benchmarkPassed && (checksPass === null || checksPass),
        timedOut: Boolean(benchmark.killed),
        tailOutput: fullOutput.split("\n").slice(-80).join("\n"),
        reportedMetrics,
        checksPass,
        checksTimedOut,
        checksOutput: checksOutput.split("\n").slice(-80).join("\n"),
        checksDuration,
      };

      let summary = benchmarkPassed
        ? `✅ Benchmark passed in ${durationSeconds.toFixed(2)}s`
        : benchmark.killed
          ? `⏰ Benchmark timed out after ${timeout / 1000}s`
          : `💥 Benchmark failed with exit code ${benchmark.code}`;
      if (Object.keys(reportedMetrics).length > 0) {
        summary += `\nReported metrics: ${Object.entries(reportedMetrics)
          .map(([name, value]) => `${name}=${value}`)
          .join(", ")}`;
      }
      if (checksPass === true) summary += `\n✅ Checks passed in ${checksDuration.toFixed(2)}s`;
      if (checksPass === false) summary += `\n💥 Checks failed in ${checksDuration.toFixed(2)}s — log this run as checks_failed.`;
      if (checksTimedOut) summary += `\n⏰ Checks timed out in ${checksDuration.toFixed(2)}s — log this run as checks_failed.`;

      const outputBlock = `\n\nLast 80 lines of benchmark output:\n${details.tailOutput || "(no output)"}`;
      const checksBlock = checksPass === false || checksTimedOut
        ? `\n\nLast 80 lines of checks output:\n${details.checksOutput || "(no output)"}`
        : "";
      const text = truncateTail(summary + outputBlock + checksBlock, { maxBytes: 35000, maxLines: 200 }).content;

      return {
        content: [{ type: "text", text }],
        details,
      };
    },
  });

  pi.registerTool({
    name: "log_experiment",
    label: "Log Experiment",
    description: `Record a run in ${RESULTS_FILE}. Keep runs stage only scoped files and support files. Non-keep runs restore only scoped tracked files.`,
    promptSnippet: "Log a run with safe scoped commit or scoped restore",
    promptGuidelines: [
      `Never use bash for git add/commit/revert during autoresearch. Use log_experiment instead.`,
      `Status keep stages only the declared files_in_scope plus ${SUPPORT_FILES.join(", ")}.`,
      `Statuses discard, crash, and checks_failed restore only tracked files inside files_in_scope.`,
    ],
    parameters: logExperimentParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const branchError = await ensureDedicatedBranch(pi, ctx.cwd);
      if (branchError) {
        return { content: [{ type: "text", text: `❌ ${branchError}` }], details: {} };
      }

      const config = readConfig(ctx.cwd);
      if (!config) {
        return { content: [{ type: "text", text: `❌ Missing ${CONFIG_FILE}.` }], details: {} };
      }

      if (params.status === "keep" && lastRunChecks && !lastRunChecks.pass) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Cannot keep this run because ${CHECKS_FILE} failed. Log it as checks_failed instead.\n\n${lastRunChecks.output.slice(-500)}`,
            },
          ],
          details: {},
        };
      }

      const secondaryMetrics = params.metrics ?? {};
      const expectedMetrics = new Set(config.secondaryMetrics);
      if (expectedMetrics.size > 0) {
        const missing = [...expectedMetrics].filter((metric) => !(metric in secondaryMetrics));
        if (missing.length > 0) {
          return {
            content: [{ type: "text", text: `❌ Missing secondary metrics: ${missing.join(", ")}` }],
            details: {},
          };
        }
      }

      const unexpected = Object.keys(secondaryMetrics).filter((metric) => !expectedMetrics.has(metric));
      if (unexpected.length > 0 && !params.force) {
        return {
          content: [
            {
              type: "text",
              text: `❌ New secondary metrics require force=true: ${unexpected.join(", ")}`,
            },
          ],
          details: {},
        };
      }

      const preCommitHead = await git(pi, ctx.cwd, "rev-parse", "--short=7", "HEAD");
      let commit = preCommitHead.stdout.trim();
      const stateBefore = loadState(ctx.cwd);
      const segment = stateBefore.currentSegment;

      if (params.status === "keep") {
        const stageTargets = [
          ...new Set([
            ...config.filesInScope,
            ...SUPPORT_FILES.filter((entry) => fs.existsSync(path.join(ctx.cwd, entry))),
          ]),
        ];
        const addResult = await git(pi, ctx.cwd, "add", "--", ...stageTargets);
        if (addResult.code !== 0) {
          return {
            content: [{ type: "text", text: `❌ Scoped git add failed:\n${(addResult.stderr || addResult.stdout).trim()}` }],
            details: {},
          };
        }

        const staged = await git(pi, ctx.cwd, "diff", "--cached", "--name-only", "--", ...stageTargets);
        const stagedFiles = staged.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
        if (stagedFiles.length > 0) {
          const title = `chore(autoresearch): ${sanitizeTitle(params.description)}`;
          const body = `Result: ${JSON.stringify({
            status: params.status,
            [config.primaryMetric.name]: params.metric,
            ...secondaryMetrics,
          })}`;
          const commitResult = await git(pi, ctx.cwd, "commit", "-m", title, "-m", body);
          if (commitResult.code !== 0) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `❌ Scoped auto-commit failed. Repo hooks likely rejected the commit.\n` +
                    `${(commitResult.stderr || commitResult.stdout).trim()}`,
                },
              ],
              details: {},
            };
          }
          const headAfterCommit = await git(pi, ctx.cwd, "rev-parse", "--short=7", "HEAD");
          commit = headAfterCommit.stdout.trim() || commit;
        }
      } else {
        let restoredSummary = "none";
        let untrackedSummary = "none";
        try {
          const restored = await restoreScopedFiles(pi, ctx.cwd, config.filesInScope);
          restoredSummary = restored.restored.length > 0 ? restored.restored.join(", ") : "none";
          untrackedSummary = restored.untracked.length > 0 ? restored.untracked.join(", ") : "none";
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Scoped restore failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            details: {},
          };
        }
        commit = preCommitHead.stdout.trim();

        appendResultsLine(ctx.cwd, {
          type: "run",
          commit,
          metric: params.metric,
          metrics: secondaryMetrics,
          status: params.status,
          description: params.description,
          timestamp: Date.now(),
          segment,
        });
        lastRunChecks = null;
        refresh(ctx);
        return {
          content: [
            {
              type: "text",
              text:
                `Logged ${params.status}.\nScoped restore: ${restoredSummary}.\nRemaining untracked files in scope: ${untrackedSummary}.`,
            },
          ],
          details: {
            experiment: {
              commit,
              metric: params.metric,
              metrics: secondaryMetrics,
              status: params.status,
              description: params.description,
              timestamp: Date.now(),
              segment,
            },
            state: loadState(ctx.cwd),
          } as LogDetails,
        };
      }

      const experiment: ExperimentResult = {
        commit,
        metric: params.metric,
        metrics: secondaryMetrics,
        status: params.status,
        description: params.description,
        timestamp: Date.now(),
        segment,
      };

      appendResultsLine(ctx.cwd, {
        type: "run",
        ...experiment,
      });
      lastRunChecks = null;
      refresh(ctx);
      const state = loadState(ctx.cwd);
      const baseline = state.bestMetric;
      const deltaText =
        baseline !== null && params.status === "keep" && params.metric !== baseline
          ? `\nBaseline ${config.primaryMetric.name}: ${formatMetric(baseline, config.primaryMetric.unit)}`
          : "";

      return {
        content: [
          {
            type: "text",
            text:
              `Logged keep run at ${formatMetric(params.metric, config.primaryMetric.unit)} on commit ${commit}.` +
              deltaText,
          },
        ],
        details: { experiment, state } as LogDetails,
      };
    },
  });
}
