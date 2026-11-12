import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Manages the "Copied!" flash state after a clipboard write.
 * Returns `copied` (true for 1.5s after trigger) and `triggerCopied`.
 */
export function useCopyFeedback(duration = 1500) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const triggerCopied = useCallback(() => {
    setCopied(true);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setCopied(false), duration);
  }, [duration]);

  return { copied, triggerCopied };
}
