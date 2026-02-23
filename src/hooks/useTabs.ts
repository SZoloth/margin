import { useState, useCallback, useRef, useEffect } from "react";
import type { Tab, TabCache, PersistedTab } from "@/types/tab";
import type { Document } from "@/types/document";
import type { Highlight, MarginNote } from "@/types/annotations";
import { getOpenTabs, saveOpenTabs, getRecentDocuments, readFile } from "@/lib/tauri-commands";

export interface SnapshotData {
  document: Document | null;
  content: string;
  filePath: string | null;
  isDirty: boolean;
  highlights: Highlight[];
  marginNotes: MarginNote[];
  annotationsLoaded: boolean;
  scrollPosition: number;
}

export interface UseTabsReturn {
  tabs: Tab[];
  activeTabId: string | null;
  pendingCloseTabId: string | null;
  openTab: (doc: Document, content: string, filePath: string | null) => void;
  openInActiveTab: (doc: Document, content: string, filePath: string | null) => void;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  forceCloseTab: (id: string) => void;
  cancelCloseTab: () => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  getCachedTab: (id: string) => TabCache | undefined;
  snapshotActive: () => void;
  updateActiveTabDirty: (isDirty: boolean) => void;
  updateActiveTabTitle: (title: string) => void;
  isReady: boolean;
}

export function useTabs(snapshotFn: () => SnapshotData): UseTabsReturn {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const tabCaches = useRef<Map<string, TabCache>>(new Map());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotFnRef = useRef(snapshotFn);
  snapshotFnRef.current = snapshotFn;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  // Persist tabs to SQLite (debounced)
  const persistTabs = useCallback((currentTabs: Tab[], currentActiveId: string | null) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const persisted: PersistedTab[] = currentTabs
        .filter((t) => t.documentId !== null)
        .map((t) => ({
          id: t.id,
          document_id: t.documentId!,
          tab_order: t.order,
          is_active: t.id === currentActiveId,
          created_at: Date.now(),
        }));
      saveOpenTabs(persisted).catch(console.error);
    }, 500);
  }, []);

  // Load persisted tabs on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const persisted = await getOpenTabs();
        if (cancelled || persisted.length === 0) {
          setIsReady(true);
          return;
        }

        // Load document records to reconstruct tabs
        const recentDocs = await getRecentDocuments(100);
        const docMap = new Map(recentDocs.map((d) => [d.id, d]));

        const restoredTabs: Tab[] = [];
        let activeId: string | null = null;

        for (const pt of persisted) {
          const doc = docMap.get(pt.document_id);
          if (!doc) continue;

          const tab: Tab = {
            id: pt.id,
            documentId: pt.document_id,
            title: doc.title ?? "Untitled",
            isDirty: false,
            order: pt.tab_order,
          };
          restoredTabs.push(tab);
          if (pt.is_active) activeId = pt.id;
        }

        if (restoredTabs.length > 0) {
          if (!activeId) activeId = restoredTabs[0]!.id;
          setTabs(restoredTabs);
          setActiveTabId(activeId);

          // Pre-load the active tab's content
          const activeTab = restoredTabs.find((t) => t.id === activeId);
          if (activeTab?.documentId) {
            const doc = docMap.get(activeTab.documentId);
            if (doc) {
              let content = "";
              if (doc.source === "file" && doc.file_path) {
                try {
                  content = await readFile(doc.file_path);
                } catch {
                  // File may have been deleted
                }
              }
              tabCaches.current.set(activeTab.id, {
                document: doc,
                content,
                filePath: doc.file_path ?? null,
                highlights: [],
                marginNotes: [],
                annotationsLoaded: false,
                scrollPosition: 0,
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to restore tabs:", err);
      }
      if (!cancelled) setIsReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const snapshotActive = useCallback(() => {
    const currentId = activeTabIdRef.current;
    if (!currentId) return;
    const data = snapshotFnRef.current();
    tabCaches.current.set(currentId, {
      document: data.document,
      content: data.content,
      filePath: data.filePath,
      highlights: data.highlights,
      marginNotes: data.marginNotes,
      annotationsLoaded: data.annotationsLoaded,
      scrollPosition: data.scrollPosition,
    });
  }, []);

  const openTab = useCallback((doc: Document, content: string, filePath: string | null) => {
    // Check for existing tab with same document
    setTabs((prev) => {
      const existing = prev.find((t) => t.documentId === doc.id);
      if (existing) {
        setActiveTabId(existing.id);
        // Update cache with fresh content
        tabCaches.current.set(existing.id, {
          document: doc,
          content,
          filePath,
          highlights: [],
          marginNotes: [],
          annotationsLoaded: false,
          scrollPosition: 0,
        });
        persistTabs(prev, existing.id);
        return prev.map((t) => t.id === existing.id ? { ...t, title: doc.title ?? "Untitled", isDirty: false } : t);
      }

      const newTab: Tab = {
        id: crypto.randomUUID(),
        documentId: doc.id,
        title: doc.title ?? "Untitled",
        isDirty: false,
        order: prev.length,
      };

      tabCaches.current.set(newTab.id, {
        document: doc,
        content,
        filePath,
        highlights: [],
        marginNotes: [],
        annotationsLoaded: false,
        scrollPosition: 0,
      });

      const next = [...prev, newTab];
      setActiveTabId(newTab.id);
      persistTabs(next, newTab.id);
      return next;
    });
  }, [persistTabs]);

  const openInActiveTab = useCallback((doc: Document, content: string, filePath: string | null) => {
    setTabs((prev) => {
      const currentActiveId = activeTabIdRef.current;
      // Dedup: if doc is already open, just switch to it
      const existing = prev.find((t) => t.documentId === doc.id);
      if (existing) {
        setActiveTabId(existing.id);
        tabCaches.current.set(existing.id, {
          document: doc,
          content,
          filePath,
          highlights: [],
          marginNotes: [],
          annotationsLoaded: false,
          scrollPosition: 0,
        });
        persistTabs(prev, existing.id);
        return prev.map((t) => t.id === existing.id ? { ...t, title: doc.title ?? "Untitled", isDirty: false } : t);
      }

      // Replace the active tab's content
      if (currentActiveId) {
        const activeIdx = prev.findIndex((t) => t.id === currentActiveId);
        if (activeIdx !== -1) {
          tabCaches.current.set(currentActiveId, {
            document: doc,
            content,
            filePath,
            highlights: [],
            marginNotes: [],
            annotationsLoaded: false,
            scrollPosition: 0,
          });
          const next = prev.map((t) => t.id === currentActiveId
            ? { ...t, documentId: doc.id, title: doc.title ?? "Untitled", isDirty: false }
            : t);
          persistTabs(next, currentActiveId);
          return next;
        }
      }

      // No active tab — create one
      const newTab: Tab = {
        id: crypto.randomUUID(),
        documentId: doc.id,
        title: doc.title ?? "Untitled",
        isDirty: false,
        order: prev.length,
      };
      tabCaches.current.set(newTab.id, {
        document: doc,
        content,
        filePath,
        highlights: [],
        marginNotes: [],
        annotationsLoaded: false,
        scrollPosition: 0,
      });
      const next = [...prev, newTab];
      setActiveTabId(newTab.id);
      persistTabs(next, newTab.id);
      return next;
    });
  }, [persistTabs]);

  const switchTab = useCallback((id: string) => {
    if (id === activeTabIdRef.current) return;
    snapshotActive();
    setActiveTabId(id);
  }, [snapshotActive]);

  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);

  const forceCloseTab = useCallback((id: string) => {
    setPendingCloseTabId(null);
    tabCaches.current.delete(id);
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i }));

      if (id === activeTabId) {
        const newActive = next.length > 0
          ? next[Math.min(idx, next.length - 1)]
          : null;
        setActiveTabId(newActive?.id ?? null);
        persistTabs(next, newActive?.id ?? null);
      } else {
        persistTabs(next, activeTabId);
      }

      return next;
    });
  }, [activeTabId, persistTabs]);

  const closeTab = useCallback((id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;

    if (tab.isDirty) {
      setPendingCloseTabId(id);
      return;
    }

    forceCloseTab(id);
  }, [tabs, forceCloseTab]);

  const cancelCloseTab = useCallback(() => {
    setPendingCloseTabId(null);
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      const reordered = next.map((t, i) => ({ ...t, order: i }));
      persistTabs(reordered, activeTabId);
      return reordered;
    });
  }, [activeTabId, persistTabs]);

  const getCachedTab = useCallback((id: string) => {
    return tabCaches.current.get(id);
  }, []);

  const updateActiveTabDirty = useCallback((isDirty: boolean) => {
    if (!activeTabId) return;
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, isDirty } : t));
  }, [activeTabId]);

  const updateActiveTabTitle = useCallback((title: string) => {
    if (!activeTabId) return;
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, title } : t));
  }, [activeTabId]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd+O — open file as new tab
      if (isMod && e.key === "o" && !e.shiftKey) {
        e.preventDefault();
        // Fire-and-forget: the dialog result is handled by App.tsx's openFile wrapper
        window.dispatchEvent(new CustomEvent("margin:open-file-for-tab"));
      }

      // Cmd+W — close active tab
      if (isMod && e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }

      // Cmd+1-9 — jump to tab by index
      if (isMod && !e.shiftKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        const target = tabs[idx];
        if (target) {
          switchTab(target.id);
        }
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length <= 1 || !activeTabId) return;
        const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + tabs.length) % tabs.length
          : (currentIdx + 1) % tabs.length;
        switchTab(tabs[nextIdx]!.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId, switchTab, closeTab]);

  return {
    tabs,
    activeTabId,
    pendingCloseTabId,
    openTab,
    openInActiveTab,
    switchTab,
    closeTab,
    forceCloseTab,
    cancelCloseTab,
    reorderTabs,
    getCachedTab,
    snapshotActive,
    updateActiveTabDirty,
    updateActiveTabTitle,
    isReady,
  };
}
