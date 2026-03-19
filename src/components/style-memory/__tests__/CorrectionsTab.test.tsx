import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CorrectionsTab } from "../CorrectionsTab";
import type { CorrectionDetail } from "@/types/annotations";

vi.mock("@/lib/tauri-commands", () => ({
  getCorrectionsFlat: vi.fn(),
  updateCorrectionWritingType: vi.fn(),
  deleteCorrection: vi.fn(),
  acceptCorrection: vi.fn(),
  bulkDeleteCorrections: vi.fn(),
  bulkTagCorrections: vi.fn(),
  markCorrectionsUnsynthesized: vi.fn(),
}));

import {
  acceptCorrection,
  bulkDeleteCorrections,
  bulkTagCorrections,
  deleteCorrection,
  getCorrectionsFlat,
  markCorrectionsUnsynthesized,
  updateCorrectionWritingType,
} from "@/lib/tauri-commands";

function makeCorrection(overrides: Partial<CorrectionDetail> = {}): CorrectionDetail {
  return {
    highlightId: "h-2",
    originalText: "duplicate phrase",
    notes: ["Tighten this"],
    extendedContext: null,
    highlightColor: "yellow",
    writingType: "general",
    polarity: null,
    synthesizedAt: null,
    documentTitle: "Test Doc",
    createdAt: Date.now(),
    suggestedEdit: "specific phrase",
    acceptedAt: null,
    ...overrides,
  };
}

describe("CorrectionsTab accept flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCorrectionsFlat).mockResolvedValue([makeCorrection()]);
    vi.mocked(updateCorrectionWritingType).mockResolvedValue(undefined);
    vi.mocked(deleteCorrection).mockResolvedValue(undefined);
    vi.mocked(acceptCorrection).mockResolvedValue("specific phrase");
    vi.mocked(bulkDeleteCorrections).mockResolvedValue(0);
    vi.mocked(bulkTagCorrections).mockResolvedValue(0);
    vi.mocked(markCorrectionsUnsynthesized).mockResolvedValue(0);
  });

  it("does not persist acceptance when the editor-side apply step fails", async () => {
    const user = userEvent.setup();
    const onAcceptEdit = vi.fn().mockResolvedValue(false);

    render(
      <CorrectionsTab
        onStatsChange={() => {}}
        onAcceptEdit={
          onAcceptEdit as unknown as (
            highlightId: string,
            matchText: string,
            suggestedEdit: string,
          ) => Promise<boolean>
        }
      />,
    );

    const acceptButton = await screen.findByRole("button", { name: /Accept/ });
    await user.click(acceptButton);

    await waitFor(() => {
      expect(onAcceptEdit).toHaveBeenCalledWith(
        "h-2",
        "duplicate phrase",
        "specific phrase",
      );
    });

    expect(acceptCorrection).not.toHaveBeenCalled();
  });
});
