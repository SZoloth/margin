import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsPage } from "../SettingsPage";
import { DEFAULT_SETTINGS } from "@/hooks/useSettings";
import { TestRunProvider } from "@/hooks/useTestRunContext";

const renderWithProvider = (ui: React.ReactElement) =>
  render(<TestRunProvider>{ui}</TestRunProvider>);

// Mock Tauri commands used by child components
vi.mock("@/lib/tauri-commands", () => ({
  getCorrectionsCount: vi.fn().mockResolvedValue(0),
  getAllCorrections: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/mcp-bridge", () => ({
  isMcpEnabledInClaude: vi.fn().mockResolvedValue(false),
  enableMcpInClaude: vi.fn().mockResolvedValue(undefined),
  disableMcpInClaude: vi.fn().mockResolvedValue(undefined),
  checkMcpConnection: vi.fn().mockResolvedValue(false),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe("SettingsPage", () => {
  const mockUpdater = {
    available: false,
    version: null,
    installing: false,
    checking: false,
    error: null,
    install: vi.fn(),
    dismiss: vi.fn(),
    recheck: vi.fn(),
  };

  const defaultProps = {
    settings: DEFAULT_SETTINGS,
    setSetting: vi.fn(),
    onClose: vi.fn(),
    updater: mockUpdater,
  };

  it("renders SettingsNav and content area", () => {
    renderWithProvider(<SettingsPage {...defaultProps} />);

    // Nav section links should be present (text may appear in both nav and section)
    expect(screen.getAllByText("Reading").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Integrations").length).toBeGreaterThanOrEqual(1);
  });

  it("default section is 'reading'", () => {
    renderWithProvider(<SettingsPage {...defaultProps} />);

    // Reading section content should be visible (theme control)
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
  });

  it("switching sections shows correct content", () => {
    renderWithProvider(<SettingsPage {...defaultProps} />);

    // fireEvent (sync) avoids async act() hang from TestRunProvider's listen()
    // resolved-Promise effects in React 19.
    fireEvent.click(screen.getByText("Help"));
    expect(screen.getByRole("heading", { level: 2, name: "Help" })).toBeInTheDocument();
  });

  it("keeps the notes toggle on the Reading page", () => {
    renderWithProvider(<SettingsPage {...defaultProps} />);
    expect(screen.getByText("Keep notes for rules")).toBeInTheDocument();
  });

  it("escape key closes settings", () => {
    const onClose = vi.fn();

    renderWithProvider(<SettingsPage {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(document.activeElement || document.body, {
      key: "Escape",
      code: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("titles each page with its section name", () => {
    renderWithProvider(<SettingsPage {...defaultProps} />);

    const heading = screen.getByRole("heading", { level: 2, name: "Reading" });
    expect(heading).toBeInTheDocument();
  });

  it("passes settings and setSetting to section components", () => {
    const setSetting = vi.fn();

    renderWithProvider(<SettingsPage {...defaultProps} setSetting={setSetting} />);

    // Click a theme option to verify setSetting is wired through.
    // Uses fireEvent (sync) instead of userEvent.click() to avoid the async act()
    // hang caused by TestRunProvider's listen() resolved-Promise effects in React 19.
    const radios = screen.getByRole("radiogroup", { name: "Theme" });
    const darkOption = radios.querySelector("[aria-checked='false']");
    if (darkOption) {
      fireEvent.click(darkOption as HTMLElement);
      expect(setSetting).toHaveBeenCalled();
    }
  });
});
