// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";

vi.mock("@/lib/tauri-commands", () => ({
  exportCorrectionsJson: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

vi.mock("@/components/style-memory/CorrectionsTab", () => ({
  CorrectionsTab: ({ onStatsChange }: {
    onStatsChange: (stats: { total: number; documentCount: number; untaggedCount: number; unsynthesizedCount: number }) => void;
  }) => {
    useEffect(() => {
      onStatsChange({
        total: 3,
        documentCount: 1,
        untaggedCount: 0,
        unsynthesizedCount: 3,
      });
    }, [onStatsChange]);
    return <div>CorrectionsTab</div>;
  },
}));

vi.mock("@/components/style-memory/RulesTab", () => ({
  RulesTab: ({ onStatsChange }: { onStatsChange: (stats: { ruleCount: number; unreviewedCount: number }) => void }) => {
    useEffect(() => {
      onStatsChange({ ruleCount: 0, unreviewedCount: 0 });
    }, [onStatsChange]);
    return <div>RulesTab</div>;
  },
}));

import { StyleMemorySection } from "../StyleMemorySection";
import { exportCorrectionsJson } from "@/lib/tauri-commands";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

describe("StyleMemorySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides export CTA after successful synthesis export of all pending corrections", async () => {
    vi.mocked(exportCorrectionsJson).mockResolvedValue(3);
    vi.mocked(writeText).mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<StyleMemorySection />);

    const exportButton = await screen.findByRole("button", { name: "Export 3 for synthesis" });
    await user.click(exportButton);

    await waitFor(() => {
      expect(exportCorrectionsJson).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Export .* for synthesis/ })).not.toBeInTheDocument();
    });
  });
});

