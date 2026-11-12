import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsNav, type Section } from "../SettingsNav";
import { TestRunProvider } from "@/hooks/useTestRunContext";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

const renderWithProvider = (ui: React.ReactElement) =>
  render(<TestRunProvider>{ui}</TestRunProvider>);

describe("SettingsNav", () => {
  const defaultProps = {
    activeSection: "reading" as Section,
    onSelect: vi.fn<(section: Section) => void>(),
    onClose: vi.fn(),
  };

  it("lists the sections a reader needs, without the internal test tool", () => {
    renderWithProvider(<SettingsNav {...defaultProps} />);

    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["←Settings", "Reading", "Writing rules", "Integrations", "Help", "About"]);
  });

  it("keeps Writing rules current while its rule tests are open", () => {
    renderWithProvider(<SettingsNav {...defaultProps} activeSection="dashboard" />);
    expect(screen.getByText("Writing rules").closest("button")).toHaveAttribute("aria-current", "true");
  });

  it("highlights the active section", () => {
    renderWithProvider(<SettingsNav {...defaultProps} activeSection="style-memory" />);

    const writingItem = screen.getByText("Writing rules").closest("button");
    expect(writingItem).toHaveAttribute("aria-current", "true");

    const readingItem = screen.getByText("Reading").closest("button");
    expect(readingItem).not.toHaveAttribute("aria-current", "true");
  });

  it("calls onSelect when clicking a section", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithProvider(<SettingsNav {...defaultProps} onSelect={onSelect} />);

    await user.click(screen.getByText("Writing rules"));
    expect(onSelect).toHaveBeenCalledWith("style-memory");
  });

  it("has a back button that calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProvider(<SettingsNav {...defaultProps} onClose={onClose} />);

    const backButton = screen.getByLabelText("Back to app");
    expect(backButton).toBeInTheDocument();

    await user.click(backButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("escape key calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProvider(<SettingsNav {...defaultProps} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
