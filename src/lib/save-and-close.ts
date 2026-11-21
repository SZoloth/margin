import type { TabCache } from "@/types/tab";

export interface SaveAndCloseArgs {
  tabId: string;
  activeTabId: string | null;
  /** The tab's cached draft; only consulted when the tab isn't active. */
  cached: TabCache | undefined;
  saveActive: () => Promise<boolean>;
  saveFile: (path: string, content: string) => Promise<boolean>;
  close: (tabId: string) => void;
}

/**
 * Save the tab the dialog was opened for, then close it. The tab closes only
 * after its own draft was written, so a failed write leaves it open.
 */
export async function saveAndCloseTab({
  tabId,
  activeTabId,
  cached,
  saveActive,
  saveFile,
  close,
}: SaveAndCloseArgs): Promise<boolean> {
  let saved: boolean;
  if (tabId === activeTabId) {
    saved = await saveActive();
  } else if (!cached) {
    saved = false;
  } else if (cached.filePath === null) {
    // Keep-local articles have no file; same as saving the active one.
    saved = true;
  } else {
    saved = await saveFile(cached.filePath, cached.content);
  }
  if (saved) close(tabId);
  return saved;
}
