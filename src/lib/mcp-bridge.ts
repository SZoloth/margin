import {
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
} from "@tauri-apps/plugin-fs";
import { dirname, homeDir, join, resourceDir } from "@tauri-apps/api/path";

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

/** How Claude should launch the server: Node on the repo's build in dev, the bundled binary in releases. */
async function getMcpServerCommand(): Promise<{ command: string; args: string[] }> {
  if (import.meta.env.DEV) {
    return { command: "node", args: [import.meta.env.VITE_MCP_SERVER_PATH ?? __MCP_DEV_PATH__] };
  }
  // externalBin sidecars sit in Contents/MacOS, next to the app binary.
  return { command: await join(await dirname(await resourceDir()), "MacOS", "margin-mcp"), args: [] };
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
  const server = await getMcpServerCommand();
  if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
    config.mcpServers = {};
  }
  config.mcpServers.margin = server;
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
