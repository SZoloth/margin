import { useEffect, useState, useRef } from "react";
import type { ExportResult } from "@/types/export";

interface ExportAnnotationsPopoverProps {
  isOpen: boolean;
  onExport: () => Promise<ExportResult>;
  onClose: () => void;
  persistCorrections: boolean;
}

export function ExportAnnotationsPopover({
  isOpen,
  onExport,
  onClose,
  persistCorrections,
}: ExportAnnotationsPopoverProps) {
  const [result, setResult] = useState<ExportResult | null>(null);
  const [exporting, setExporting] = useState(false);

  // Reset state when popover opens
  useEffect(() => {
    if (isOpen) {
      setResult(null);
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
        const res = await onExportRef.current();
        if (!cancelled) setResult(res);
      } catch (err) {
        console.error("Export failed:", err);
        if (!cancelled) setResult({ highlightCount: 0, noteCount: 0, snippets: [], correctionsSaved: false, correctionsFile: "" });
      } finally {
        if (!cancelled) setExporting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

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
        }}
      >
        {/* Close button */}
        <button
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
              <span style={{ color: "var(--color-accent, #4a9)" }}>✓</span>
              Copied to clipboard
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
                Corrections saved to {result.correctionsFile}
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

          </div>
        ) : null}
      </div>
    </div>
  );
}
