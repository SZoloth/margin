import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { getDiagnostics, logFrontendError } from "@/lib/tauri-commands";

// Chromium/WebKit raise this for harmless layout feedback loops.
const BENIGN = /ResizeObserver loop/i;

/** Writes an error to ~/.margin/logs. Never throws: logging must not make a crash worse. */
export function reportToLog(source: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  if (BENIGN.test(err.message)) return;
  logFrontendError(source, `${err.name}: ${err.message}`, err.stack).catch(() => {});
}

/** Logs uncaught errors and unhandled promise rejections. Returns a cleanup function. */
export function installGlobalErrorLogging(): () => void {
  const onError = (e: ErrorEvent) => reportToLog("window.onerror", e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportToLog("unhandledrejection", e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** Puts the diagnostics report on the clipboard. Rejects if either step fails. */
export async function copyDiagnostics(): Promise<void> {
  await writeText(await getDiagnostics());
}

/** `margin-20261012-205213-daily.db` → a local, human date and time. */
export function backupLabel(name: string): string | null {
  const m = /^margin-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
