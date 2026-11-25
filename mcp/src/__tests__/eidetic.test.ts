import { describe, expect, it } from "vitest";
import { compileThinkingPack } from "../tools/eidetic.js";

describe("compileThinkingPack", () => {
  it("rejects empty queries without invoking the CLI", () => {
    let called = false;
    const res = compileThinkingPack(
      { query: "   " },
      (() => {
        called = true;
        return "";
      }) as never,
    );
    expect(called).toBe(false);
    expect("error" in res).toBe(true);
  });

  it("parses a valid Thinking Pack response and clamps maxTokens", () => {
    let capturedArgs: readonly string[] = [];
    const mockRunner = ((_bin: string, args: readonly string[]) => {
      capturedArgs = args;
      return JSON.stringify({
        workspace: "/tmp/eidetic",
        query: "cover letter positioning",
        hash: "blake3:abc123",
        itemsCount: 4,
        text: "# Context Pack",
      });
    }) as never;

    const res = compileThinkingPack(
      { query: "cover letter positioning", maxTokens: 99999, workspace: "/tmp/eidetic" },
      mockRunner,
    );
    expect("error" in res).toBe(false);
    if (!("error" in res)) {
      expect(res.hash).toBe("blake3:abc123");
      expect(res.itemsCount).toBe(4);
    }
    expect(capturedArgs).toEqual([
      "eidetic",
      "pack",
      "cover letter positioning",
      "--max-tokens",
      "8000",
      "--workspace",
      "/tmp/eidetic",
    ]);
  });

  it("fails open with an actionable error when the CLI fails", () => {
    const failingRunner = (() => {
      throw new Error("ee binary not found");
    }) as never;
    const res = compileThinkingPack({ query: "margin voice" }, failingRunner);
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect(res.error).toContain("ee binary not found");
    }
  });
});
