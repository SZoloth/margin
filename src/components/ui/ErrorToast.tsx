import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface ErrorToastProps {
  message: string | null;
  duration?: number;
}

export function ErrorToast({ message, duration = 4000 }: ErrorToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const clearAllTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const dismiss = useCallback(() => {
    clearAllTimers();
    setIsVisible(false);
    fadeTimerRef.current = setTimeout(() => setCurrent(null), 200);
  }, [clearAllTimers]);

  useEffect(() => {
    if (!message) return;

    clearAllTimers();

    setCurrent(message);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => setIsVisible(true));
    });

    timerRef.current = setTimeout(dismiss, duration);

    return clearAllTimers;
  }, [message, duration, clearAllTimers, dismiss]);

  if (!current) return null;

  return createPortal(
    <div
      role="alert"
      className="fixed z-50 bottom-6 left-1/2 flex items-center gap-2 border px-4 py-2.5"
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
        {current}
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="text-xs"
        style={{ color: "var(--color-text-secondary)", cursor: "pointer", padding: "2px 4px" }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}
