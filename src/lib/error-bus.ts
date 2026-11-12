type ErrorListener = (message: string) => void;

const listeners = new Set<ErrorListener>();

/**
 * Surface a user-facing error. App subscribes and shows an ErrorToast.
 * Replaces a bare `console.error` in components that can't reach App's
 * toast state — pass the caught error as `err` to keep diagnostics.
 */
export function reportError(message: string, err?: unknown): void {
  if (err !== undefined) {
    console.error(message, err);
  }
  for (const listener of listeners) {
    listener(message);
  }
}

export function subscribeErrors(listener: ErrorListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
