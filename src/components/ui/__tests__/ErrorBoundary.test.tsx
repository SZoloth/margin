import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

const logFrontendError = vi.fn().mockResolvedValue(undefined);
const getDiagnostics = vi.fn().mockResolvedValue("Margin diagnostics\nVersion: 1.17.1");
const revealLogsDir = vi.fn().mockResolvedValue(undefined);
const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/tauri-commands", () => ({
  logFrontendError: (...a: unknown[]) => logFrontendError(...a),
  getDiagnostics: () => getDiagnostics(),
  revealLogsDir: () => revealLogsDir(),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (t: string) => writeText(t),
}));

function Bomb(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // React logs caught render errors; keep test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders children when nothing throws", () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("shows a recovery screen and writes the error to the log", () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("Margin hit a problem");
    expect(screen.getByRole("button", { name: "Reload Margin" })).toHaveFocus();
    expect(logFrontendError).toHaveBeenCalledWith(
      "react-error-boundary",
      "Error: kaboom",
      expect.any(String),
    );
  });

  it("copies the diagnostics report to the clipboard", async () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "Copy diagnostics" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Margin diagnostics\nVersion: 1.17.1"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("opens the logs folder", () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    fireEvent.click(screen.getByRole("button", { name: "Show logs" }));
    expect(revealLogsDir).toHaveBeenCalled();
  });
});
