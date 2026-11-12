import { useState, useCallback } from "react";

export type OnboardingStep = "welcome" | "complete";

const STORAGE_KEY = "margin-onboarding-complete";

function readComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * First run lasts until the user makes their first Hard rule or opens a file
 * of their own. It never times out: a timer that ends onboarding mid-task
 * leaves a stranger with no guidance and no explanation.
 */
export function useOnboarding() {
  const [isFirstRun] = useState(() => !readComplete());
  const [step, setStep] = useState<OnboardingStep>(() => (readComplete() ? "complete" : "welcome"));
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* storage unavailable: onboarding shows again next launch */
    }
    setStep("complete");
  }, []);

  const dismissWelcome = useCallback(() => setWelcomeDismissed(true), []);

  return { isFirstRun, step, welcomeDismissed, complete, dismissWelcome };
}
