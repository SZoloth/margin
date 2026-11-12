import { useEffect, useRef } from "react";

interface UnsavedChangesDialogProps {
  title: string;
  isVisible: boolean;
  onCancel: () => void;
  onCloseWithoutSaving: () => void;
  onSaveAndClose: () => void;
}

/**
 * Modal confirmation for closing a tab with unsaved changes.
 * Implements the dialog (modal) pattern: aria-modal, focus trapped inside,
 * Escape cancels, focus returns to the previously focused element on close.
 */
export function UnsavedChangesDialog({
  title,
  isVisible,
  onCancel,
  onCloseWithoutSaving,
  onSaveAndClose,
}: UnsavedChangesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Move focus into the dialog on open, restore it on close
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const primary = dialogRef.current?.querySelector<HTMLElement>("[data-primary]");
    primary?.focus();
    return () => {
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  // Escape cancels; Tab is trapped inside the dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement | undefined;
      const last = focusable[focusable.length - 1] as HTMLElement | undefined;
      if (!first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first || !dialog.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };

    // Window-level: Escape must work even if focus sits outside the dialog
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      <div
        onClick={onCancel}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.3)",
          opacity: isVisible ? 1 : 0,
          transition: `opacity ${isVisible ? "200ms var(--ease-entrance)" : "150ms var(--ease-exit)"}`,
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Unsaved changes"
        style={{
          position: "relative",
          backgroundColor: "var(--color-page)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          minWidth: "min(340px, calc(100vw - 32px))",
          maxWidth: "min(400px, calc(100vw - 32px))",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "scale(1) translateY(0)" : "scale(0.97) translateY(4px)",
          transition: isVisible
            ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
            : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
        }}
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-lg)",
            lineHeight: 1,
            padding: "2px 6px",
            borderRadius: "var(--radius-sm)",
          }}
        >
          ×
        </button>
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: "var(--text-base)",
              fontWeight: 600,
              color: "var(--color-text-primary)",
              marginBottom: 6,
            }}
          >
            Unsaved changes
          </div>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>
            "{title}" has unsaved changes.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCloseWithoutSaving}
            style={{
              padding: "6px 14px",
              fontSize: "var(--text-sm)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "none",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            Close without saving
          </button>
          <button
            data-primary
            onClick={onSaveAndClose}
            style={{
              padding: "6px 14px",
              fontSize: "var(--text-sm)",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: "var(--color-accent)",
              color: "white",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Save and close
          </button>
        </div>
      </div>
    </div>
  );
}
