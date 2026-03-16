import { useState, useCallback, useRef } from "react";

export function useChrome() {
  const [chromeVisible, setChromeVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    if (graceTimerRef.current) { clearTimeout(graceTimerRef.current); graceTimerRef.current = null; }
  }, []);

  // Show chrome and optionally auto-hide after `delay` ms (0 = no auto-hide).
  const showChrome = useCallback((delay = 1500) => {
    clearTimers();
    setChromeVisible(true);
    if (delay > 0 && !isHoveringRef.current) {
      hideTimerRef.current = setTimeout(() => {
        if (!isHoveringRef.current) setChromeVisible(false);
      }, delay);
    }
  }, [clearTimers]);

  // Called when mouse enters the invisible 24px hotzone at the top of the window.
  const handleHotzoneEnter = useCallback(() => {
    isHoveringRef.current = true;
    clearTimers();
    setChromeVisible(true);
  }, [clearTimers]);

  // Called when mouse enters the chrome bar itself.
  const handleChromeEnter = useCallback(() => {
    isHoveringRef.current = true;
    clearTimers();
  }, [clearTimers]);

  // Called when mouse leaves the chrome bar (or both hotzone + chrome together).
  const handleChromeLeave = useCallback(() => {
    isHoveringRef.current = false;
    graceTimerRef.current = setTimeout(() => {
      setChromeVisible(false);
    }, 350);
  }, []);

  return {
    chromeVisible,
    showChrome,
    handleHotzoneEnter,
    handleChromeEnter,
    handleChromeLeave,
  };
}
