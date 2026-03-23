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
}));

vi.mock("@/lib/tauri-commands", () => ({
  exportCorrectionsJson: vi.fn(),
  markCorrectionsUnsynthesized: vi.fn(),
  seedRulesFromGuide: vi.fn(),
  openStyleGuideDialog: vi.fn(),
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

  it("hides export CTA after successful synthesis export of all pending corrections", async () => {
    vi.mocked(exportCorrectionsJson).mockResolvedValue({ count: 3, highlightIds: ["h1", "h2", "h3"] });
    vi.mocked(writeText).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<StyleMemorySection />);

    const exportButton = await screen.findByRole("button", { name: "Synthesize 3 pending" }, { timeout: 5000 });
    await user.click(exportButton);

    await waitFor(() => {
      expect(exportCorrectionsJson).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Synthesize .* pending/ })).not.toBeInTheDocument();
    });
  });
});
