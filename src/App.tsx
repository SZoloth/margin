import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AppShell } from "@/components/layout/AppShell";
import { UnsavedChangesDialog } from "@/components/layout/UnsavedChangesDialog";
import { UIFork } from "uifork";

const Reader = lazy(() => import("@/components/editor/Reader"));
import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import { ReaderControls } from "@/components/editor/ReaderControls";
import { HighlightThread } from "@/components/editor/HighlightThread";
import { ExportAnnotationsPopover } from "@/components/editor/ExportAnnotationsPopover";
import { useDocument } from "@/hooks/useDocument";
import { useHighlightShortcut } from "@/hooks/useHighlightShortcut";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useKeepLocal } from "@/hooks/useKeepLocal";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { useSearch } from "@/hooks/useSearch";
import { useTabs } from "@/hooks/useTabs";
import { useTableOfContents } from "@/hooks/useTableOfContents";
import { useSettings } from "@/hooks/useSettings";
// Settings (incl. Style Memory + Dashboard) is rarely on the launch path —
// lazy-splitting keeps its code out of the startup parse.
const SettingsPage = lazy(() =>
  import("@/components/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
import type { Section } from "@/components/settings/SettingsNav";
import { TableOfContents } from "@/components/layout/TableOfContents";
import type { SnapshotData } from "@/hooks/useTabs";
import { createAnchor, resolveAnchor, buildDocTextMap, docPosToFlat, flatToDocPos } from "@/lib/text-anchoring";
import { allowedMarkRanges, planHighlightOverlap, collectMarkIdsInRange, rangeFullyMarked } from "@/lib/highlight-ranges";
import { applyAcceptedCorrection } from "@/lib/apply-accepted-correction";
import { buildCorrectionExportInputs, formatAnnotationsMarkdown, getExtendedContext } from "@/lib/export-annotations";
import { serializeEditorMarkdown } from "@/lib/serialize-editor";
import { shouldClearAnnotationsAfterExport } from "@/lib/export-clear-policy";
import { readFile, drainPendingOpenFiles, persistCorrections, exportWritingRules, markHighlightsExported, getWritingRules } from "@/lib/tauri-commands";
import { subscribeErrors, reportError } from "@/lib/error-bus";
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
import { useOnboarding } from "@/hooks/useOnboarding";
import { SAMPLE_DOCUMENT_CONTENT } from "@/lib/sample-document";
import { WelcomeBar } from "@/components/onboarding/WelcomeBar";
import { OnboardingToast } from "@/components/onboarding/OnboardingToast";

const showUIFork = import.meta.env.MODE !== "production";

// WebKit scrolls the reader container when a mark mutation detaches the live
// DOM selection mid-dispatch — pin scrollTop across it so highlighting,
// removing, or undoing a highlight never jumps the page.
function dispatchPreservingScroll(editor: Editor, tr: Transaction): void {
  const el = document.querySelector("[data-scroll-container]");
  const top = el instanceof HTMLElement ? el.scrollTop : 0;
  editor.view.dispatch(tr);
  if (el instanceof HTMLElement) {
    el.scrollTop = top;
    requestAnimationFrame(() => {
      el.scrollTop = top;
    });
  }
}

export default function App() {
  const { settings, setSetting } = useSettings();
  const doc = useDocument();
  const annotations = useAnnotations(doc.refreshRecentDocs, settings.persistCorrections);
  const keepLocal = useKeepLocal();
  const search = useSearch();
  const onboarding = useOnboarding();
  const [onboardingToast, setOnboardingToast] = useState<string | null>(null);
  const updater = useUpdater();
  const [editor, setEditor] = useState<Editor | null>(null);
  const toc = useTableOfContents(editor, doc.currentDoc?.id);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<Section | undefined>();
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [focusHighlightId, setFocusHighlightId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [autoFocusNew, setAutoFocusNew] = useState(false);
  const [polarityMap, setPolarityMap] = useState<Map<string, "positive" | "corrective">>(new Map());
  const [rationaleMap, setRationaleMap] = useState<Map<string, string>>(new Map());
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [errorToast, setErrorToast] = useState<{ message: string; id: number } | null>(null);
  const errorIdRef = useRef(0);
  const undoIdRef = useRef(0);
  const highlightThread = useAnimatedPresence(!!focusHighlightId, 200);
  const lastHighlightRef = useRef<{ highlight: import("@/types/annotations").Highlight; notes: import("@/types/annotations").MarginNote[]; anchorRect: DOMRect | null } | null>(null);
  const diffReview = useDiffReview();
  const [diffControlState, setDiffControlState] = useState<{ changeId: string; top: number; right: number } | null>(null);
  const diffReviewDocIdRef = useRef<string | null>(null);

  // Keep last valid highlight data for exit animation
  if (focusHighlightId && annotations.isLoaded) {
    const highlight = annotations.highlights.find((h) => h.id === focusHighlightId);
    if (highlight) {
      const notes = annotations.marginNotes.filter((n) => n.highlight_id === focusHighlightId);
      lastHighlightRef.current = { highlight, notes, anchorRect };
    }
  }

  // Snapshot function for useTabs — captures current active tab state.
  // Reads via a ref because snapshotFn is created before the editor exists.
  const editorRefForSnapshot = useRef<import("@tiptap/core").Editor | null>(null);
  const snapshotFn = useCallback((): SnapshotData => {
    const scrollContainer = document.querySelector("[data-scroll-container]");
    const ed = editorRefForSnapshot.current;
    const fresh = ed && !ed.isDestroyed ? serializeEditorMarkdown(ed) : null;
    return {
      document: doc.currentDoc,
      content: fresh ?? doc.content,
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
    onLastTabClosed: () => {
      // Closing the final tab must clear the editor — otherwise the closed
      // document keeps rendering as a zombie with no tab owning it.
      prevDocIdRef.current = null;
      prevActiveTabIdRef.current = null;
      lastRestoredDocId.current = null;
      doc.restoreFromCache(null, "", null, false);
      annotations.reset();
      setFocusHighlightId(null);
      setAnchorRect(null);
      setAutoFocusNew(false);
    },
  });
  const unsavedDialog = useAnimatedPresence(!!tabsHook.pendingCloseTabId, 200);

  // Cmd+O is now handled by AppShell (opens command palette)


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
            void doc.openRecentDocument(recentDoc);
          } else if (recentDoc.source === "keep-local" && recentDoc.keep_local_id) {
            void keepLocal.getContent(recentDoc.keep_local_id).then((markdown) => {
              void doc.openKeepLocalArticle(recentDoc, markdown);
            }).catch((err: unknown) => {
              console.error("Failed to restore keep-local article:", err);
              setErrorToast({ message: "Could not restore article — is keep-local running?", id: ++errorIdRef.current });
            });
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
        }).catch((err: unknown) => {
          console.error("Failed to restore keep-local article from tab cache:", err);
          setErrorToast({ message: "Could not restore article — is keep-local running?", id: ++errorIdRef.current });
        });
      }
    }
  }, [tabsHook.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load sample document on first run
  useEffect(() => {
    if (onboarding.isFirstRun && onboarding.step !== "complete" && !doc.currentDoc && tabsHook.isReady && tabsHook.tabs.length === 0) {
      doc.setContentExternal(SAMPLE_DOCUMENT_CONTENT);
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
  editorRefForSnapshot.current = editor;

  // Save paths read content straight from the editor (fresh even while the
  // Reader's debounced serialization is pending).
  useEffect(() => {
    doc.registerContentProvider(() => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return null;
      return serializeEditorMarkdown(ed);
    });
    return () => doc.registerContentProvider(null);
  }, [doc.registerContentProvider]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const isRestoringMarksRef = useRef(false);

  // Reset diff review when switching documents
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
    const docId = doc.currentDoc.id;

    const { state } = editor;
    const { tr } = state;
    const markType = state.schema.marks.highlight;
    if (!markType) return;

    // Re-anchor each stored highlight through the 4-tier resolver: stored
    // position → text+context search → context-scored text search → orphan.
    // Stored text/context and the search space share textBetween's "\n" block
    // separators via buildDocTextMap, so multi-paragraph anchors resolve.
    const textMap = buildDocTextMap(state.doc);
    const knownIds = new Set(annotations.highlights.map((h) => h.id));
    const positionUpdates: [string, number, number][] = [];
    let orphaned = 0;

    for (const h of annotations.highlights) {
      const result = resolveAnchor(textMap.flat, {
        text: h.text_content,
        prefix: h.prefix_context ?? "",
        suffix: h.suffix_context ?? "",
        from: docPosToFlat(textMap, h.from_pos),
        to: docPosToFlat(textMap, h.to_pos),
      });
      if (result.confidence === "orphaned") {
        orphaned++;
        continue;
      }
      const markFrom = flatToDocPos(textMap, result.from, "next");
      const markTo = flatToDocPos(textMap, result.to, "prev");
      // The resolved range may now sit inside a context where the mark is
      // disallowed (e.g. the text was wrapped in a code block since the
      // highlight was saved) — only mark the allowed portions.
      const segs = allowedMarkRanges(state.doc, markType, markFrom, markTo);
      if (segs.length === 0) {
        orphaned++;
        continue;
      }
      for (const seg of segs) {
        tr.addMark(seg.from, seg.to, markType.create({ color: h.color, highlightId: h.id }));
      }
      const appliedTo = segs[segs.length - 1]!.to;
      if (markFrom !== h.from_pos || appliedTo !== h.to_pos) {
        positionUpdates.push([h.id, markFrom, appliedTo]);
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

    // Persist where the marks actually landed so stored positions reflect the
    // edited document instead of drifting further stale.
    if (positionUpdates.length > 0) {
      annotationsRef.current.updatePositions(positionUpdates).catch((err: unknown) => {
        console.error("Failed to sync highlight positions:", err);
      });
    }

    // Stored text not found anywhere — the annotation lost its anchor.
    if (orphaned > 0) {
      reportError(
        `${orphaned} highlight${orphaned === 1 ? "" : "s"} could not be located — the text may have been edited or removed`
      );
    }

    // If the editor DOM has <mark> tags without a backing row (from HTML baked
    // into the file), re-create DB records so clicks and notes work again.
    // Runs whether or not the doc has other highlights — partial orphans count.
    if (recoveredDocIds.current.has(docId)) return;
    recoveredDocIds.current.add(docId);
    // Wait for the DOM to reflect the marks just dispatched
    requestAnimationFrame(() => {
      const unbackedMarks = [...editor.view.dom.querySelectorAll("mark[data-color]")].filter((m) => {
        const id = (m as HTMLElement).dataset.highlightId;
        return !id || !knownIds.has(id);
      });
      if (unbackedMarks.length === 0) return;
      const recoverOrphans = async () => {
        const { state: s } = editor;
        const markT = s.schema.marks.highlight;
        if (!markT) return;
        const { tr: recoverTr } = s;
        const map = buildDocTextMap(s.doc);
        let failed = 0;

        for (const domMark of unbackedMarks) {
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
            failed++;
            continue;
          }

          // Context lives in flat-text space — convert PM positions first.
          const flatFrom = docPosToFlat(map, from);
          const flatTo = docPosToFlat(map, to);
          const prefix = map.flat.substring(Math.max(0, flatFrom - 50), flatFrom);
          const suffix = map.flat.substring(flatTo, Math.min(map.flat.length, flatTo + 50));

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
            knownIds.add(highlight.id);
          } catch (err) {
            console.error("Failed to recover orphan highlight:", err);
            failed++;
          }
        }

        if (failed > 0) {
          reportError(
            `${failed} highlight${failed === 1 ? "" : "s"} could not be recovered in this document`
          );
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
  }, [editor, annotations.isLoaded, annotations.highlights, doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap onUpdate to suppress dirty state during mark restoration
  const handleEditorUpdate = useCallback((md: string) => {
    if (diffReviewRef.current.mode !== "idle") return;
    if (isRestoringMarksRef.current) return;
    doc.setContent(md);
  }, [doc.setContent]);

  const isSelfSaveRef = useRef(doc.isSelfSave);
  isSelfSaveRef.current = doc.isSelfSave;

  const handleFileChanged = useCallback(async (path: string) => {
    const currentDoc = currentDocRef.current;
    if (!currentDoc || currentDoc.file_path !== path) return;

    // Skip reload when we initiated the save — avoids cursor jump
    if (isSelfSaveRef.current(path)) return;

    try {
      const newContent = await readFile(path);
      if (currentDocRef.current?.id !== currentDoc.id) return;
      const oldContent = contentRef.current;
      const wasActive = diffReviewRef.current.mode !== "idle";
      const entered = diffReviewRef.current.enterPending(oldContent, newContent);
      if (entered) {
        diffReviewDocIdRef.current = currentDoc.id;
      } else if (wasActive) {
        diffReviewRef.current.reset();
        diffReviewDocIdRef.current = null;
        setDiffControlState(null);
      }
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
      console.error("Failed to reload file:", err);
      setErrorToast({ message: `Could not reload file after external change: ${err instanceof Error ? err.message : String(err)}`, id: ++errorIdRef.current });
    }
  }, []);

  useFileWatcher(doc.filePath, handleFileChanged);

  // Components outside App's state tree surface errors through the error bus
  useEffect(() => {
    return subscribeErrors((message) => {
      setErrorToast({ message, id: ++errorIdRef.current });
    });
  }, []);

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
    stat(currentPath)
      .then((info) => {
        if (info.mtime) lastMtimeRef.current = info.mtime.getTime();
      })
      .catch(() => {});

    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) return;
      stat(currentPath)
        .then((info) => {
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
        .catch(() => {});
    });

    return () => { void unlisten.then((fn) => fn()); };
  }, [doc.filePath, handleFileChanged]);

  // Diff resolution: when review transitions to idle, apply final content
  const prevDiffModeRef = useRef(diffReview.mode);
  useEffect(() => {
    const prevMode = prevDiffModeRef.current;
    prevDiffModeRef.current = diffReview.mode;
    if (diffReview.mode === "idle" && (prevMode === "pending" || prevMode === "reviewing")) {
      const currentDoc = currentDocRef.current;
      if (!currentDoc) return;
      if (!diffReviewDocIdRef.current) return;
      if (diffReviewDocIdRef.current !== currentDoc.id) return;
      const finalContent = diffReview.getFinalContent();
      const hasAccepted = diffReview.changes.some((c) => c.status === "accepted");
      const hasRejected = diffReview.changes.some((c) => c.status === "rejected");
      if (hasRejected) {
        doc.setContent(finalContent);
      } else {
        setContentExternalRef.current(finalContent);
      }
      const ed = editorRef.current;
      if (ed && !ed.isDestroyed) {
        isRestoringMarksRef.current = true;
        try {
          ed.commands.setContent(finalContent);
        } finally {
          isRestoringMarksRef.current = false;
        }
      }
      if (hasAccepted) {
        lastRestoredDocId.current = currentDoc.id;
      }
      diffReviewDocIdRef.current = null;
      diffReview.reset();
      setDiffControlState(null);
    }
  }, [diffReview.mode, diffReview.changes, diffReview.getFinalContent, diffReview.reset, doc.setContent]);

  // Toggle editor editable based on diff review mode
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(diffReview.mode === "idle", false);
  }, [editor, diffReview.mode]);

  const diffControlFromElement = useCallback((changeId: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setDiffControlState({ changeId, top: rect.top, right: window.innerWidth - rect.right + 8 });
  }, []);

  // Scroll to current change and show controls during review
  useEffect(() => {
    if (diffReview.mode !== "reviewing") return;
    const change = diffReviewRef.current.changes[diffReview.currentIndex];
    if (!change) return;
    const frameId = requestAnimationFrame(() => {
      const scrollContainer = document.querySelector("[data-scroll-container]");
      const el = scrollContainer?.querySelector(`[data-change-id="${change.id}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: "center" });
        diffControlFromElement(change.id, el);
      } else {
        setDiffControlState(null);
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [diffReview.mode, diffReview.currentIndex]);

  // Diff-click event handler + scroll dismiss
  useEffect(() => {
    if (diffReview.mode !== "reviewing") return;
    const handleDiffClick = (e: Event) => {
      const { changeId, element } = (e as CustomEvent).detail;
      if (!changeId || !element) return;
      diffControlFromElement(changeId, element as HTMLElement);
    };
    const scrollContainer = document.querySelector("[data-scroll-container]");
    const handleScroll = () => setDiffControlState(null);
    window.addEventListener("margin:diff-click", handleDiffClick);
    scrollContainer?.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("margin:diff-click", handleDiffClick);
      scrollContainer?.removeEventListener("scroll", handleScroll);
    };
  }, [diffReview.mode]);

  // Handle files opened via macOS "Open With" / double-click
  const openFilePathRef = useRef(doc.openFilePath);
  openFilePathRef.current = doc.openFilePath;

  useEffect(() => {
    drainPendingOpenFiles().then((paths) => {
      const lastPath = paths[paths.length - 1];
      if (lastPath) {
        void openFilePathRef.current(lastPath);
      }
    }).catch((err: unknown) => {
      console.error("Failed to drain pending open files:", err);
      setErrorToast({ message: "Could not open dropped file", id: ++errorIdRef.current });
    });

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
        dispatchPreservingScroll(editor, tr);
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
              dispatchPreservingScroll(currentEditor, restoreTr);
            }
          }
          // Re-open the thread
          setFocusHighlightId(restored.id);
        } catch (err) {
          console.error("Failed to undo highlight delete:", err);
          setErrorToast({ message: `Could not restore highlight: ${err instanceof Error ? err.message : String(err)}`, id: ++errorIdRef.current });
        }
        setUndoAction(null);
      },
      onCommit: () => setUndoAction(null),
    });
  }, [editor, annotations]);

  const handleEditorReady = useCallback((ed: Editor) => {
    setEditor(ed);
  }, []);

  // Persist a highlight over [from, to): split into ranges the schema accepts
  // (code blocks / inline code reject marks — addMark would silently drop them
  // while a DB row still landed), reconcile rows for any existing marks the new
  // range overwrites, then apply all marks in one transaction.
  // Returns the ids of the rows that now own the ranges, in document order.
  const persistHighlight = useCallback(
    async (color: string, from: number, to: number): Promise<string[]> => {
      if (!editor || !doc.currentDoc) return [];
      const markType = editor.state.schema.marks.highlight;
      if (!markType) return [];

      const ranges = allowedMarkRanges(editor.state.doc, markType, from, to);
      if (ranges.length === 0) {
        reportError("Highlights can't be applied inside code");
        return [];
      }

      const { state } = editor;
      const docId = doc.currentDoc.id;
      const textMap = buildDocTextMap(state.doc);
      const knownIds = new Set(annotationsRef.current.highlights.map((h) => h.id));
      const markOps: Array<{ from: number; to: number; color: string; id: string }> = [];
      const ids: string[] = [];

      // Anchors are built in the flattened "\n"-separated text space so stored
      // context matches what the restore-time resolver searches for.
      const anchorFor = (rFrom: number, rTo: number) =>
        createAnchor(textMap.flat, docPosToFlat(textMap, rFrom), docPosToFlat(textMap, rTo));

      try {
        for (const range of ranges) {
          const plan = planHighlightOverlap(state.doc, "highlight", range.from, range.to, knownIds);
          const anchor = anchorFor(range.from, range.to);
          const textContent = state.doc.textBetween(range.from, range.to, "\n");

          let highlightId: string;
          if (plan.reuse) {
            // Recolor/extend: update the covered row in place so its margin
            // notes survive and no ghost row is left behind.
            await annotationsRef.current.updateHighlight({
              id: plan.reuse.id,
              color,
              textContent,
              fromPos: range.from,
              toPos: range.to,
              prefixContext: anchor.prefix,
              suffixContext: anchor.suffix,
            });
            highlightId = plan.reuse.id;
          } else {
            const created = await annotationsRef.current.createHighlight({
              documentId: docId,
              color,
              textContent,
              fromPos: range.from,
              toPos: range.to,
              prefixContext: anchor.prefix,
              suffixContext: anchor.suffix,
            });
            highlightId = created.id;
            knownIds.add(created.id);
          }
          ids.push(highlightId);
          markOps.push({ from: range.from, to: range.to, color, id: highlightId });

          // Other fully-covered rows: their marks are overwritten — delete them.
          for (const deadId of plan.deleteIds) {
            await annotationsRef.current.deleteHighlight(deadId);
            knownIds.delete(deadId);
          }

          // Partially covered rows shrink to their remaining piece; the marks
          // outside the new range already carry the right id.
          for (const s of plan.shrink) {
            const sAnchor = anchorFor(s.from, s.to);
            await annotationsRef.current.updateHighlight({
              id: s.id,
              color: s.color,
              textContent: state.doc.textBetween(s.from, s.to, "\n"),
              fromPos: s.from,
              toPos: s.to,
              prefixContext: sAnchor.prefix,
              suffixContext: sAnchor.suffix,
            });
          }

          // A row split on both sides leaves a second piece — sibling row +
          // mark restamp so it keeps a backing row.
          for (const c of plan.clone) {
            const cAnchor = anchorFor(c.from, c.to);
            const sibling = await annotationsRef.current.createHighlight({
              documentId: docId,
              color: c.color,
              textContent: state.doc.textBetween(c.from, c.to, "\n"),
              fromPos: c.from,
              toPos: c.to,
              prefixContext: cAnchor.prefix,
              suffixContext: cAnchor.suffix,
            });
            knownIds.add(sibling.id);
            markOps.push({ from: c.from, to: c.to, color: c.color, id: sibling.id });
          }
        }
      } catch (err) {
        console.error("Failed to save highlight:", err, "documentId:", docId);
        reportError(`Could not save highlight: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (markOps.length > 0) {
        const tr = editor.state.tr;
        for (const op of markOps) {
          tr.addMark(op.from, op.to, markType.create({ color: op.color, highlightId: op.id }));
        }
        tr.setMeta("addToHistory", false);
        dispatchPreservingScroll(editor, tr);
      }
      return ids;
    },
    [editor, doc.currentDoc],
  );

  const handleHighlight = useCallback(
    async (color?: string) => {
      const resolvedColor = color ?? settings.defaultHighlightColor;
      if (!editor) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;

      // Onboarding: visual-only highlight, no persistence
      if (!doc.currentDoc) {
        const markType = editor.state.schema.marks.highlight;
        if (markType) {
          const tr = editor.state.tr.addMark(
            from, to,
            markType.create({ color: resolvedColor }),
          );
          tr.setMeta("addToHistory", false);
          dispatchPreservingScroll(editor, tr);
        }
        if (onboarding.step === "welcome") {
          onboarding.advanceToHighlighted();
          setOnboardingToast("Highlight saved \u2014 the note panel opens automatically once you open a file (\u2318O).");
        } else if (onboarding.step === "highlighted") {
          onboarding.advanceToNoted();
          setOnboardingToast("Annotations saved. Open more files with \u2318O.");
        }
        return;
      }

      const ids = await persistHighlight(resolvedColor, from, to);
      const highlightId = ids[0];
      if (!highlightId) return;

      // Highlighting is the first step of noting, not a separate gesture —
      // open the thread immediately, focused on the new-note field (SAM-1144).
      requestAnimationFrame(() => {
        const mark = editor.view.dom.querySelector(
          `mark[data-highlight-id="${highlightId}"]`,
        );
        if (mark) {
          setAnchorRect(mark.getBoundingClientRect());
        }
        setFocusHighlightId(highlightId);
        setAutoFocusNew(true);
      });
    },
    [editor, doc.currentDoc, persistHighlight, settings.defaultHighlightColor, onboarding],
  );
  // Recolor from the thread's swatch row: update the row in place (notes and
  // anchors survive) and retint the mark. PM marks are immutable, so the mark
  // is removed and re-added with the new color attr.
  const handleRecolor = useCallback(
    async (highlightId: string, color: string) => {
      const h = annotationsRef.current.highlights.find((x) => x.id === highlightId);
      if (!h || h.color === color) return;
      try {
        await annotationsRef.current.updateHighlight({
          id: h.id,
          color,
          textContent: h.text_content,
          fromPos: h.from_pos,
          toPos: h.to_pos,
          prefixContext: h.prefix_context,
          suffixContext: h.suffix_context,
        });
      } catch (err) {
        console.error("Failed to recolor highlight:", err);
        setErrorToast({
          message: `Could not change highlight color: ${err instanceof Error ? err.message : String(err)}`,
          id: ++errorIdRef.current,
        });
        return;
      }

      const currentEditor = editorRef.current;
      if (!currentEditor || currentEditor.isDestroyed) return;
      const markType = currentEditor.state.schema.marks.highlight;
      if (!markType) return;
      const tr = currentEditor.state.tr;
      currentEditor.state.doc.descendants((node, pos) => {
        if (!node.isText) return;
        const mark = node.marks.find(
          (m) => m.type.name === "highlight" && m.attrs.highlightId === highlightId,
        );
        if (mark) {
          tr.removeMark(pos, pos + node.nodeSize, mark);
          tr.addMark(pos, pos + node.nodeSize, markType.create({ ...mark.attrs, color }));
        }
      });
      tr.setMeta("addToHistory", false);
      if (tr.steps.length > 0) {
        currentEditor.view.dispatch(tr);
      }
    },
    [],
  );

  // Remove every highlight whose mark intersects the selection. Rows are
  // deleted whole (same semantics as the thread's Remove button); idless
  // visual-only marks are cleared within the selection only. One undo toast
  // covers the batch.
  const handleRemoveHighlights = useCallback(async () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) return;

    const markType = editor.state.schema.marks.highlight;
    if (!markType) return;

    const { ids, hasUnbacked } = collectMarkIdsInRange(editor.state.doc, "highlight", from, to);
    if (ids.size === 0 && !hasUnbacked) return;

    const removed = highlightsRef.current.filter((h) => ids.has(h.id));

    try {
      for (const id of ids) {
        await annotationsRef.current.deleteHighlight(id);
      }
    } catch (err) {
      console.error("Failed to remove highlight:", err);
      setErrorToast({
        message: `Could not remove highlight: ${err instanceof Error ? err.message : String(err)}`,
        id: ++errorIdRef.current,
      });
      return;
    }

    if (focusHighlightId && ids.has(focusHighlightId)) {
      setFocusHighlightId(null);
      setAnchorRect(null);
      setAutoFocusNew(false);
    }

    const { state } = editor;
    const tr = state.tr;
    state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const mark = node.marks.find((m) => m.type.name === "highlight");
      if (!mark) return;
      const id = mark.attrs.highlightId as string | null;
      if (id && ids.has(id)) {
        // Backed highlight — remove the whole mark, not just the in-range part
        tr.removeMark(pos, pos + node.nodeSize, mark);
      } else if (!id) {
        // Visual-only mark — clear only where it intersects the selection
        const s = Math.max(pos, from);
        const e = Math.min(pos + node.nodeSize, to);
        if (s < e) tr.removeMark(s, e, mark);
      }
    });
    if (tr.steps.length > 0) {
      editor.view.dispatch(tr);
    }

    if (removed.length === 0) return;

    setUndoAction({
      id: String(++undoIdRef.current),
      message:
        removed.length === 1
          ? "Highlight deleted"
          : `${removed.length} highlights deleted`,
      onUndo: async () => {
        const currentEditor = editorRef.current;
        for (const h of removed) {
          try {
            const restored = await annotationsRef.current.createHighlight({
              documentId: h.document_id,
              color: h.color,
              textContent: h.text_content,
              fromPos: h.from_pos,
              toPos: h.to_pos,
              prefixContext: h.prefix_context,
              suffixContext: h.suffix_context,
            });
            if (currentEditor && !currentEditor.isDestroyed) {
              const mt = currentEditor.state.schema.marks.highlight;
              if (mt) {
                const restoreTr = currentEditor.state.tr;
                restoreTr.addMark(
                  h.from_pos,
                  h.to_pos,
                  mt.create({ color: h.color, highlightId: restored.id }),
                );
                currentEditor.view.dispatch(restoreTr);
              }
            }
          } catch (err) {
            console.error("Failed to undo highlight delete:", err);
            setErrorToast({
              message: `Could not restore highlight: ${err instanceof Error ? err.message : String(err)}`,
              id: ++errorIdRef.current,
            });
          }
        }
        setUndoAction(null);
      },
      onCommit: () => setUndoAction(null),
    });
  }, [editor, focusHighlightId]);

  // Cmd+Shift+H — apply the default highlight color, or remove highlight when
  // the selection is already fully highlighted (same toggle shape as Cmd+B).
  const handleHighlightChord = useCallback(() => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) return;
    const markType = editor.state.schema.marks.highlight;
    if (markType && rangeFullyMarked(editor.state.doc, markType, from, to)) {
      void handleRemoveHighlights();
    } else {
      void handleHighlight();
    }
  }, [editor, handleHighlight, handleRemoveHighlights]);

  useHighlightShortcut(handleHighlightChord);

  // Complete onboarding when a real file is opened
  useEffect(() => {
    if (doc.currentDoc && onboarding.step !== "complete") {
      onboarding.complete();
      setOnboardingToast(null);
    }
  }, [doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cold-start nudge: after first-run onboarding, if the user has no personal
  // rules yet (only seeds), point them at the style-guide import once.
  useEffect(() => {
    if (onboarding.step !== "complete" || !onboarding.isFirstRun) return;
    if (localStorage.getItem("margin-bootstrap-hinted")) return;
    let cancelled = false;
    getWritingRules()
      .then((rules) => {
        if (cancelled) return;
        localStorage.setItem("margin-bootstrap-hinted", String(Date.now()));
        const personal = rules.some(
          (r) => !r.source.startsWith("seed") && r.source !== "kill-words-seed"
        );
        if (!personal) {
          setOnboardingToast(
            "Teach Margin your style — Settings → Writing rules → Import from style guide"
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [onboarding.step, onboarding.isFirstRun]);

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

  // Native menu items. On macOS the menu accelerators consume the shortcut
  // before the webview sees it, so each id re-dispatches the equivalent
  // keyboard event — one code path whether invoked by menu or by keyboard.
  useEffect(() => {
    const redispatch = (key: string, code: string, shiftKey: boolean) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { metaKey: true, shiftKey, key, code, bubbles: true, cancelable: true }),
      );
    };
    const unlisten = listen<string>("menu-action", (event) => {
      switch (event.payload) {
        case "open-file":
          redispatch("o", "KeyO", false);
          break;
        case "export-annotations":
          redispatch("E", "KeyE", true);
          break;
        case "find":
          redispatch("f", "KeyF", false);
          break;
        case "style-memory":
          redispatch("m", "KeyM", true);
          break;
        case "settings":
          setSettingsSection(undefined);
          setShowSettings(true);
          break;
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Style Memory: Cmd+Shift+M
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

  const handleAcceptEdit = useCallback(
    (highlightId: string, matchText: string, suggestedEdit: string) => {
      if (!editor) return false;
      return applyAcceptedCorrection(
        editor,
        highlightId,
        matchText,
        suggestedEdit,
      );
    },
    [editor],
  );

  const handleExportAnnotations = useCallback(
    async (writingType: string | null): Promise<ExportResult> => {
      if (!editor || !doc.currentDoc) {
        return { highlightCount: 0, noteCount: 0, snippets: [], correctionsSaved: false, correctionsFile: "" };
      }

      const allHighlights = highlightsRef.current;
      const marginNotes = marginNotesRef.current;
      const currentDoc = doc.currentDoc;

      // Only export highlights that haven't been exported yet
      const highlights = allHighlights.filter((h) => h.exported_at == null);

      if (highlights.length === 0) {
        return { highlightCount: 0, noteCount: 0, snippets: [], correctionsSaved: false, correctionsFile: "" };
      }

      // Filter margin notes to only those attached to unexported highlights
      const unexportedHighlightIds = new Set(highlights.map((h) => h.id));
      const unexportedMarginNotes = marginNotes.filter((n) => unexportedHighlightIds.has(n.highlight_id));

      const markdown = await formatAnnotationsMarkdown({
        document: currentDoc,
        editor,
        highlights,
        marginNotes: unexportedMarginNotes,
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
      let attemptedCorrectionPersist = false;
      let correctionCount = 0;
      let promptCount = 0;
      let noteOnlyCount = 0;

      if (persistCorrectionsRef.current && highlights.length > 0 && unexportedMarginNotes.length > 0) {
        const exportInputs = buildCorrectionExportInputs({
          highlights,
          marginNotes: unexportedMarginNotes,
          writingType,
          polarityMap,
          rationaleMap,
          getExtendedContext: (h) => getExtendedContext(editor, h.from_pos, h.to_pos),
        });
        const correctionInputs: CorrectionInput[] = exportInputs.inputs;
        correctionCount = exportInputs.correctionCount;
        promptCount = exportInputs.promptCount;
        noteOnlyCount = exportInputs.noteOnlyCount;

        if (correctionInputs.length > 0) {
          attemptedCorrectionPersist = true;
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
            exportWritingRules().catch((err: unknown) => {
              console.error("Auto-export writing rules failed:", err);
              setErrorToast({ message: `Writing rules export failed: ${err instanceof Error ? err.message : String(err)}`, id: ++errorIdRef.current });
            });
          } catch (err) {
            console.error("Failed to persist corrections:", err);
            setErrorToast({ message: `Corrections were not saved: ${err instanceof Error ? err.message : String(err)}. Highlights kept so you can retry.`, id: ++errorIdRef.current });
          }
        }
      }

      // Mark exported highlights in DB (skip if correction persist failed)
      const shouldMarkExported = shouldClearAnnotationsAfterExport({
        highlightCount: highlights.length,
        attemptedCorrectionPersist,
        correctionsSaved,
      });
      if (shouldMarkExported) {
        // Mark highlights as exported in DB (keep them visible in the editor)
        const exportedIds = highlights.map((h) => h.id);
        await markHighlightsExported(exportedIds);

        // Reload annotations from DB so React state reflects the new exported_at values
        await annotationsRef.current.loadAnnotations(currentDoc.id);

        // Close any open highlight popover
        setFocusHighlightId(null);
        setAnchorRect(null);

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
      setRationaleMap(new Map());

      return {
        highlightCount: highlights.length,
        noteCount: unexportedMarginNotes.length,
        snippets,
        correctionsSaved,
        correctionsFile,
        sentToClaude: mcpResult.sent,
        positiveCount,
        correctiveCount,
        correctionCount,
        promptCount,
        noteOnlyCount,
      };
    },
    [editor, doc.currentDoc, polarityMap, rationaleMap],
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
    <>
    <AppShell
      onOpenSettings={() => {
        setSettingsSection(undefined);
        setShowSettings(true);
      }}
      currentDoc={doc.currentDoc}
      recentDocs={doc.recentDocs}
      onSelectRecentDoc={handleSelectRecentDoc}
      onExport={() => setShowExportPopover(true)}
      onOpenFilePath={(path: string, newTab: boolean) => {
        openAsNewTabRef.current = newTab;
        tabsHook.snapshotActive();
        void doc.openFilePath(path);
      }}
      tabs={tabsHook.tabs}
      activeTabId={tabsHook.activeTabId}
      onSelectTab={tabsHook.switchTab}
      onCloseTab={tabsHook.closeTab}
      onReorderTabs={tabsHook.reorderTabs}
      editor={editor}
      findBarOpen={findBarOpen}
      onCloseFindBar={() => setFindBarOpen(false)}
      onOpenFind={() => setFindBarOpen(true)}
      welcomeBar={
        onboarding.step === "welcome" ? (
          <WelcomeBar visible onDismiss={onboarding.dismissWelcome} />
        ) : undefined
      }
      hasSampleContent={onboarding.step !== "complete" && !doc.currentDoc && doc.content.length > 0}
      tocElement={
        doc.currentDoc && toc.headings.length > 0 ? (
          <TableOfContents
            headings={toc.headings}
            activeHeadingId={toc.activeHeadingId}
            onScrollToHeading={toc.scrollToHeading}
          />
        ) : undefined
      }
      readerControls={
        <ReaderControls settings={settings} setSetting={setSetting} />
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
          onDirtyEdit={doc.markDirty}
          isLoading={doc.isLoading}
          onEditorReady={handleEditorReady}
        />
      </Suspense>

      <FloatingToolbar
        editor={editor}
        onHighlight={handleHighlight}
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
            onAddNote={(highlightId, content) => {
              void annotations.createMarginNoteWithIntent(highlightId, content, "correction").catch((err: unknown) => {
                console.error("Failed to save feedback note:", err);
                setErrorToast({
                  message: `Could not save feedback: ${err instanceof Error ? err.message : String(err)}`,
                  id: ++errorIdRef.current,
                });
              });
            }}
            onUpdateNote={(noteId, content) => {
              void annotations.updateMarginNote(noteId, content).catch((err: unknown) => {
                console.error("Failed to update feedback note:", err);
                setErrorToast({
                  message: `Could not update feedback: ${err instanceof Error ? err.message : String(err)}`,
                  id: ++errorIdRef.current,
                });
              });
            }}
            onDeleteNote={(noteId) => {
              void annotations.deleteMarginNote(noteId).catch((err: unknown) => {
                console.error("Failed to delete feedback note:", err);
                setErrorToast({
                  message: `Could not delete feedback: ${err instanceof Error ? err.message : String(err)}`,
                  id: ++errorIdRef.current,
                });
              });
            }}
            onDeleteHighlight={handleDeleteHighlight}
            onRecolor={handleRecolor}
            onClose={() => {
              // Highlights are provisional until they carry a note — a mark
              // with no judgment is noise, so closing noteless removes it
              // (select-to-copy and dismissed selections stay clean).
              if (focusHighlightId) {
                const hasNotes = annotationsRef.current.marginNotes.some(
                  (n) => n.highlight_id === focusHighlightId,
                );
                if (!hasNotes) void handleDeleteHighlight(focusHighlightId);
              }
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
        hasMarginNotes={annotations.marginNotes.length > 0}
        onOpenSettings={() => {
          setSettingsSection("writing");
          setShowSettings(true);
        }}
      />

      <UndoToast action={undoAction} />
      <ErrorToast key={errorToast?.id} message={errorToast?.message ?? null} />
      <OnboardingToast
        message={onboardingToast}
        duration={onboardingToast?.includes("⌘O") ? 6000 : 5000}
        onDismiss={() => setOnboardingToast(null)}
      />

      {/* Unsaved changes dialog */}
      {unsavedDialog.isMounted && (() => {
        const tab = tabsHook.tabs.find((t) => t.id === tabsHook.pendingCloseTabId);
        if (!tab) return null;
        return (
          <UnsavedChangesDialog
            title={tab.title}
            isVisible={unsavedDialog.isVisible}
            onCancel={tabsHook.cancelCloseTab}
            onCloseWithoutSaving={() => tabsHook.forceCloseTab(tabsHook.pendingCloseTabId!)}
            onSaveAndClose={async () => {
              await doc.saveCurrentFile();
              tabsHook.forceCloseTab(tabsHook.pendingCloseTabId!);
            }}
          />
        );
      })()}

      {showSettings && (
        <div
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "var(--color-page)" }}
        >
          <Suspense fallback={null}>
          <SettingsPage
            settings={settings}
            setSetting={setSetting}
            onClose={() => {
              setShowSettings(false);
              setSettingsSection(undefined);
            }}
            updater={updater}
            initialSection={settingsSection}
            onAcceptEdit={handleAcceptEdit}
          />
          </Suspense>
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
            fontSize: "var(--text-xs)",
            fontFamily: "'Inter', system-ui, sans-serif",
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
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              fontFamily: "'Inter', system-ui, sans-serif",
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
                fontSize: "var(--text-base)",
                lineHeight: 1,
              }}
              aria-label="Dismiss"
            >
              &times;
            </button>
          )}
          {updater.error && (
            <span style={{ color: "var(--color-danger-text)", fontSize: "var(--text-xs)" }}>
              {updater.error}
            </span>
          )}
        </div>
      )}
    </AppShell>
      {showUIFork && <UIFork />}
    </>
  );
}
