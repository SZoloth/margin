import { useState, useCallback, useEffect, useRef } from "react";

export type OnboardingStep = "welcome" | "highlighted" | "noted" | "complete";

const STORAGE_KEY = "margin-onboarding-complete";

export function useOnboarding() {
  const [isFirstRun] = useState(() => localStorage.getItem(STORAGE_KEY) === null);
  const [step, setStep] = useState<OnboardingStep>(() =>
    localStorage.getItem(STORAGE_KEY) === null ? "welcome" : "complete",
  );
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const complete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setStep("complete");
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const advanceToHighlighted = useCallback(() => {
    setStep((prev) => (prev === "welcome" ? "highlighted" : prev));
  }, []);

  const advanceToNoted = useCallback(() => {
    setStep((prev) => {
      if (prev === "welcome" || prev === "highlighted") {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        return "complete";
      }
      return prev;
    });
  }, []);

  const dismissWelcome = useCallback(() => {
    setStep((prev) => (prev === "welcome" ? "highlighted" : prev));
  }, []);

  // Fallback: if welcome bar shows but user never highlights, complete after 30s
  useEffect(() => {
    if (step !== "welcome") return;
    fallbackTimerRef.current = setTimeout(() => {
      complete();
    }, 30_000);
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [step, complete]);

  return { isFirstRun, step, advanceToHighlighted, advanceToNoted, complete, dismissWelcome };
}
