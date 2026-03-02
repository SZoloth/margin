import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri plugins before importing the module under test
const mockReadTextFile = vi.fn();
const mockWriteTextFile = vi.fn();
const mockMkdir = vi.fn();
const mockExists = vi.fn();

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => mockReadTextFile(...args),
  writeTextFile: (...args: unknown[]) => mockWriteTextFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  exists: (...args: unknown[]) => mockExists(...args),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn().mockResolvedValue("/Users/test"),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
  resourceDir: vi.fn().mockResolvedValue("/Applications/Margin.app/Contents/Resources"),
}));

// Must import after mocks are set up
const {
  checkMcpConnection,
  enableMcpInClaude,
  disableMcpInClaude,
  isMcpEnabledInClaude,
} = await import("../mcp-bridge");

const CONFIG_PATH = "/Users/test/Library/Application Support/Claude/claude_desktop_config.json";

describe("checkMcpConnection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it("returns true when bridge responds 200", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    expect(await checkMcpConnection()).toBe(true);
  });

  it("returns false when bridge responds non-200", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    expect(await checkMcpConnection()).toBe(false);
  });

  it("returns false when fetch throws", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await checkMcpConnection()).toBe(false);
  });
});

describe("readClaudeConfig → enableMcpInClaude", () => {
  beforeEach(() => {
    mockReadTextFile.mockReset();
    mockWriteTextFile.mockReset().mockResolvedValue(undefined);
    mockMkdir.mockReset().mockResolvedValue(undefined);
    mockExists.mockReset();
  });

  it("creates config from scratch when file does not exist", async () => {
    mockExists.mockResolvedValue(false);

    await enableMcpInClaude();

    expect(mockWriteTextFile).toHaveBeenCalledOnce();
    const [path, content] = mockWriteTextFile.mock.calls[0]! as [string, string];
    expect(path).toBe(CONFIG_PATH);
    const written = JSON.parse(content);
    expect(written.mcpServers.margin).toBeDefined();
    expect(written.mcpServers.margin.command).toBe("node");
  });

  it("preserves existing config keys when adding margin", async () => {
    const existing = {
      theme: "dark",
      mcpServers: { other: { command: "python", args: ["server.py"] } },
    };
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue(JSON.stringify(existing));

    await enableMcpInClaude();

    const written = JSON.parse(mockWriteTextFile.mock.calls[0]![1]);
    expect(written.theme).toBe("dark");
    expect(written.mcpServers.other).toEqual({ command: "python", args: ["server.py"] });
    expect(written.mcpServers.margin).toBeDefined();
  });

  it("replaces mcpServers if it is not an object", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue(JSON.stringify({ mcpServers: "broken" }));

    await enableMcpInClaude();

    const written = JSON.parse(mockWriteTextFile.mock.calls[0]![1]);
    expect(written.mcpServers.margin).toBeDefined();
    // The broken string value should be replaced
    expect(typeof written.mcpServers).toBe("object");
  });

  it("replaces mcpServers if it is an array", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue(JSON.stringify({ mcpServers: [1, 2, 3] }));

    await enableMcpInClaude();

    const written = JSON.parse(mockWriteTextFile.mock.calls[0]![1]);
    expect(Array.isArray(written.mcpServers)).toBe(false);
    expect(written.mcpServers.margin).toBeDefined();
  });
});

describe("disableMcpInClaude", () => {
  beforeEach(() => {
    mockReadTextFile.mockReset();
    mockWriteTextFile.mockReset().mockResolvedValue(undefined);
    mockMkdir.mockReset().mockResolvedValue(undefined);
    mockExists.mockReset();
  });

  it("removes margin entry and preserves others", async () => {
    const existing = {
      mcpServers: {
        margin: { command: "node", args: ["index.js"] },
        other: { command: "python", args: ["server.py"] },
      },
    };
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue(JSON.stringify(existing));

    await disableMcpInClaude();

    const written = JSON.parse(mockWriteTextFile.mock.calls[0]![1]);
    expect(written.mcpServers.margin).toBeUndefined();
    expect(written.mcpServers.other).toEqual({ command: "python", args: ["server.py"] });
  });

  it("does not throw when mcpServers is missing", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue(JSON.stringify({ theme: "light" }));

    await expect(disableMcpInClaude()).resolves.not.toThrow();
  });

  it("skips mutation when mcpServers is not an object", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue(JSON.stringify({ mcpServers: "broken" }));

    await disableMcpInClaude();

    const written = JSON.parse(mockWriteTextFile.mock.calls[0]![1]);
    // Should preserve the broken value, not crash
    expect(written.mcpServers).toBe("broken");
  });
});

describe("isMcpEnabledInClaude", () => {
  beforeEach(() => {
    mockReadTextFile.mockReset();
    mockExists.mockReset();
  });

  it("returns true when margin entry exists", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({ mcpServers: { margin: { command: "node", args: [] } } }),
    );
    expect(await isMcpEnabledInClaude()).toBe(true);
  });

  it("returns false when margin entry is absent", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({ mcpServers: { other: {} } }),
    );
    expect(await isMcpEnabledInClaude()).toBe(false);
  });

  it("returns false when config file does not exist", async () => {
    mockExists.mockResolvedValue(false);
    expect(await isMcpEnabledInClaude()).toBe(false);
  });

  it("returns false on parse error instead of throwing", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue("not valid json {{{");
    expect(await isMcpEnabledInClaude()).toBe(false);
  });
});

describe("config safety — no clobber on errors", () => {
  beforeEach(() => {
    mockReadTextFile.mockReset();
    mockWriteTextFile.mockReset().mockResolvedValue(undefined);
    mockMkdir.mockReset().mockResolvedValue(undefined);
    mockExists.mockReset();
  });

  it("enableMcpInClaude throws on malformed JSON instead of clobbering", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue("not valid json");

    await expect(enableMcpInClaude()).rejects.toThrow();
    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });

  it("disableMcpInClaude throws on malformed JSON instead of clobbering", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockResolvedValue("{malformed");

    await expect(disableMcpInClaude()).rejects.toThrow();
    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });

  it("enableMcpInClaude throws on read permission error instead of clobbering", async () => {
    mockExists.mockResolvedValue(true);
    mockReadTextFile.mockRejectedValue(new Error("Permission denied"));

    await expect(enableMcpInClaude()).rejects.toThrow("Permission denied");
    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });
});
