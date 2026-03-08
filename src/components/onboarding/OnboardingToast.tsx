import { useEffect, useState, useRef } from "react";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";

interface OnboardingToastProps {
  message: string | null;
  duration?: number;
  onDismiss: () => void;
}

export function OnboardingToast({ message, duration = 5000, onDismiss }: OnboardingToastProps) {
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message) {
      setActiveMessage(message);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onDismiss, duration);
    } else {
      // Delay clearing text so exit animation shows the message
      const t = setTimeout(() => setActiveMessage(null), 200);
      return () => clearTimeout(t);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message, duration, onDismiss]);

  const presence = useAnimatedPresence(!!message, 200);

  if (!presence.isMounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 32,
        left: "50%",
        transform: presence.isVisible
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(4px)",
        zIndex: 800,
        padding: "8px 16px",
        borderRadius: 20,
        backgroundColor: "var(--hover-bg)",
        border: "1px solid var(--color-border)",
        fontSize: "var(--text-sm)",
        fontFamily: "'Instrument Sans', system-ui, sans-serif",
        color: "var(--color-text-secondary)",
        whiteSpace: "nowrap",
        opacity: presence.isVisible ? 1 : 0,
        transition: presence.isVisible
          ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
          : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
        pointerEvents: "none",
      }}
    >
      {activeMessage}
    </div>
  );
}
