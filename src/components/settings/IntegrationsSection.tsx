import { useEffect, useState, useCallback, useRef } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { SectionHeader } from "./SectionHeader";
import { SettingRow } from "./SettingRow";
import { ToggleSwitch } from "./ToggleSwitch";
import {
  isMcpEnabledInClaude,
  enableMcpInClaude,
  disableMcpInClaude,
  checkMcpConnection,
} from "@/lib/mcp-bridge";

const CLAUDE_CODE_SNIPPET = `{
  "mcpServers": {
    "margin": {
      "command": "node",
      "args": ["/Applications/Margin.app/Contents/Resources/mcp/dist/index.js"]
    }
  }
}`;

export function IntegrationsSection() {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([isMcpEnabledInClaude(), checkMcpConnection()]).then(
      ([enabledRes, connectedRes]) => {
        if (cancelled) return;
        setEnabled(enabledRes.status === "fulfilled" && enabledRes.value);
        setConnected(connectedRes.status === "fulfilled" && connectedRes.value);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (saving) return;
      setSaving(true);
      setEnabled(next);
      try {
        if (next) {
          await enableMcpInClaude();
        } else {
          await disableMcpInClaude();
        }
        const nowConnected = await checkMcpConnection();
        setConnected(nowConnected);
      } catch {
        setEnabled(!next);
      } finally {
        setSaving(false);
      }
    },
    [saving],
  );

  const handleCopy = useCallback(async () => {
    try {
      await writeText(CLAUDE_CODE_SNIPPET);
      setCopied(true);
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(
        () => setCopied(false),
        1500,
      );
    } catch {
      // clipboard write failed
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl bg-[var(--color-sidebar)] p-6">
        <SectionHeader title="Integrations" />

        <p className="mt-2 mb-2 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
          Connect Margin to Claude for AI-assisted reading and writing
        </p>

        {!loading && (
          <>
            <SettingRow
              label="Claude Desktop"
              description="Auto-configured — toggle to enable or disable"
            >
              <ToggleSwitch checked={enabled} onChange={handleToggle} />
            </SettingRow>

            {enabled && (
              <div className="flex items-center gap-1.5 pb-2 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: connected
                      ? "var(--color-success)"
                      : "var(--color-text-secondary)",
                  }}
                />
                {connected
                  ? "Connected"
                  : "Not connected \u2014 restart Claude to connect"}
              </div>
            )}

            <SettingRow
              label="Claude Code"
              description="Add to ~/.claude.json, then restart Claude Code"
            >
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-primary)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
              >
                {copied ? "Copied" : "Copy config"}
              </button>
            </SettingRow>

            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowSnippet(!showSnippet)}
                className="cursor-pointer text-[length:var(--text-xs)] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
              >
                {showSnippet ? "Hide config" : "Show config"}
              </button>

              {showSnippet && (
                <pre className="mt-2 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-2.5 text-[length:11px] leading-relaxed text-[var(--color-text-secondary)]">
                  {CLAUDE_CODE_SNIPPET}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
