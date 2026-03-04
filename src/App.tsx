import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import type { Editor } from "@tiptap/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AppShell } from "@/components/layout/AppShell";

const Reader = lazy(() => import("@/components/editor/Reader"));
const AgentationDev = import.meta.env.DEV
  ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation })))
  : null;
const DesignDials = import.meta.env.DEV
  ? lazy(() =>
      import("./hooks/useDesignDials").then((m) => {
        const Dials = () => {
          m.useDesignDials();
          return null;
        };
        return { default: Dials };
      })
    )
  : null;
import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import { HighlightThread } from "@/components/editor/HighlightThread";
import { ExportAnnotationsPopover } from "@/components/editor/ExportAnnotationsPopover";
import { useDocument } from "@/hooks/useDocument";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useKeepLocal } from "@/hooks/useKeepLocal";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { useSearch } from "@/hooks/useSearch";
import { useTabs } from "@/hooks/useTabs";
import { useTableOfContents } from "@/hooks/useTableOfContents";
import { useSettings } from "@/hooks/useSettings";
import { SettingsPage } from "@/components/settings/SettingsPage";
import type { Section } from "@/components/settings/SettingsNav";
import { TableOfContents } from "@/components/layout/TableOfContents";
import type { SnapshotData } from "@/hooks/useTabs";
import { createAnchor } from "@/lib/text-anchoring";
import { findAllMatches } from "@/components/editor/extensions/search";
import { formatAnnotationsMarkdown, getExtendedContext } from "@/lib/export-annotations";
import { readFile, drainPendingOpenFiles, persistCorrections, exportWritingRules } from "@/lib/tauri-commands";
import { listen } from "@tauri-apps/api/event";
import { stat } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { Document } from "@/types/document";
import type { CorrectionInput } from "@/types/annotations";
import type { ExportResult } from "@/types/export";
import { UndoToast } from "@/components/ui/UndoToast";
import { ErrorToast } from "@/components/ui/ErrorToast";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { useUpdater } from "@/hooks/useUpdater";
import { MarginIndicators } from "@/components/editor/MarginIndicators";
import type { UndoAction } from "@/components/ui/UndoToast";
import { useDiffReview } from "@/hooks/useDiffReview";
import { DiffBanner } from "@/components/editor/DiffBanner";
import { DiffNavChip } from "@/components/editor/DiffNavChip";
import { DiffControls } from "@/components/editor/DiffControls";


export default function App() {
  const { settings, setSetting } = useSettings();
  const doc = useDocument();
  const annotations = useAnnotations(doc.refreshRecentDocs);
  const keepLocal = useKeepLocal();
  const search = useSearch();
  const updater = useUpdater();
  const [editor, setEditor] = useState<Editor | null>(null);
  const toc = useTableOfContents(editor, doc.currentDoc?.id);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<Section | undefined>();
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [focusHighlightId, setFocusHighlightId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [autoFocusNew, setAutoFocusNew] = useState(false);
  const [polarityMap, setPolarityMap] = useState<Map<string, "positive" | "corrective">>(new Map());
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [errorToast, setErrorToast] = useState<{ message: string; id: number } | null>(null);
  const errorIdRef = useRef(0);
  const undoIdRef = useRef(0);
  const diffReview = useDiffReview();
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [diffControlState, setDiffControlState] = useState<{ changeId: string; top: number; right: number } | null>(null);
  const diffReviewDocIdRef = useRef<string | null>(null);
  const highlightThread = useAnimatedPresence(!!focusHighlightId, 200);
  const lastHighlightRef = useRef<{ highlight: import("@/types/annotations").Highlight; notes: import("@/types/annotations").MarginNote[]; anchorRect: DOMRect | null } | null>(null);

  // Keep last valid highlight data for exit animation
  if (focusHighlightId && annotations.isLoaded) {
    const highlight = annotations.highlights.find((h) => h.id === focusHighlightId);
    if (highlight) {
      const notes = annotations.marginNotes.filter((n) => n.highlight_id === focusHighlightId);
      lastHighlightRef.current = { highlight, notes, anchorRect };
    }
  }

  // Snapshot function for useTabs — captures current active tab state
  const snapshotFn = useCallback((): SnapshotData => {
    const scrollContainer = document.querySelector("[data-scroll-container]");
    return {
      document: doc.currentDoc,
      content: doc.content,
      filePath: doc.filePath,
      isDirty: doc.isDirty,
      highlights: annotations.highlights,
      marginNotes: annotations.marginNotes,
      annotationsLoaded: annotations.isLoaded,
      scrollPosition: scrollContainer?.scrollTop ?? 0,
    };
  }, [doc.currentDoc, doc.content, doc.filePath, doc.isDirty, annotations.highlights, annotations.marginNotes, annotations.isLoaded]);

  const tabsHook = useTabs({
    snapshotFn,
    onFileMissing: (names) => {
      const label = names.length === 1
        ? `"${names[0]}" was deleted — tab removed`
        : `${names.length} deleted files — tabs removed`;
      setErrorToast({ message: label, id: ++errorIdRef.current });
    },
  });
  const unsavedDialog = useAnimatedPresence(!!tabsHook.pendingCloseTabId, 200);

  // Listen for Cmd+O from useTabs keyboard shortcut
  useEffect(() => {
    const handler = () => { void doc.openFile(); };
    window.addEventListener("margin:open-file-for-tab", handler);
    return () => window.removeEventListener("margin:open-file-for-tab", handler);
  }, [doc.openFile]);

  // Track whether next doc open should create a new tab vs replace active
  const openAsNewTabRef = useRef(true);

  // When a document is opened via useDocument, register it as a tab
  const prevDocIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!doc.currentDoc || doc.currentDoc.id === prevDocIdRef.current) return;
    // Don't open tabs until tab system is ready (to avoid duplication during restore)
    if (!tabsHook.isReady) return;
    prevDocIdRef.current = doc.currentDoc.id;
    if (openAsNewTabRef.current) {
      tabsHook.openTab(doc.currentDoc, doc.content, doc.filePath);
    } else {
      tabsHook.openInActiveTab(doc.currentDoc, doc.content, doc.filePath);
    }
    // Reset to default (new tab) after each use
    openAsNewTabRef.current = true;
  }, [doc.currentDoc?.id, tabsHook.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // When activeTabId changes, restore the cached tab state
  const prevActiveTabIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tabsHook.activeTabId || tabsHook.activeTabId === prevActiveTabIdRef.current) return;
    prevActiveTabIdRef.current = tabsHook.activeTabId;

    const cache = tabsHook.getCachedTab(tabsHook.activeTabId);

    if (!cache) {
      // Tab was restored from persistence but never loaded (no cache).
      // Find the document and load it from disk.
      const tab = tabsHook.tabs.find((t) => t.id === tabsHook.activeTabId);
      if (tab?.documentId) {
        const recentDoc = doc.recentDocs.find((d) => d.id === tab.documentId);
        if (recentDoc) {
          // Pre-set so the doc-change effect doesn't create a duplicate tab
          prevDocIdRef.current = recentDoc.id;
          openAsNewTabRef.current = false;
          if (recentDoc.source === "file" && recentDoc.file_path) {
            void stat(recentDoc.file_path).then(() => {
              void doc.openRecentDocument(recentDoc);
            }).catch(() => {
              closeDeletedFileTab(recentDoc.file_path!, tab.id);
            });
          } else if (recentDoc.source === "keep-local" && recentDoc.keep_local_id) {
            void keepLocal.getContent(recentDoc.keep_local_id).then((markdown) => {
              void doc.openKeepLocalArticle(recentDoc, markdown);
            }).catch(console.error);
          }
        }
      }
      // Close any open highlight thread
      setFocusHighlightId(null);
      setAnchorRect(null);
      setAutoFocusNew(false);
      return;
    }

    // Pre-set prevDocIdRef so the doc-change effect doesn't re-register this as a new tab
    if (cache.document) {
      prevDocIdRef.current = cache.document.id;
    }

    doc.restoreFromCache(cache.document, cache.content, cache.filePath, false);

    if (cache.annotationsLoaded) {
      annotations.restoreFromCache(cache.document!.id, cache.highlights, cache.marginNotes);
    }

    // Reset highlight mark restoration so marks re-apply for new doc
    lastRestoredDocId.current = null;

    // Restore scroll position after content renders
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector("[data-scroll-container]");
      if (scrollContainer && cache.scrollPosition) {
        scrollContainer.scrollTop = cache.scrollPosition;
      }
    });

    // Close any open highlight thread
    setFocusHighlightId(null);
    setAnchorRect(null);
    setAutoFocusNew(false);
  }, [tabsHook.activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync dirty state to tab — only if the current doc matches the active tab
  useEffect(() => {
    const activeTab = tabsHook.tabs.find((t) => t.id === tabsHook.activeTabId);
    if (activeTab && doc.currentDoc && activeTab.documentId === doc.currentDoc.id) {
      tabsHook.updateActiveTabDirty(doc.isDirty);
    }
  }, [doc.isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync title to tab — only if the current doc matches the active tab
  useEffect(() => {
    if (!doc.currentDoc?.title) return;
    const activeTab = tabsHook.tabs.find((t) => t.id === tabsHook.activeTabId);
    if (activeTab && activeTab.documentId === doc.currentDoc.id) {
      tabsHook.updateActiveTabTitle(doc.currentDoc.title);
    }
  }, [doc.currentDoc?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // When no active tab but tabs restored, load the active tab's content from disk
  useEffect(() => {
    if (!tabsHook.isReady || tabsHook.tabs.length === 0) return;
    if (doc.currentDoc) return; // Already have content loaded

    const activeTab = tabsHook.tabs.find((t) => t.id === tabsHook.activeTabId);
    if (!activeTab) return;

    const cache = tabsHook.getCachedTab(activeTab.id);
    if (cache?.document) {
      // Pre-set prevDocIdRef so the doc-change effect doesn't create a duplicate tab
      prevDocIdRef.current = cache.document.id;

      if (cache.document.source === "file" && cache.document.file_path) {
        void doc.openRecentDocument(cache.document);
      } else if (cache.document.source === "keep-local" && cache.document.keep_local_id) {
        void keepLocal.getContent(cache.document.keep_local_id).then((markdown) => {
          void doc.openKeepLocalArticle(cache.document!, markdown);
        }).catch(console.error);
      }
    }
  }, [tabsHook.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load annotations when document changes
  useEffect(() => {
    if (doc.currentDoc) {
      void annotations.loadAnnotations(doc.currentDoc.id);
    }
  }, [doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Index document for search when opened
  useEffect(() => {
    if (doc.currentDoc && doc.content) {
      void search.indexDocument(
        doc.currentDoc.id,
        doc.currentDoc.title ?? "Untitled",
        doc.content
      );
    }
  }, [doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs to avoid stale closures in callbacks
  const currentDocRef = useRef(doc.currentDoc);
  currentDocRef.current = doc.currentDoc;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const highlightsRef = useRef(annotations.highlights);
  highlightsRef.current = annotations.highlights;
  const marginNotesRef = useRef(annotations.marginNotes);
  marginNotesRef.current = annotations.marginNotes;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const persistCorrectionsRef = useRef(settings.persistCorrections);
  persistCorrectionsRef.current = settings.persistCorrections;
  const setContentExternalRef = useRef(doc.setContentExternal);
  setContentExternalRef.current = doc.setContentExternal;
  const contentRef = useRef(doc.content);
  contentRef.current = doc.content;
  const diffReviewRef = useRef(diffReview);
  diffReviewRef.current = diffReview;
  const tabsHookRef = useRef(tabsHook);
  tabsHookRef.current = tabsHook;
  const isRestoringMarksRef = useRef(false);

  // Avoid cross-document corruption: diff review state is scoped to a single doc
  useEffect(() => {
    diffReview.reset();
    diffReviewDocIdRef.current = null;
    setDiffControlState(null);
  }, [diffReview.reset, doc.currentDoc?.id]);

  // Restore highlight marks in the editor when annotations load for a document.
  const lastRestoredDocId = useRef<string | null>(null);
  // Track docs where orphan recovery has already run to prevent duplicates on tab revisit
  const recoveredDocIds = useRef(new Set<string>());
  useEffect(() => {
    if (!editor || !annotations.isLoaded || !doc.currentDoc) return;
    if (lastRestoredDocId.current === doc.currentDoc.id) return;
    lastRestoredDocId.current = doc.currentDoc.id;

    // If DB has no highlights but the editor DOM has <mark> tags (from HTML baked
    // into the file), re-create DB records so clicks and notes work again.
    if (annotations.highlights.length === 0) {
      // Guard against re-entry on tab switch — only recover orphans once per doc
      if (recoveredDocIds.current.has(doc.currentDoc.id)) return;
      recoveredDocIds.current.add(doc.currentDoc.id);
      // Wait for DOM to render before checking for orphan marks
      requestAnimationFrame(() => {
        const domMarks = editor.view.dom.querySelectorAll("mark[data-color]");
        if (domMarks.length === 0) return;
        const recoverOrphans = async () => {
          const docId = doc.currentDoc!.id;
          const { state: s } = editor;
          const markT = s.schema.marks.highlight;
          if (!markT) return;
          const { tr: recoverTr } = s;
          const fullText = s.doc.textBetween(0, s.doc.content.size, "\n");

          for (const domMark of domMarks) {
            const el = domMark as HTMLElement;
            const text = el.textContent ?? "";
            if (!text) continue;
            const color = el.dataset.color ?? "yellow";

            let from: number;
            let to: number;
            try {
              from = editor.view.posAtDOM(el, 0);
              to = from + text.length;
            } catch {
              continue;
            }

            const prefix = fullText.substring(Math.max(0, from - 50), from);
            const suffix = fullText.substring(to, Math.min(fullText.length, to + 50));

            try {
              const highlight = await annotations.createHighlight({
                documentId: docId,
                color,
                textContent: text,
                fromPos: from,
                toPos: to,
                prefixContext: prefix,
                suffixContext: suffix,
              });
              // Stamp the mark with the new ID
              recoverTr.addMark(from, to, markT.create({ color, highlightId: highlight.id }));
            } catch (err) {
              console.error("Failed to recover orphan highlight:", err);
            }
          }

          if (recoverTr.steps.length > 0) {
            recoverTr.setMeta("addToHistory", false);
            isRestoringMarksRef.current = true;
            try {
              editor.view.dispatch(recoverTr);
            } finally {
              isRestoringMarksRef.current = false;
            }
          }
        };
        void recoverOrphans();
      });
      return;
    }

    const { state } = editor;
    const { tr } = state;
    const markType = state.schema.marks.highlight;
    if (!markType) return;

    for (const h of annotations.highlights) {
      try {
        const textAtPos = state.doc.textBetween(h.from_pos, h.to_pos, "\n");
        if (textAtPos === h.text_content) {
          tr.addMark(h.from_pos, h.to_pos, markType.create({ color: h.color, highlightId: h.id }));
          continue;
        }
      } catch {
        // Positions out of range
      }

      const found = findAllMatches(state.doc, h.text_content)[0];
      if (found) {
        try {
          tr.addMark(found.from, found.to, markType.create({ color: h.color, highlightId: h.id }));
        } catch {
          // Position out of range
        }
      }
    }

    if (tr.steps.length > 0) {
      tr.setMeta("addToHistory", false);
      isRestoringMarksRef.current = true;
      try {
        editor.view.dispatch(tr);
      } finally {
        isRestoringMarksRef.current = false;
      }

    }
  }, [editor, annotations.isLoaded, annotations.highlights, doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap onUpdate to suppress dirty state during mark restoration
  const handleEditorUpdate = useCallback((md: string) => {
    if (isRestoringMarksRef.current) return;
    // Prevent edits from being persisted while diff review is active
    if (diffReviewRef.current.mode !== "idle") return;
    doc.setContent(md);
  }, [doc.setContent]);

  // Close a tab whose backing file was deleted, and show a toast.
  // Used by the watcher catch, focus handler, and tab-switch guard.
  // Dedup: only fire once per path until it's reopened.
  const closedDeletedPathsRef = useRef(new Set<string>());
  const closeDeletedFileTab = useCallback((filePath: string, tabId?: string) => {
    if (closedDeletedPathsRef.current.has(filePath)) return;
    closedDeletedPathsRef.current.add(filePath);
    const name = filePath.split("/").pop() ?? "file";
    const id = tabId ?? tabsHookRef.current.activeTabId;
    if (id) tabsHookRef.current.forceCloseTab(id);
    setErrorToast({ message: `"${name}" was deleted — tab closed`, id: ++errorIdRef.current });
  }, []);

  const isSelfSaveRef = useRef(doc.isSelfSave);
  isSelfSaveRef.current = doc.isSelfSave;

  const handleFileChanged = useCallback(async (path: string) => {
    const currentDoc = currentDocRef.current;
    if (!currentDoc || currentDoc.file_path !== path) return;

    // Skip reload when we initiated the save — avoids cursor jump
    if (isSelfSaveRef.current(path)) return;

    try {
      const newContent = await readFile(path);
      // Re-validate after async read — user may have switched tabs/docs
      if (currentDocRef.current?.id !== currentDoc.id) return;
      const oldContent = contentRef.current;
      // Route through diff review instead of silently replacing
      const wasActive = diffReviewRef.current.mode !== "idle";
      const entered = diffReviewRef.current.enterPending(oldContent, newContent);
      if (entered) {
        diffReviewDocIdRef.current = currentDoc.id;
      } else if (wasActive) {
        // Don't get stuck showing an old diff banner when the latest update was auto-accepted
        diffReviewRef.current.reset();
        diffReviewDocIdRef.current = null;
        setDiffControlState(null);
      }
      // Only apply immediately when diff review was NOT entered (auto-accepted).
      // When in review, content is deferred until the user resolves changes.
      if (!entered && newContent !== oldContent) {
        setContentExternalRef.current(newContent);
      }
      // Update mtime baseline so focus fallback doesn't redundantly reload
      stat(path)
        .then((info) => {
          if (info.mtime) lastMtimeRef.current = info.mtime.getTime();
        })
        .catch(() => {});
    } catch (err) {
      // Check if the file was deleted (not just a transient read error)
      try {
        await stat(path);
        // File exists — transient error, just log
        console.error("Failed to reload file:", err);
      } catch {
        closeDeletedFileTab(path);
      }
    }
  }, []);

  useFileWatcher(doc.filePath, handleFileChanged);

  // When diff review resolves (accept/reject/dismiss), apply final content to the editor
  const prevDiffModeRef = useRef(diffReview.mode);
  useEffect(() => {
    const prevMode = prevDiffModeRef.current;
    prevDiffModeRef.current = diffReview.mode;

    // Only act on transition TO idle FROM a non-idle state
    if (diffReview.mode === "idle" && (prevMode === "pending" || prevMode === "reviewing")) {
      const currentDoc = currentDocRef.current;
      if (!currentDoc) return;
      if (!diffReviewDocIdRef.current) return;
      if (diffReviewDocIdRef.current && diffReviewDocIdRef.current !== currentDoc.id) {
        return;
      }
      const finalContent = diffReview.getFinalContent();
      const hasAccepted = diffReview.changes.some((c) => c.status === "accepted");
      const hasRejected = diffReview.changes.some((c) => c.status === "rejected");
      if (hasRejected) {
        // Rejected changes means the file on disk differs from what the user wants.
        // Mark dirty so they can Cmd+S to persist the reverted content.
        doc.setContent(finalContent);
      } else {
        // All accepted — file on disk already has this content, don't mark dirty.
        setContentExternalRef.current(finalContent);
      }
      // Force the editor to re-render with clean content.
      // Set editable first so the command dispatches reliably, then replace
      // the entire document (setContent), suppressing onUpdate via the
      // isRestoringMarks guard to avoid marking dirty or polluting state.
      const ed = editorRef.current;
      if (ed && !ed.isDestroyed) {
        ed.setEditable(true, false);
        isRestoringMarksRef.current = true;
        try {
          ed.commands.setContent(finalContent);
        } finally {
          isRestoringMarksRef.current = false;
        }
      }

      // If any changes were accepted, the document content differs from when
      // highlights were originally created. Prevent the mark-restoration
      // effect from re-applying highlights onto changed content — they'll
      // be visually orphaned (correct per design: highlights stay in DB).
      if (hasAccepted) {
        lastRestoredDocId.current = currentDoc.id;
      }

      diffReviewDocIdRef.current = null;
      diffReview.reset();
      setDiffControlState(null);
    }
  }, [diffReview.mode, diffReview.getFinalContent, diffReview.reset, doc.setContent]);

  // Disable editing while diff review is active (prevents saving markup to disk).
  // Suppress the TipTap 'update' event (emitUpdate=false) because the editable
  // transition fires AFTER the resolution effect — if the resolution's setContent
  // didn't fully take effect, the update event would serialize stale diff markup
  // into doc.content and lastEmittedMarkdownRef, preventing the Reader from
  // correcting the editor in the next render.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(diffReview.mode === "idle", false);
  }, [editor, diffReview.mode]);

  // Scroll to current change and auto-show Keep/Revert controls.
  // Uses rAF to ensure DOM has rendered diff marks (especially on mode transition).
  // Depends only on mode + currentIndex — NOT changes — so accepting/rejecting
  // a single change doesn't re-trigger (which would flicker the controls).
  useEffect(() => {
    if (diffReview.mode !== "reviewing") return;
    const change = diffReviewRef.current.changes[diffReview.currentIndex];
    if (!change) return;

    const frameId = requestAnimationFrame(() => {
      const scrollContainer = document.querySelector("[data-scroll-container]");
      const el = scrollContainer?.querySelector(`[data-change-id="${change.id}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: "center" });
        // Position Keep/Revert controls next to the mark
        const rect = el.getBoundingClientRect();
        setDiffControlState({
          changeId: change.id,
          top: rect.top,
          right: window.innerWidth - rect.right + 8,
        });
      } else {
        setDiffControlState(null);
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [diffReview.mode, diffReview.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle diff-click events → show Keep/Revert controls (manual clicks)
  useEffect(() => {
    if (diffReview.mode !== "reviewing") return;

    const handleDiffClick = (e: Event) => {
      const { changeId, element } = (e as CustomEvent).detail;
      if (!changeId || !element) return;
      const rect = (element as HTMLElement).getBoundingClientRect();
      setDiffControlState({
        changeId,
        top: rect.top,
        right: window.innerWidth - rect.right + 8,
      });
    };

    // Dismiss controls on scroll so they don't drift from the mark
    const scrollContainer = document.querySelector("[data-scroll-container]");
    const handleScroll = () => setDiffControlState(null);

    window.addEventListener("margin:diff-click", handleDiffClick);
    scrollContainer?.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("margin:diff-click", handleDiffClick);
      scrollContainer?.removeEventListener("scroll", handleScroll);
    };
  }, [diffReview.mode]);

  // Focus-based fallback: stat the file on window focus and reload if mtime changed.
  // Safety net so a missed watcher event is never permanent.
  const lastMtimeRef = useRef<number>(0);
  useEffect(() => {
    if (!doc.filePath) {
      lastMtimeRef.current = 0;
      return;
    }

    // Seed mtime on mount / path change
    const currentPath = doc.filePath;
    closedDeletedPathsRef.current.delete(currentPath);
    stat(currentPath)
      .then((info) => {
        if (info.mtime) lastMtimeRef.current = info.mtime.getTime();
      })
      .catch(() => {});

    let cancelled = false;
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused || cancelled) return;
      stat(currentPath)
        .then((info) => {
          if (cancelled) return;
          const mtime = info.mtime?.getTime() ?? 0;
          if (mtime > 0 && lastMtimeRef.current > 0 && mtime !== lastMtimeRef.current) {
            lastMtimeRef.current = mtime;
            handleFileChanged(currentPath);
          } else if (mtime > 0 && lastMtimeRef.current === 0) {
            // Baseline unknown (seed stat failed) — seed now and do a
            // one-time reload since we can't tell if the file changed.
            lastMtimeRef.current = mtime;
            handleFileChanged(currentPath);
          } else if (mtime > 0) {
            lastMtimeRef.current = mtime;
          }
        })
        .catch(async () => {
          // First stat failure could be transient (iCloud sync, brief lock).
          // Retry once after a short delay before concluding the file is gone.
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 500));
          if (cancelled) return;
          try {
            const info = await stat(currentPath);
            if (cancelled) return;
            // File came back — treat as normal mtime check
            const mtime = info.mtime?.getTime() ?? 0;
            if (mtime > 0) lastMtimeRef.current = mtime;
          } catch {
            if (cancelled) return;
            cancelled = true;
            closeDeletedFileTab(currentPath);
          }
        });
    });

    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, [doc.filePath, handleFileChanged]);

  // Handle files opened via macOS "Open With" / double-click
  const openFilePathRef = useRef(doc.openFilePath);
  openFilePathRef.current = doc.openFilePath;

  useEffect(() => {
    drainPendingOpenFiles().then((paths) => {
      const lastPath = paths[paths.length - 1];
      if (lastPath) {
        void openFilePathRef.current(lastPath);
      }
    }).catch(console.error);

    const unlisten = listen<string>("open-file", (event) => {
      void openFilePathRef.current(event.payload);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  // Resolve a highlight from event detail: prefer ID, fall back to text-matching
  const resolveHighlight = useCallback((detail: { highlightId?: string; text?: string }) => {
    if (detail.highlightId) {
      return highlightsRef.current.find((h) => h.id === detail.highlightId) ?? null;
    }
    if (detail.text) {
      return highlightsRef.current.find((h) => h.text_content === detail.text) ?? null;
    }
    return null;
  }, []);

  // Handle highlight click → open thread popover
  useEffect(() => {
    const handleHighlightClick = (e: Event) => {
      const { element, highlightId, text } = (e as CustomEvent).detail;
      if (!element) return;
      const match = resolveHighlight({ highlightId, text });
      if (match) {
        setAnchorRect((element as HTMLElement).getBoundingClientRect());
        setFocusHighlightId(match.id);
        setAutoFocusNew(false);
      }
    };

    const handleHighlightDelete = async (e: Event) => {
      const { element, highlightId, text } = (e as CustomEvent).detail;
      if (!element || !editor) return;
      const el = element as HTMLElement;
      const match = resolveHighlight({ highlightId, text });
      if (!match) return;

      let markFrom: number;
      let markTo: number;
      try {
        markFrom = editor.view.posAtDOM(el, 0);
        markTo = markFrom + (el.textContent?.length ?? 0);
      } catch {
        markFrom = -1;
        markTo = -1;
      }

      await annotations.deleteHighlight(match.id);

      const { state } = editor;
      const { tr } = state;
      const markType = state.schema.marks.highlight;
      if (!markType) return;

      if (markFrom >= 0 && markTo >= 0) {
        tr.removeMark(markFrom, markTo, markType);
      } else {
        state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          const hlMark = node.marks.find(
            (m) => m.type.name === "highlight" && m.attrs.highlightId === match.id,
          );
          if (hlMark) {
            tr.removeMark(pos, pos + node.nodeSize, hlMark);
          }
        });
      }

      if (tr.steps.length > 0) {
        editor.view.dispatch(tr);
      }
    };

    window.addEventListener("margin:highlight-click", handleHighlightClick);
    window.addEventListener("margin:highlight-delete", handleHighlightDelete);
    return () => {
      window.removeEventListener("margin:highlight-click", handleHighlightClick);
      window.removeEventListener("margin:highlight-delete", handleHighlightDelete);
    };
  }, [editor, annotations, resolveHighlight]);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    if (!editor) return;

    const highlight = annotations.highlights.find((h) => h.id === id);
    if (!highlight) return;

    // Capture margin notes before deletion so they can be restored on undo
    const capturedNotes = annotations.marginNotes.filter((n) => n.highlight_id === id);

    // Delete immediately
    await annotations.deleteHighlight(id);

    setFocusHighlightId(null);
    setAnchorRect(null);

    // Remove mark from editor
    const { state } = editor;
    const { tr } = state;
    const markType = state.schema.marks.highlight;
    if (markType) {
      state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        const hlMark = node.marks.find(
          (m) => m.type.name === "highlight" && m.attrs.highlightId === id,
        );
        if (hlMark) {
          tr.removeMark(pos, pos + node.nodeSize, hlMark);
        }
      });
      if (tr.steps.length > 0) {
        editor.view.dispatch(tr);
      }
    }

    // Show undo toast
    const actionId = String(++undoIdRef.current);
    setUndoAction({
      id: actionId,
      message: "Highlight deleted",
      onUndo: async () => {
        // Re-create the highlight — use refs to avoid stale closures
        try {
          const currentEditor = editorRef.current;
          const restored = await annotationsRef.current.createHighlight({
            documentId: highlight.document_id,
            color: highlight.color,
            textContent: highlight.text_content,
            fromPos: highlight.from_pos,
            toPos: highlight.to_pos,
            prefixContext: highlight.prefix_context,
            suffixContext: highlight.suffix_context,
          });
          // Re-create captured margin notes with the new highlight ID
          await Promise.all(
            capturedNotes.map((note) =>
              annotationsRef.current.createMarginNote(restored.id, note.content),
            ),
          );
          // Re-apply mark in editor
          if (currentEditor) {
            const restoreMarkType = currentEditor.state.schema.marks.highlight;
            if (restoreMarkType) {
              const restoreTr = currentEditor.state.tr;
              restoreTr.addMark(
                highlight.from_pos,
                highlight.to_pos,
                restoreMarkType.create({ color: highlight.color, highlightId: restored.id }),
              );
              currentEditor.view.dispatch(restoreTr);
            }
          }
          // Re-open the thread
          setFocusHighlightId(restored.id);
        } catch (err) {
          console.error("Failed to undo highlight delete:", err);
        }
        setUndoAction(null);
      },
      onCommit: () => setUndoAction(null),
    });
  }, [editor, annotations]);

  const handleEditorReady = useCallback((ed: Editor) => {
    setEditor(ed);
  }, []);

  const handleHighlight = useCallback(
    async (color?: string) => {
      const resolvedColor = color ?? settings.defaultHighlightColor;
      if (!editor || !doc.currentDoc) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;

      const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
      const selectedText = editor.state.doc.textBetween(from, to, "\n");
      const anchor = createAnchor(fullText, from, to);

      try {
        const highlight = await annotations.createHighlight({
          documentId: doc.currentDoc.id,
          color: resolvedColor,
          textContent: selectedText,
          fromPos: from,
          toPos: to,
          prefixContext: anchor.prefix,
          suffixContext: anchor.suffix,
        });

        const markType = editor.state.schema.marks.highlight;
        if (markType) {
          const tr = editor.state.tr.addMark(
            from, to,
            markType.create({ color: resolvedColor, highlightId: highlight.id }),
          );
          tr.setMeta("addToHistory", false);
          editor.view.dispatch(tr);
        }
      } catch (err) {
        console.error("Failed to save highlight:", err, "documentId:", doc.currentDoc.id);
      }
    },
    [editor, doc.currentDoc, annotations, settings.defaultHighlightColor],
  );

  const handleNote = useCallback(async () => {
    if (!editor || !doc.currentDoc) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    const anchor = createAnchor(fullText, from, to);

    try {
      const highlight = await annotations.createHighlight({
        documentId: doc.currentDoc.id,
        color: settings.defaultHighlightColor,
        textContent: selectedText,
        fromPos: from,
        toPos: to,
        prefixContext: anchor.prefix,
        suffixContext: anchor.suffix,
      });

      const markType = editor.state.schema.marks.highlight;
      if (markType) {
        const tr = editor.state.tr.addMark(
          from, to,
          markType.create({ color: settings.defaultHighlightColor, highlightId: highlight.id }),
        );
        tr.setMeta("addToHistory", false);
        editor.view.dispatch(tr);
      }

      requestAnimationFrame(() => {
        const mark = editor.view.dom.querySelector(
          `mark[data-highlight-id="${highlight.id}"]`,
        );
        if (mark) {
          setAnchorRect(mark.getBoundingClientRect());
        }
        setFocusHighlightId(highlight.id);
        setAutoFocusNew(true);
      });
    } catch (err) {
      console.error("Failed to save highlight for note:", err);
    }
  }, [editor, doc.currentDoc, annotations]);

  // Export annotations: Cmd+Shift+E
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyE") {
        e.preventDefault();
        if (doc.currentDoc && annotations.isLoaded) {
          setShowExportPopover(true);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doc.currentDoc, annotations.isLoaded]);

  // Style Memory: Cmd+Shift+M — opens Settings at Style Memory section
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setSettingsSection("style-memory");
        setShowSettings(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Find in document: Cmd+F
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === "KeyF") {
        e.preventDefault();
        setFindBarOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleExportAnnotations = useCallback(
    async (writingType: string | null): Promise<ExportResult> => {
      if (!editor || !doc.currentDoc) {
        return { highlightCount: 0, noteCount: 0, snippets: [], correctionsSaved: false, correctionsFile: "" };
      }

      const highlights = highlightsRef.current;
      const marginNotes = marginNotesRef.current;
      const currentDoc = doc.currentDoc;

      const markdown = await formatAnnotationsMarkdown({
        document: currentDoc,
        editor,
        highlights,
        marginNotes,
        polarityMap,
      });

      // Clipboard copy + best-effort MCP send (parallel, MCP failure won't block export)
      const [, mcpResult] = await Promise.all([
        writeText(markdown),
        import("@/lib/mcp-export").then(({ sendToMcpServer }) => sendToMcpServer(markdown)),
      ]);

      const snippets = highlights.slice(0, 3).map((h) =>
        h.text_content.length > 60 ? h.text_content.slice(0, 57) + "..." : h.text_content,
      );

      let correctionsSaved = false;
      let correctionsFile = "";

      if (persistCorrectionsRef.current && highlights.length > 0 && marginNotes.length > 0) {
        const notesByHighlight = new Map<string, string[]>();
        for (const note of marginNotes) {
          const existing = notesByHighlight.get(note.highlight_id) ?? [];
          existing.push(note.content);
          notesByHighlight.set(note.highlight_id, existing);
        }

        const correctionInputs: CorrectionInput[] = [];
        for (const h of highlights) {
          const notes = notesByHighlight.get(h.id);
          if (!notes || notes.length === 0) continue;

          correctionInputs.push({
            highlight_id: h.id,
            original_text: h.text_content,
            prefix_context: h.prefix_context,
            suffix_context: h.suffix_context,
            extended_context: getExtendedContext(editor, h.from_pos, h.to_pos),
            notes,
            highlight_color: h.color,
            writing_type: writingType,
            polarity: polarityMap.get(h.id) ?? null,
          });
        }

        if (correctionInputs.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          correctionsFile = `corrections-${today}.jsonl`;
          try {
            await persistCorrections(
              correctionInputs,
              currentDoc.id,
              currentDoc.title ?? null,
              currentDoc.source,
              currentDoc.file_path ?? null,
              today,
            );
            correctionsSaved = true;

            // Auto-export writing rules after corrections persist
            exportWritingRules().catch((err: unknown) =>
              console.error("Auto-export writing rules failed:", err),
            );
          } catch (err) {
            console.error("Failed to persist corrections:", err);
          }
        }
      }

      // Clear annotations from editor and DB after export
      if (highlights.length > 0) {
        // Strip highlight and marginNote marks from the editor
        const { state } = editor;
        const { tr } = state;
        state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          const highlightMark = node.marks.find((m) => m.type.name === "highlight");
          const marginNoteMark = node.marks.find((m) => m.type.name === "marginNote");
          if (highlightMark) {
            tr.removeMark(pos, pos + node.nodeSize, highlightMark.type);
          }
          if (marginNoteMark) {
            tr.removeMark(pos, pos + node.nodeSize, marginNoteMark.type);
          }
        });
        if (tr.steps.length > 0) {
          tr.setMeta("addToHistory", false);
          isRestoringMarksRef.current = true;
          try {
            editor.view.dispatch(tr);
          } finally {
            isRestoringMarksRef.current = false;
          }
        }

        // Delete from DB and clear React state
        await annotationsRef.current.clearAnnotations(currentDoc.id);

        // Close any open highlight popover
        setFocusHighlightId(null);
        setAnchorRect(null);

        // Tell mark-restoration useEffect this doc is already handled
        lastRestoredDocId.current = currentDoc.id;

        // Force-update the tab cache so tab switching doesn't resurrect stale annotations
        tabsHook.snapshotActive();
      }

      // Count polarity stats and clear
      let positiveCount = 0;
      let correctiveCount = 0;
      for (const p of polarityMap.values()) {
        if (p === "positive") positiveCount++;
        else if (p === "corrective") correctiveCount++;
      }
      setPolarityMap(new Map());

      return {
        highlightCount: highlights.length,
        noteCount: marginNotes.length,
        snippets,
        correctionsSaved,
        correctionsFile,
        sentToClaude: mcpResult.sent,
        positiveCount,
        correctiveCount,
      };
    },
    [editor, doc.currentDoc, polarityMap],
  );

  // Open a recent document from the sidebar (now goes through tabs)
  const handleSelectRecentDoc = useCallback(
    async (recentDoc: Document, newTab: boolean) => {
      openAsNewTabRef.current = newTab;

      // If already the current doc, just let the tab system handle dedup
      if (doc.currentDoc?.id === recentDoc.id) {
        // Still route through tabs for dedup/focus behavior
        if (newTab) {
          tabsHook.openTab(recentDoc, doc.content, doc.filePath);
        } else {
          tabsHook.openInActiveTab(recentDoc, doc.content, doc.filePath);
        }
        return;
      }

      // Snapshot current tab BEFORE changing the document —
      // after openRecentDocument, live state will reflect the new doc
      tabsHook.snapshotActive();

      if (recentDoc.source === "file") {
        await doc.openRecentDocument(recentDoc);
      } else if (recentDoc.source === "keep-local" && recentDoc.keep_local_id) {
        try {
          const markdown = await keepLocal.getContent(recentDoc.keep_local_id);
          await doc.openKeepLocalArticle(recentDoc, markdown);
        } catch (err) {
          console.error("Failed to reopen keep-local article:", err);
          setErrorToast({ message: "Could not load article — is keep-local running?", id: ++errorIdRef.current });
        }
      }
    },
    [doc, keepLocal, tabsHook]
  );

  return (
    <AppShell
      onOpenSettings={() => setShowSettings(true)}
      currentDoc={doc.currentDoc}
      recentDocs={doc.recentDocs}
      onOpenFile={doc.openFile}
      onSelectRecentDoc={handleSelectRecentDoc}
      isDirty={doc.isDirty}
      search={search}
      hasAnnotations={annotations.isLoaded && annotations.highlights.length > 0}
      onExport={() => setShowExportPopover(true)}
      onOpenFilePath={(path: string, newTab: boolean) => {
        openAsNewTabRef.current = newTab;
        tabsHook.snapshotActive();
        void doc.openFilePath(path);
      }}
      onRenameFile={async (targetDoc, newName) => {
        try {
          await doc.renameDocFile(targetDoc, newName);
        } catch (err) {
          // Error already logged in the hook
        }
      }}
      tabs={tabsHook.tabs}
      activeTabId={tabsHook.activeTabId}
      onSelectTab={tabsHook.switchTab}
      onCloseTab={tabsHook.closeTab}
      onReorderTabs={tabsHook.reorderTabs}
      onNewTab={doc.openFile}
      editor={editor}
      findBarOpen={findBarOpen}
      onCloseFindBar={() => setFindBarOpen(false)}
      tocElement={
        doc.currentDoc && toc.headings.length > 0 ? (
          <TableOfContents
            headings={toc.headings}
            activeHeadingId={toc.activeHeadingId}
            onScrollToHeading={toc.scrollToHeading}
          />
        ) : undefined
      }
      marginIndicators={
        editor && annotations.isLoaded ? (
          <MarginIndicators
            editor={editor}
            highlights={annotations.highlights}
            marginNotes={annotations.marginNotes}
            onClickHighlight={(highlightId, rect) => {
              setFocusHighlightId(highlightId);
              setAnchorRect(rect);
              setAutoFocusNew(false);
            }}
          />
        ) : undefined
      }
    >
      {diffReview.mode !== "idle" && (
        <DiffBanner
          changeCount={diffReview.changes.length}
          pendingCount={diffReview.pendingCount}
          updatedAt={diffReview.updatedAt}
          onAcceptAll={diffReview.acceptAll}
          onReview={diffReview.startReview}
          onDismiss={diffReview.dismiss}
          onRevertAll={diffReview.revertAll}
          isReviewing={diffReview.mode === "reviewing"}
        />
      )}

      <Suspense fallback={<div className="reader-content" style={{ opacity: 0.3 }} />}>
        <Reader
          content={diffReview.reviewContent ?? doc.content}
          onUpdate={handleEditorUpdate}
          isLoading={doc.isLoading}
          onEditorReady={handleEditorReady}
        />
      </Suspense>

      <FloatingToolbar
        editor={editor}
        onHighlight={handleHighlight}
        onNote={handleNote}
        defaultColor={settings.defaultHighlightColor}
      />

      {diffReview.mode === "reviewing" && (
        <DiffNavChip
          currentIndex={diffReview.currentIndex}
          totalCount={diffReview.changes.length}
          onPrev={diffReview.navigatePrev}
          onNext={diffReview.navigateNext}
        />
      )}

      {diffReview.mode === "reviewing" && diffControlState && (
        <DiffControls
          changeId={diffControlState.changeId}
          top={diffControlState.top}
          right={diffControlState.right}
          onKeep={(id) => {
            diffReview.acceptChange(id);
            setDiffControlState(null);
          }}
          onRevert={(id) => {
            diffReview.rejectChange(id);
            setDiffControlState(null);
          }}
        />
      )}

      {highlightThread.isMounted && lastHighlightRef.current && (() => {
        const { highlight, notes, anchorRect: rect } = lastHighlightRef.current;
        return (
          <HighlightThread
            highlight={highlight}
            notes={notes}
            polarity={polarityMap.get(highlight.id) ?? null}
            onAddNote={annotations.createMarginNote}
            onUpdateNote={annotations.updateMarginNote}
            onDeleteNote={annotations.deleteMarginNote}
            onDeleteHighlight={handleDeleteHighlight}
            onSetPolarity={(highlightId, polarity) => {
              setPolarityMap((prev) => {
                const next = new Map(prev);
                if (polarity === null) {
                  next.delete(highlightId);
                } else {
                  next.set(highlightId, polarity);
                }
                return next;
              });
            }}
            onClose={() => {
              setFocusHighlightId(null);
              setAnchorRect(null);
              setAutoFocusNew(false);
            }}
            anchorRect={rect}
            autoFocusNew={autoFocusNew}
            isVisible={highlightThread.isVisible}
          />
        );
      })()}

      <ExportAnnotationsPopover
        isOpen={showExportPopover}
        onExport={handleExportAnnotations}
        onClose={() => setShowExportPopover(false)}
        persistCorrections={settings.persistCorrections}
        onOpenSettings={() => setShowSettings(true)}
      />

      <UndoToast action={undoAction} />
      <ErrorToast key={errorToast?.id} message={errorToast?.message ?? null} />

      {/* Unsaved changes dialog */}
      {unsavedDialog.isMounted && (() => {
        const tab = tabsHook.tabs.find((t) => t.id === tabsHook.pendingCloseTabId);
        if (!tab) return null;
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              onClick={tabsHook.cancelCloseTab}
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.3)",
                opacity: unsavedDialog.isVisible ? 1 : 0,
                transition: `opacity ${unsavedDialog.isVisible ? "200ms var(--ease-entrance)" : "150ms var(--ease-exit)"}`,
              }}
            />
            <div
              role="dialog"
              aria-label="Unsaved changes"
              style={{
                position: "relative",
                backgroundColor: "var(--color-page)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "20px 24px",
                minWidth: "min(340px, calc(100vw - 32px))",
                maxWidth: "min(400px, calc(100vw - 32px))",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                opacity: unsavedDialog.isVisible ? 1 : 0,
                transform: unsavedDialog.isVisible ? "scale(1) translateY(0)" : "scale(0.97) translateY(4px)",
                transition: unsavedDialog.isVisible
                  ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
                  : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
              }}
            >
              <button
                onClick={tabsHook.cancelCloseTab}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  fontSize: 18, /* ds-lint-disable */
                  lineHeight: 1,
                  padding: "2px 6px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                ×
              </button>
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 14, /* ds-lint-disable */
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    marginBottom: 6,
                  }}
                >
                  Unsaved changes
                </div>
                <div style={{ fontSize: 13, /* ds-lint-disable */ color: "var(--color-text-secondary)" }}>
                  "{tab.title}" has unsaved changes.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => tabsHook.forceCloseTab(tabsHook.pendingCloseTabId!)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13, /* ds-lint-disable */
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    background: "none",
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Close without saving
                </button>
                <button
                  onClick={async () => {
                    await doc.saveCurrentFile();
                    tabsHook.forceCloseTab(tabsHook.pendingCloseTabId!);
                  }}
                  style={{
                    padding: "6px 14px",
                    fontSize: 13, /* ds-lint-disable */
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Save and close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showSettings && (
        <div
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "var(--color-page)" }}
        >
          <SettingsPage
            settings={settings}
            setSetting={setSetting}
            onClose={() => {
              setShowSettings(false);
              setSettingsSection(undefined);
            }}
            updater={updater}
            initialSection={settingsSection}
          />
        </div>
      )}

      {updater.available && (
        <div
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px",
            fontSize: 12, /* ds-lint-disable */

            color: "var(--color-text-primary)",
            backgroundColor: "var(--color-page)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            zIndex: 900,
          }}
        >
          <span>Margin {updater.version} available</span>
          <button
            type="button"
            onClick={updater.install}
            disabled={updater.installing}
            style={{
              padding: "3px 10px",
              fontSize: 11, /* ds-lint-disable */
              fontWeight: 500,

              color: "var(--color-text-primary)",
              backgroundColor: "var(--hover-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              cursor: updater.installing ? "default" : "pointer",
              opacity: updater.installing ? 0.6 : 1,
            }}
          >
            {updater.installing ? "Installing..." : "Update"}
          </button>
          {!updater.installing && (
            <button
              type="button"
              onClick={updater.dismiss}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                color: "var(--color-text-secondary)",
                fontSize: 14, /* ds-lint-disable */
                lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              &times;
            </button>
          )}
          {updater.error && (
            <span style={{ color: "var(--color-danger, #ef4444)", fontSize: 11 /* ds-lint-disable */ }}>
              {updater.error}
            </span>
          )}
        </div>
      )}
      {AgentationDev && (
        <Suspense fallback={null}>
          <AgentationDev />
        </Suspense>
      )}
      {DesignDials && (
        <Suspense fallback={null}>
          <DesignDials />
        </Suspense>
      )}
    </AppShell>
  );
}
