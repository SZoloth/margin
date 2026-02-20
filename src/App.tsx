import { useState, useCallback, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { AppShell } from "@/components/layout/AppShell";
import { Reader } from "@/components/editor/Reader";
import { FloatingToolbar } from "@/components/editor/FloatingToolbar";
import { MarginNotePanel } from "@/components/editor/MarginNotePanel";
import { CommentThreadPanel } from "@/components/editor/CommentThreadPanel";
import { useDocument } from "@/hooks/useDocument";
import { useAnnotations } from "@/hooks/useAnnotations";
import { createAnchor } from "@/lib/text-anchoring";
import type { HighlightColor } from "@/types/annotations";

export default function App() {
  const doc = useDocument();
  const annotations = useAnnotations();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const editorElementRef = useRef<HTMLElement | null>(null);

  // Load annotations when document changes
  useEffect(() => {
    if (doc.currentDoc) {
      void annotations.loadAnnotations(doc.currentDoc.id);
    }
  }, [doc.currentDoc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

      // Apply the highlight mark in the editor
      editor.chain().focus().setHighlight({ color }).run();

      // Persist to database
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

    // Apply comment thread mark
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

  return (
    <AppShell
      currentDoc={doc.currentDoc}
      onOpenFile={doc.openFile}
      isDirty={doc.isDirty}
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
