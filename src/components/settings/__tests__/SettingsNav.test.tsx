// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsNav, type Section } from "../SettingsNav";

describe("SettingsNav", () => {
  const defaultProps = {
    activeSection: "reading" as Section,
    onSelect: vi.fn<(section: Section) => void>(),
    onClose: vi.fn(),
  };

  it("renders 3 section links: Reading, Writing, Integrations", () => {
    render(<SettingsNav {...defaultProps} />);

    expect(screen.getByText("Reading")).toBeInTheDocument();
    expect(screen.getByText("Writing")).toBeInTheDocument();
    expect(screen.getByText("Integrations")).toBeInTheDocument();
  });

  it("highlights the active section", () => {
    render(<SettingsNav {...defaultProps} activeSection="writing" />);

    const writingItem = screen.getByText("Writing").closest("button");
    expect(writingItem).toHaveAttribute("aria-current", "true");

    const readingItem = screen.getByText("Reading").closest("button");
    expect(readingItem).not.toHaveAttribute("aria-current", "true");
  });

  it("calls onSelect when clicking a section", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<SettingsNav {...defaultProps} onSelect={onSelect} />);

    await user.click(screen.getByText("Writing"));
    expect(onSelect).toHaveBeenCalledWith("writing");
  });

  it("has a back button that calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<SettingsNav {...defaultProps} onClose={onClose} />);

    const backButton = screen.getByLabelText("Back to app");
    expect(backButton).toBeInTheDocument();

    await user.click(backButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("escape key calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<SettingsNav {...defaultProps} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
