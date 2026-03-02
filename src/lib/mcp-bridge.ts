import {
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
} from "@tauri-apps/plugin-fs";
import { homeDir, join, resourceDir } from "@tauri-apps/api/path";

const BRIDGE_URL = "http://127.0.0.1:24784";
const STATUS_TIMEOUT_MS = 1500;

// ── Connection check ─────────────────────────────────────

export async function checkMcpConnection(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
    const res = await fetch(`${BRIDGE_URL}/status`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ── Claude Desktop config management ─────────────────────

async function getConfigPath(): Promise<string> {
  const home = await homeDir();
  return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
}

declare const __MCP_DEV_PATH__: string;

async function getMcpServerPath(): Promise<string> {
  if (import.meta.env.DEV) {
    return import.meta.env.VITE_MCP_SERVER_PATH ?? __MCP_DEV_PATH__;
  }
  const res = await resourceDir();
  return join(res, "mcp", "dist", "index.js");
}

interface ClaudeConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

async function readClaudeConfig(): Promise<ClaudeConfig> {
  const path = await getConfigPath();

  // File doesn't exist yet — treat as empty config
  if (!(await exists(path))) return {};

  // File exists — parse errors should propagate (don't clobber on bad JSON)
  const text = await readTextFile(path);
  const parsed = JSON.parse(text);
  if (typeof parsed === "object" && parsed !== null) return parsed as ClaudeConfig;
  return {};
}

async function writeClaudeConfig(config: ClaudeConfig): Promise<void> {
  const path = await getConfigPath();
  const dir = path.replace(/\/[^/]+$/, "");
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  await writeTextFile(path, JSON.stringify(config, null, 2) + "\n");
}

export async function enableMcpInClaude(): Promise<void> {
  const config = await readClaudeConfig();
  const serverPath = await getMcpServerPath();
  if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
    config.mcpServers = {};
  }
  config.mcpServers.margin = {
    command: "node",
    args: [serverPath],
  };
  await writeClaudeConfig(config);
}

export async function disableMcpInClaude(): Promise<void> {
  const config = await readClaudeConfig();
  if (config.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers)) {
    delete config.mcpServers.margin;
  }
  await writeClaudeConfig(config);
}

export async function isMcpEnabledInClaude(): Promise<boolean> {
  try {
    const config = await readClaudeConfig();
    return !!config.mcpServers && "margin" in config.mcpServers;
  } catch {
    return false;
  }
}
