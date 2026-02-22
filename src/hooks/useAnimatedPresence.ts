import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Manages mount/unmount lifecycle for animated elements.
 *
 * - isOpen true  → mount, next frame set visible (triggers CSS enter transition)
 * - isOpen false → set invisible, wait for duration, then unmount
 *
 * Returns { isMounted, isVisible } — use isMounted to conditionally render,
 * isVisible to drive opacity/transform via style or className.
 */
export function useAnimatedPresence(isOpen: boolean, duration = 200) {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    cleanup();

    if (isOpen) {
      setIsMounted(true);
      // Next frame: trigger enter transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      setIsVisible(false);
      timeoutRef.current = setTimeout(() => {
        setIsMounted(false);
      }, duration);
    }

    return cleanup;
  }, [isOpen, duration, cleanup]);

  return { isMounted, isVisible };
}
