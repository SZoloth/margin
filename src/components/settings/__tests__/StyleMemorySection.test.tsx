import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub child components so they don't pull @/lib/tauri-commands into the shared vmThreads
// module registry. With maxWorkers:1 all files share one registry; if CorrectionsTab/RulesTab
// are imported here with their real tauri-commands references, those cached instances
// contaminate CorrectionsTab.test and RulesTab.test (or vice-versa) when they run later.
vi.mock("@/components/style-memory/CorrectionsTab", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require("react") as typeof import("react");
  return {
    CorrectionsTab: ({
      onStatsChange,
    }: {
      onStatsChange: (s: {
        total: number;
        documentCount: number;
        untaggedCount: number;
        unsynthesizedCount: number;
      }) => void;
    }) => {
      useEffect(() => {
        onStatsChange({ total: 3, documentCount: 1, untaggedCount: 0, unsynthesizedCount: 3 });
      }, [onStatsChange]);
      return null;
    },
  };
});

vi.mock("@/components/style-memory/RulesTab", () => ({
  RulesTab: () => null,
  countRules: () => ({ inEffect: 0, suggested: 0 }),
}));

vi.mock("@/lib/tauri-commands", () => ({
  exportCorrectionsJson: vi.fn(),
  markCorrectionsUnsynthesized: vi.fn(),
  seedRulesFromGuide: vi.fn(),
  openStyleGuideDialog: vi.fn(),
  getWritingRules: vi.fn().mockResolvedValue([]),
  getCorrectionsFlat: vi.fn().mockResolvedValue([
    { highlightId: "h1", notes: ["n"], synthesizedAt: null, category: null },
    { highlightId: "h2", notes: ["n"], synthesizedAt: null, category: null },
    { highlightId: "h3", notes: ["n"], synthesizedAt: null, category: null },
  ]),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

import { StyleMemorySection } from "../StyleMemorySection";
import { exportCorrectionsJson } from "@/lib/tauri-commands";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

describe("StyleMemorySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens on Notes when notes are waiting, and lays the stages out in order", async () => {
    render(<StyleMemorySection />);
    const notes = await screen.findByRole("tab", { name: /Your notes/ });
    await waitFor(() => expect(notes).toHaveAttribute("aria-selected", "true"));
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.replace(/[\d→]/g, "").trim())).toEqual([
      "Your notes",
      "Suggested rules",
      "Rules in use",
    ]);
  });

  it("hides the copy-prompt call to action once every waiting note is sent", async () => {
    // This test runs ~9s in isolation (handleExportForSynthesis sets window.setTimeout(6000) for
    // a toast, and React 19's act() drains pending work before resolving). Under system load
    // (multiple background agent processes) the test has been observed to exceed the 30s global
    // testTimeout. Explicit timeout gives headroom without masking real regressions.
    vi.mocked(exportCorrectionsJson).mockResolvedValue({ count: 3, highlightIds: ["h1", "h2", "h3"] });
    vi.mocked(writeText).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<StyleMemorySection />);

    const exportButton = await screen.findByRole("button", { name: "Copy prompt for Claude" }, { timeout: 5000 });
    await user.click(exportButton);

    await waitFor(() => {
      expect(exportCorrectionsJson).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Copy prompt for Claude" })).not.toBeInTheDocument();
    });
  }, 60000);
});
