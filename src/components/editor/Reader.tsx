import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Typography from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef } from "react";
import "../../styles/editor.css";

interface ReaderProps {
  content: string;
  onUpdate: (content: string) => void;
  isLoading: boolean;
}

export function Reader({ content, onUpdate, isLoading }: ReaderProps) {
  const isExternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Typography,
      Highlight.configure({ multicolor: true }),
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
    if (!editor || editor.isDestroyed) return;

    const currentMd = editor.storage.markdown.getMarkdown() as string;
    if (currentMd === content) return;

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
