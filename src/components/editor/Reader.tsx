import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Typography from "@tiptap/extension-typography";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";
import { MultiColorHighlight } from "./extensions/highlight";
import { MarginNote } from "./extensions/margin-note";
import "../../styles/editor.css";

interface ReaderProps {
  content: string;
  onUpdate: (content: string) => void;
  isLoading: boolean;
  onEditorReady?: (editor: Editor) => void;
}

export function Reader({ content, onUpdate, isLoading, onEditorReady }: ReaderProps) {
  const isExternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Typography,
      MultiColorHighlight.configure({ multicolor: true }),
      MarginNote,
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: "tight",
        bulletListMarker: "-",
        linkify: false,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "reader-content",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (isExternalUpdate.current) return;
      const md = ed.storage.markdown.getMarkdown();
      onUpdate(md as string);
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const currentMd = editor.storage.markdown.getMarkdown() as string;
    if (currentMd === content) return;

    // If the only difference is that the editor has mark HTML (e.g. <mark ...>)
    // from programmatic highlight restoration, skip the setContent call —
    // it would wipe those marks and lose data-highlight-id attributes.
    const stripMarks = (s: string) =>
      s.replace(/<\/?mark[^>]*>/g, "");
    if (stripMarks(currentMd) === stripMarks(content)) return;

    isExternalUpdate.current = true;
    editor.commands.setContent(content);
    isExternalUpdate.current = false;
  }, [content, editor]);

  if (isLoading) {
    return (
      <div className="reader-content" style={{ opacity: 0.5 }}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return <EditorContent editor={editor} />;
}

export default Reader;
