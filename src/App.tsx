import { useState, useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { AppShell } from "@/components/layout/AppShell";
import { Reader } from "@/components/editor/Reader";
import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import { MarginNotePanel } from "@/components/editor/MarginNotePanel";
import { CommentThreadPanel } from "@/components/editor/CommentThreadPanel";
import { useDocument } from "@/hooks/useDocument";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useKeepLocal } from "@/hooks/useKeepLocal";
import { useFileWatcher } from "@/hooks/useFileWatcher";
import { useSearch } from "@/hooks/useSearch";
import { createAnchor } from "@/lib/text-anchoring";
import { readFile } from "@/lib/tauri-commands";
import type { HighlightColor } from "@/types/annotations";
import type { KeepLocalItem } from "@/types/keep-local";
import type { Document } from "@/types/document";

export default function App() {
  const doc = useDocument();
  const annotations = useAnnotations();
  const keepLocal = useKeepLocal();
  const search = useSearch();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const editorElementRef = useRef<HTMLElement | null>(null);

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

  // File watcher: reload content on external changes
  // Use ref to avoid recreating the callback (which would cause useFileWatcher to re-subscribe)
  const currentDocRef = useRef(doc.currentDoc);
  currentDocRef.current = doc.currentDoc;
  const setContentExternalRef = useRef(doc.setContentExternal);
  setContentExternalRef.current = doc.setContentExternal;

  const handleFileChanged = useCallback(async (path: string) => {
    const currentDoc = currentDocRef.current;
    if (!currentDoc || currentDoc.file_path !== path) return;
    try {
      const newContent = await readFile(path);
      setContentExternalRef.current(newContent);
    } catch (err) {
      console.error("Failed to reload file:", err);
    }
  }, []);

  useFileWatcher(doc.filePath, handleFileChanged);

  const handleEditorReady = useCallback((ed: Editor) => {
    setEditor(ed);
    editorElementRef.current = ed.view.dom;
  }, []);

  const handleHighlight = useCallback(
    async (color: HighlightColor) => {
      if (!editor || !doc.currentDoc) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;

      const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
      const selectedText = editor.state.doc.textBetween(from, to, "\n");
      const anchor = createAnchor(fullText, from, to);

      editor.chain().focus().setHighlight({ color }).run();

      await annotations.createHighlight({
        documentId: doc.currentDoc.id,
        color,
        textContent: selectedText,
        fromPos: from,
        toPos: to,
        prefixContext: anchor.prefix,
        suffixContext: anchor.suffix,
      });
    },
    [editor, doc.currentDoc, annotations],
  );

  const handleComment = useCallback(async () => {
    if (!editor || !doc.currentDoc) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    const anchor = createAnchor(fullText, from, to);

    const threadId = crypto.randomUUID();
    editor
      .chain()
      .focus()
      .setMark("commentThread", { threadId, resolved: false })
      .run();

    const thread = await annotations.createCommentThread({
      documentId: doc.currentDoc.id,
      textContent: selectedText,
      fromPos: from,
      toPos: to,
      prefixContext: anchor.prefix,
      suffixContext: anchor.suffix,
    });

    setActiveThreadId(thread.id);
  }, [editor, doc.currentDoc, annotations]);

  // Open a keep-local article
  const handleSelectKeepLocalItem = useCallback(
    async (item: KeepLocalItem) => {
      try {
        const markdown = await keepLocal.getContent(item.id);
        const now = Date.now();

        const docRecord: Document = {
          id: crypto.randomUUID(),
          source: "keep-local",
          file_path: null,
          keep_local_id: item.id,
          title: item.title ?? "Untitled",
          author: item.author ?? null,
          url: item.url,
          word_count: item.wordCount,
          last_opened_at: now,
          created_at: now,
        };

        await doc.openKeepLocalArticle(docRecord, markdown);
        // indexDocument uses the saved doc's ID (which may be reused from a previous open)
        if (doc.currentDoc) {
          void search.indexDocument(doc.currentDoc.id, doc.currentDoc.title ?? "Untitled", markdown);
        }
      } catch (err) {
        console.error("Failed to open keep-local article:", err);
      }
    },
    [keepLocal, doc, search]
  );

  return (
    <AppShell
      currentDoc={doc.currentDoc}
      recentDocs={doc.recentDocs}
      onOpenFile={doc.openFile}
      isDirty={doc.isDirty}
      keepLocal={keepLocal}
      onSelectKeepLocalItem={handleSelectKeepLocalItem}
      search={search}
    >
      <div className="relative">
        <Reader
          content={doc.content}
          onUpdate={doc.setContent}
          isLoading={doc.isLoading}
          onEditorReady={handleEditorReady}
        />

        <FloatingToolbar
          editor={editor}
          onHighlight={handleHighlight}
          onComment={handleComment}
        />

        {annotations.isLoaded && (
          <MarginNotePanel
            highlights={annotations.highlights}
            marginNotes={annotations.marginNotes}
            onAddNote={annotations.createMarginNote}
            onUpdateNote={annotations.updateMarginNote}
            onDeleteNote={annotations.deleteMarginNote}
            editorElement={editorElementRef.current}
          />
        )}

        {activeThreadId && (
          <CommentThreadPanel
            threads={annotations.commentThreads}
            activeThreadId={activeThreadId}
            onSelectThread={setActiveThreadId}
            onResolve={annotations.resolveCommentThread}
            onDelete={async (id) => {
              await annotations.deleteCommentThread(id);
              setActiveThreadId(null);
            }}
            onAddComment={async (threadId, content) => { await annotations.addComment(threadId, content); }}
            getComments={annotations.getComments}
          />
        )}
      </div>
    </AppShell>
  );
}
