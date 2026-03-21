import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WritingSection } from "../WritingSection";
import { DEFAULT_SETTINGS } from "@/hooks/useSettings";

describe("WritingSection", () => {
  const defaultProps = {
    settings: DEFAULT_SETTINGS,
    setSetting: vi.fn(),
  };

  it("renders persist corrections toggle", () => {
    render(<WritingSection {...defaultProps} />);

    expect(screen.getByText("Remember corrections")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("calls setSetting for persistCorrections toggle", async () => {
    const setSetting = vi.fn();
    const user = userEvent.setup();

    render(<WritingSection {...defaultProps} setSetting={setSetting} />);

    await user.click(screen.getByRole("switch"));
    expect(setSetting).toHaveBeenCalledWith("persistCorrections", true);
  });
});
