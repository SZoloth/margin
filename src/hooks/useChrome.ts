import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Manages auto-collapsing chrome bar visibility.
 * Show on: app load, explicit show() call (e.g. new tab).
 * Hide: after delay (auto-hide) or immediately on demand.
 */
export function useChrome(autoHideMs = 2000) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimer();
    setVisible(true);
  }, [clearTimer]);

  const showThenHide = useCallback((ms?: number) => {
    clearTimer();
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), ms ?? autoHideMs);
  }, [clearTimer, autoHideMs]);

  const hide = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const cancelHide = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  // Auto-hide after initial mount
  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(false), autoHideMs);
    return clearTimer;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { visible, show, showThenHide, hide, cancelHide };
}
