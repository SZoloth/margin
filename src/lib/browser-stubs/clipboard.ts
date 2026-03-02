/**
 * Browser mock for @tauri-apps/plugin-clipboard-manager
 * Delegates to the standard Clipboard API (works on localhost).
 */

export async function writeText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

export async function readText(): Promise<string> {
  if (navigator.clipboard) {
    return navigator.clipboard.readText();
  }
  return "";
}
