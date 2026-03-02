import { useEffect, useState, useRef } from "react";
import type { ExportResult } from "@/types/export";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";

// Show the MCP setup hint once per app session
let mcpHintShown = false;

function McpHint({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!mcpHintShown) {
      mcpHintShown = true;
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        fontSize: 12,
        color: "var(--color-text-tertiary)",
        borderTop: "1px solid var(--color-border)",
        paddingTop: 10,
        lineHeight: 1.5,
      }}
    >
      Tip: Connect to Claude for direct export.{" "}
      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenSettings();
        }}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "var(--color-accent)",
          fontSize: 12,
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        Set up in Settings
      </button>
    </div>
  );
}

interface ExportAnnotationsPopoverProps {
  isOpen: boolean;
  onExport: (writingType: string | null) => Promise<ExportResult>;
  onClose: () => void;
  persistCorrections: boolean;
  onOpenSettings: () => void;
}

export function ExportAnnotationsPopover({
  isOpen,
  onExport,
  onClose,
  persistCorrections,
  onOpenSettings,
}: ExportAnnotationsPopoverProps) {
  const [result, setResult] = useState<ExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { isMounted, isVisible } = useAnimatedPresence(isOpen, 200);

  // Reset state when popover opens
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setErrorMessage(null);
      setExporting(false);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const onExportRef = useRef(onExport);
  onExportRef.current = onExport;

  // Auto-export when popover opens. Uses ref for onExport to avoid
  // re-triggering when the parent callback identity changes. Cancellation
  // flag guards against state updates after StrictMode cleanup.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    (async () => {
      setExporting(true);
      try {
        const res = await onExportRef.current(null);
        if (!cancelled) {
          setResult(res);
          setErrorMessage(null);
        }
      } catch (err) {
        console.error("Export failed:", err);
        if (!cancelled) {
          setResult(null);
          setErrorMessage("Export failed. Please try again.");
        }
      } finally {
        if (!cancelled) setExporting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isMounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.3)",
          opacity: isVisible ? 1 : 0,
          transition: `opacity ${isVisible ? "200ms var(--ease-entrance)" : "150ms var(--ease-exit)"}`,
        }}
      />

      {/* Popover */}
      <div
        role="dialog"
        aria-label="Export annotations"
        style={{
          position: "relative",
          backgroundColor: "var(--color-page)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          minWidth: "min(320px, calc(100vw - 32px))",
          maxWidth: "min(400px, calc(100vw - 32px))",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "scale(1) translateY(0)" : "scale(0.97) translateY(4px)",
          transition: isVisible
            ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
            : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
            fontSize: 18,
            lineHeight: 1,
            padding: "2px 6px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          ×
        </button>

        {exporting ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--color-text-primary)",
              fontSize: 14,
              fontWeight: 500,
              padding: "8px 0",
            }}
          >
            Exporting...
          </div>
        ) : errorMessage ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--color-text-primary)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <span style={{ color: "var(--color-danger, #d33)" }}>×</span>
              Export failed
            </div>
            <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
              {errorMessage}
            </div>
          </div>
        ) : result ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--color-text-primary)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <span style={{ color: "var(--color-accent)" }}>✓</span>
              {result.sentToClaude ? "Sent to Claude" : "Copied to clipboard"}
            </div>

            {/* Stats */}
            <div
              style={{
                color: "var(--color-text-secondary)",
                fontSize: 13,
              }}
            >
              {result.highlightCount} {result.highlightCount === 1 ? "annotation" : "annotations"}
              {result.noteCount > 0 && (
                <> · {result.noteCount} {result.noteCount === 1 ? "note" : "notes"}</>
              )}
              {(result.positiveCount ?? 0) > 0 && (
                <> · {result.positiveCount} positive</>
              )}
              {(result.correctiveCount ?? 0) > 0 && (
                <> · {result.correctiveCount} corrective</>
              )}
            </div>

            {/* Snippets */}
            {result.snippets.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {result.snippets.map((snippet, i) => (
                  <div
                    key={i}
                    style={{
                      borderLeft: "2px solid var(--color-border)",
                      paddingLeft: 10,
                      fontSize: 12,
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.5,
                      fontStyle: "italic",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {snippet}
                  </div>
                ))}
              </div>
            )}

            {/* Corrections save location */}
            {result.correctionsSaved && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-tertiary)",
                  borderTop: "1px solid var(--color-border)",
                  paddingTop: 10,
                }}
              >
                {((result.positiveCount ?? 0) > 0 || (result.correctiveCount ?? 0) > 0)
                  ? "Voice signals" : "Corrections"} saved to {result.correctionsFile}
              </div>
            )}

            {/* Save failed hint */}
            {persistCorrections && !result.correctionsSaved && result.noteCount > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-tertiary)",
                  borderTop: "1px solid var(--color-border)",
                  paddingTop: 10,
                }}
              >
                Could not save feedback locally
              </div>
            )}

            {/* Prompt to enable local save */}
            {!persistCorrections && result.noteCount > 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-tertiary)",
                  borderTop: "1px solid var(--color-border)",
                  paddingTop: 10,
                }}
              >
                Want to save feedback locally?{" "}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--color-accent)",
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  Turn on in Settings
                </button>
              </div>
            )}

            {/* "Also copied" when sent to Claude */}
            {result.sentToClaude && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-text-tertiary)",
                  borderTop: "1px solid var(--color-border)",
                  paddingTop: 10,
                }}
              >
                Also copied to clipboard
              </div>
            )}

            {/* MCP discovery hint — once per session */}
            {!result.sentToClaude && <McpHint onClose={onClose} onOpenSettings={onOpenSettings} />}
          </div>
        ) : null}
      </div>
    </div>
  );
}
