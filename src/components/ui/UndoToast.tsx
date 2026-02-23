import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

export interface UndoAction {
  id: string;
  message: string;
  onUndo: () => void;
  onCommit: () => void;
}

interface UndoToastProps {
  action: UndoAction | null;
  duration?: number;
}

export function UndoToast({ action, duration = 5000 }: UndoToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [current, setCurrent] = useState<UndoAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setIsVisible(false);
    setTimeout(() => {
      current?.onCommit();
      setCurrent(null);
    }, 200);
  }, [current]);

  const undo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setIsVisible(false);
    setTimeout(() => {
      current?.onUndo();
      setCurrent(null);
    }, 200);
  }, [current]);

  useEffect(() => {
    if (!action) return;

    // If there's a pending action, commit it immediately
    if (current && timerRef.current) {
      clearTimeout(timerRef.current);
      current.onCommit();
    }

    setCurrent(action);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsVisible(true));
    });

    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        action.onCommit();
        setCurrent(null);
      }, 200);
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [action, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed z-50 bottom-6 left-1/2 flex items-center gap-3 border px-4 py-2.5"
      style={{
        transform: `translateX(-50%) translateY(${isVisible ? "0" : "12px"})`,
        opacity: isVisible ? 1 : 0,
        transition: isVisible
          ? "opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)"
          : "opacity 150ms cubic-bezier(0.4, 0, 1, 1), transform 150ms cubic-bezier(0.4, 0, 1, 1)",
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-sidebar)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      <span
        className="text-sm"
        style={{ color: "var(--color-text-primary)", fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {current.message}
      </span>
      <button
        type="button"
        onClick={undo}
        className="text-sm font-medium"
        style={{
          color: "var(--color-accent)",
          cursor: "pointer",
          padding: "2px 6px",
          borderRadius: "var(--radius-sm)",
          transition: "background-color 100ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--hover-bg)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={commit}
        className="text-xs"
        style={{
          color: "var(--color-text-secondary)",
          cursor: "pointer",
          padding: "2px 4px",
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}
