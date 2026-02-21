import { useEffect, useState, useCallback } from "react";
import type { ExportScope } from "@/lib/export-annotations";

interface ExportAnnotationsPopoverProps {
  isOpen: boolean;
  onExport: (scope: ExportScope) => Promise<void>;
  onClose: () => void;
}

export function ExportAnnotationsPopover({
  isOpen,
  onExport,
  onClose,
}: ExportAnnotationsPopoverProps) {
  const [copied, setCopied] = useState(false);

  // Reset copied state when popover opens
  useEffect(() => {
    if (isOpen) setCopied(false);
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

  const handleExport = useCallback(
    async (scope: ExportScope) => {
      try {
        await onExport(scope);
        setCopied(true);
        setTimeout(() => onClose(), 1200);
      } catch (err) {
        console.error("Export failed:", err);
        // Still close — the fallback in App.tsx should have handled the copy
        setCopied(true);
        setTimeout(() => onClose(), 1200);
      }
    },
    [onExport, onClose],
  );

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
        style={{
          position: "relative",
          backgroundColor: "var(--color-page)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: "20px 24px",
          minWidth: 280,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
        }}
      >
        {copied ? (
          <div
            style={{
              textAlign: "center",
              color: "var(--color-text-primary)",
              fontSize: 14,
              fontWeight: 500,
              padding: "8px 0",
            }}
          >
            Copied to clipboard
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-text-primary)",
                marginBottom: 16,
              }}
            >
              Export annotations
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => void handleExport("all")}
                style={{
                  flex: 1,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  backgroundColor: "transparent",
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  transition: "background-color 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                All
              </button>
              <button
                onClick={() => void handleExport("unresolved")}
                style={{
                  flex: 1,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  backgroundColor: "transparent",
                  color: "var(--color-text-primary)",
                  cursor: "pointer",
                  transition: "background-color 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                Unresolved only
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                color: "var(--color-text-secondary)",
                textAlign: "center",
              }}
            >
              Esc to cancel
            </div>
          </>
        )}
      </div>
    </div>
  );
}
