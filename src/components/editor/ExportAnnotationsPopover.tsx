import { useEffect, useState, useCallback } from "react";

interface ExportAnnotationsPopoverProps {
  isOpen: boolean;
  onExport: () => Promise<void>;
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
    async () => {
      try {
        await onExport();
        setCopied(true);
        setTimeout(() => onClose(), 1200);
      } catch (err) {
        console.error("Export failed:", err);
        setCopied(true);
        setTimeout(() => onClose(), 1200);
      }
    },
    [onExport, onClose],
  );

  // Auto-export when popover opens (no scope choice needed anymore)
  useEffect(() => {
    if (isOpen && !copied) {
      void handleExport();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
          minWidth: "min(280px, calc(100vw - 32px))",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div
          style={{
            textAlign: "center",
            color: "var(--color-text-primary)",
            fontSize: 14,
            fontWeight: 500,
            padding: "8px 0",
          }}
        >
          {copied ? "Copied to clipboard" : "Exporting..."}
        </div>
      </div>
    </div>
  );
}
