import { useState, useEffect, useCallback, useRef } from "react";
import type { Editor } from "@tiptap/core";

export interface TocHeading {
  id: string;
  text: string;
  level: number;
  pos: number;
}

export function useTableOfContents(editor: Editor | null, documentId?: string | null) {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract headings from the editor document
  const extractHeadings = useCallback(() => {
    if (!editor) {
      setHeadings([]);
      return;
    }

    const collected: TocHeading[] = [];
    let index = 0;

    editor.state.doc.descendants((node) => {
      if (node.type.name === "heading" && (node.attrs.level === 1 || node.attrs.level === 2)) {
        collected.push({
          id: `heading-${index}`,
          text: node.textContent,
          level: node.attrs.level as number,
          pos: 0, // not used for DOM lookup
        });
        index++;
      }
    });

    setHeadings(collected);
  }, [editor]);

  // Re-extract on editor change and on document updates
  useEffect(() => {
    extractHeadings();

    if (!editor) return;

    const handleUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(extractHeadings, 300);
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor, extractHeadings]);

  // Immediately re-extract when the active document changes (tab switch)
  useEffect(() => {
    if (editor && documentId) {
      // Small delay to let editor content settle after setContent
      requestAnimationFrame(() => extractHeadings());
    }
  }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active heading tracking via IntersectionObserver
  useEffect(() => {
    if (headings.length === 0) {
      setActiveHeadingId(null);
      return;
    }

    const scrollContainer = document.querySelector("[data-scroll-container]");
    if (!scrollContainer) return;

    const headingEls = scrollContainer.querySelectorAll<HTMLElement>(
      ".reader-content h1, .reader-content h2"
    );

    // Zip DOM elements with headings array by index
    const elementToId = new Map<Element, string>();
    headingEls.forEach((el, i) => {
      if (i < headings.length) {
        elementToId.set(el, headings[i]!.id);
      }
    });

    const visibleIds = new Set<string>();

    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = elementToId.get(entry.target);
          if (!id) continue;
          if (entry.isIntersecting) {
            visibleIds.add(id);
          } else {
            visibleIds.delete(id);
          }
        }

        if (visibleIds.size > 0) {
          // Pick the topmost visible heading (lowest index in headings array)
          for (const h of headings) {
            if (visibleIds.has(h.id)) {
              setActiveHeadingId(h.id);
              break;
            }
          }
        }
        // When nothing visible, keep last active (no flicker)
      },
      {
        root: scrollContainer,
        rootMargin: "-10% 0px -80% 0px",
      }
    );

    observerRef.current = observer;
    headingEls.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [headings]);

  const scrollToHeading = useCallback(
    (headingId: string) => {
      const index = headings.findIndex((h) => h.id === headingId);
      if (index === -1) return;

      const scrollContainer = document.querySelector("[data-scroll-container]");
      if (!scrollContainer) return;

      const headingEls = scrollContainer.querySelectorAll<HTMLElement>(
        ".reader-content h1, .reader-content h2"
      );

      const el = headingEls[index];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [headings]
  );

  return { headings, activeHeadingId, scrollToHeading };
}
