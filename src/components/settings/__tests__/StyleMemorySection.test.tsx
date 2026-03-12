import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CorrectionDetail } from "@/types/annotations";

// Provide all functions that CorrectionsTab, RulesTab, and StyleMemorySection need.
// Component-level vi.mock() hoisting is unreliable with vmForks pool so we mock the
// underlying tauri-commands instead and let the real child components render.
vi.mock("@/lib/tauri-commands", () => ({
  getCorrectionsFlat: vi.fn(),
  updateCorrectionWritingType: vi.fn(),
  deleteCorrection: vi.fn(),
  bulkDeleteCorrections: vi.fn(),
  bulkTagCorrections: vi.fn(),
  markCorrectionsUnsynthesized: vi.fn(),
  getWritingRules: vi.fn(),
  updateWritingRule: vi.fn(),
  deleteWritingRule: vi.fn(),
  exportWritingRules: vi.fn(),
  markRulesReviewed: vi.fn(),
  exportCorrectionsJson: vi.fn(),
  seedRulesFromGuide: vi.fn(),
  openStyleGuideDialog: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

import { StyleMemorySection } from "../StyleMemorySection";
import {
  getCorrectionsFlat,
  getWritingRules,
  exportCorrectionsJson,
} from "@/lib/tauri-commands";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

const makeCorrection = (id: string): CorrectionDetail => ({
  highlightId: id,
  originalText: `text ${id}`,
  notes: [],
  extendedContext: null,
  highlightColor: "yellow",
  writingType: null,
  polarity: null,
  synthesizedAt: null,
  documentTitle: null,
  createdAt: Date.now(),
});

describe("StyleMemorySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCorrectionsFlat).mockResolvedValue([
      makeCorrection("h1"),
      makeCorrection("h2"),
      makeCorrection("h3"),
    ]);
    vi.mocked(getWritingRules).mockResolvedValue([]);
  });

  it("hides export CTA after successful synthesis export of all pending corrections", async () => {
    vi.mocked(exportCorrectionsJson).mockResolvedValue({ count: 3, highlightIds: ["h1", "h2", "h3"] });
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
