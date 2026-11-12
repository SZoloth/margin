import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IntegrationsSection } from "../IntegrationsSection";

vi.mock("@/lib/mcp-bridge", () => ({
  isMcpEnabledInClaude: vi.fn().mockResolvedValue(false),
  enableMcpInClaude: vi.fn().mockResolvedValue(undefined),
  disableMcpInClaude: vi.fn().mockResolvedValue(undefined),
  checkMcpConnection: vi.fn().mockResolvedValue(false),
}));

const setAgentIntegration = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/tauri-commands", () => ({
  getAgentIntegration: vi.fn().mockResolvedValue(false),
  setAgentIntegration: (enabled: boolean) => setAgentIntegration(enabled),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

describe("IntegrationsSection", () => {
  it("renders Claude Desktop toggle", async () => {
    render(<IntegrationsSection />);

    // Wait for async loading to complete
    expect(await screen.findByText("Claude Desktop")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Claude Desktop" })).toBeInTheDocument();
  });

  it("renders Claude Code section with copy button", async () => {
    render(<IntegrationsSection />);

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Copy config")).toBeInTheDocument();
  });

  it("code snippet is hidden by default behind disclosure", async () => {
    render(<IntegrationsSection />);

    // Wait for loading
    await screen.findByText("Claude Code");

    // The JSON snippet should not be visible by default
    expect(screen.queryByText(/"mcpServers"/)).not.toBeInTheDocument();

    // Click disclosure to reveal it
    const showButton = screen.getByText("Show config");
    fireEvent.click(showButton);

    expect(screen.getByText(/"mcpServers"/)).toBeInTheDocument();
  });

  it("writing guard is off until the user turns it on", async () => {
    render(<IntegrationsSection />);

    const guard = await screen.findByRole("switch", { name: "Writing guard" });
    expect(guard).toHaveAttribute("aria-checked", "false");

    fireEvent.click(guard);

    expect(setAgentIntegration).toHaveBeenCalledWith(true);
    expect(await screen.findByRole("switch", { name: "Writing guard" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
