import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AboutSection } from "../AboutSection";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("1.17.1") }));

const getBackupStatus = vi.fn();
const revealBackupsDir = vi.fn().mockResolvedValue(undefined);
const revealLogsDir = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/tauri-commands", () => ({
  getBackupStatus: () => getBackupStatus(),
  revealBackupsDir: () => revealBackupsDir(),
  revealLogsDir: () => revealLogsDir(),
  getDiagnostics: vi.fn().mockResolvedValue("report text"),
  logFrontendError: vi.fn(),
}));
const writeText = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: (t: string) => writeText(t) }));

const updater = {
  checking: false, installing: false, available: false, version: null, error: null,
  recheck: vi.fn(), install: vi.fn(),
} as unknown as Parameters<typeof AboutSection>[0]["updater"];

describe("AboutSection data and diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBackupStatus.mockResolvedValue({
      count: 3,
      latest: { name: "margin-20261012-205213-daily.db", kind: "daily", size_bytes: 1000 },
    });
  });

  it("shows when the latest backup was taken", async () => {
    render(<AboutSection updater={updater} />);
    expect(await screen.findByText(/Latest .*Oct/)).toBeInTheDocument();
  });

  it("says plainly when no backup exists yet", async () => {
    getBackupStatus.mockResolvedValue({ count: 0, latest: null });
    render(<AboutSection updater={updater} />);
    expect(await screen.findByText(/None yet/)).toBeInTheDocument();
  });

  it("reveals the backups and logs folders", async () => {
    render(<AboutSection updater={updater} />);
    await screen.findByText(/Latest/);
    fireEvent.click(screen.getByText("Show in Finder"));
    fireEvent.click(screen.getByText("Show logs"));
    expect(revealBackupsDir).toHaveBeenCalled();
    expect(revealLogsDir).toHaveBeenCalled();
  });

  it("copies the diagnostics report", async () => {
    render(<AboutSection updater={updater} />);
    fireEvent.click(screen.getByText("Copy diagnostics"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("report text"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
