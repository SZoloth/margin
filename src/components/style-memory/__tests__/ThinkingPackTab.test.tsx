import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThinkingPackTab } from "../ThinkingPackTab";

const compileMock = vi.fn();
const syncMock = vi.fn();
const writeTextMock = vi.fn();

vi.mock("@/lib/tauri-commands", () => ({
  compileThinkingPack: (...args: unknown[]) => compileMock(...args),
  syncEideticMemory: (...args: unknown[]) => syncMock(...args),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextMock(...args),
}));

describe("ThinkingPackTab", () => {
  beforeEach(() => {
    compileMock.mockReset();
    syncMock.mockReset();
    writeTextMock.mockReset();
  });

  it("compiles a Thinking Pack and renders hash, item count, conflicts, and copy button", async () => {
    compileMock.mockResolvedValue({
      workspace: "/tmp/eidetic",
      query: "cover letter",
      hash: "blake3:1234567890abcdef1234",
      itemsCount: 7,
      conflicts: [{ kind: "partial_overlap" }],
      text: "# Context Pack: cover letter\n\nRule 1",
    });
    writeTextMock.mockResolvedValue(undefined);

    render(<ThinkingPackTab />);
    const input = screen.getByLabelText("Topic or writing task");
    fireEvent.change(input, { target: { value: "cover letter" } });
    fireEvent.click(screen.getByRole("button", { name: "Compile pack" }));

    await waitFor(() => {
      expect(screen.getByText(/blake3:1234567890ab/)).toBeInTheDocument();
    });
    expect(screen.getByText("7 items")).toBeInTheDocument();
    expect(screen.getByText("1 conflict flagged")).toBeInTheDocument();
    expect(screen.getByText(/# Context Pack: cover letter/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy pack" }));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("# Context Pack: cover letter\n\nRule 1");
    });
  });

  it("syncs the Margin library and displays counts", async () => {
    syncMock.mockResolvedValue({
      workspace: "/tmp/eidetic",
      rulesPrepared: 408,
      highlightsPrepared: 106,
      correctionsPrepared: 218,
      stored: 732,
      failed: 0,
      memoriesIndexed: 732,
    });

    render(<ThinkingPackTab />);
    fireEvent.click(screen.getByRole("button", { name: "Sync library" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Synced 732 memories");
    });
  });

  it("surfaces errors cleanly when ee is unavailable", async () => {
    compileMock.mockRejectedValue(new Error("eidetic-engine (`ee`) binary not found"));

    render(<ThinkingPackTab />);
    fireEvent.change(screen.getByLabelText("Topic or writing task"), {
      target: { value: "margin voice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Compile pack" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("binary not found");
    });
  });
});
