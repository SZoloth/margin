import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyInput,
  backspace,
  caretSourceIndex,
  createSession,
  deleteForward,
  formatLearnStats,
  formatPage,
  loadLearnProgress,
  moveCaret,
  moveCaretTo,
  moveToEnd,
  moveToParagraphEnd,
  moveToParagraphStart,
  moveToStart,
  moveVertically,
  pageOf,
  readElapsed,
  saveLearnProgress,
  sourceHash,
  toProgress,
  type LearnAtom,
  type LearnSession,
} from "@/lib/learn-mode";

interface LearnModeProps {
  title: string;
  text: string;
  documentId: string;
  passageKey: string;
  /** Source index into `text`. The reader maps that back onto the document. */
  onExit: (sourceIndex: number) => void;
}

/**
 * Type the passage over a dimmed copy of it. Matched letters take the
 * reader color, the rest stays quiet, and a miss is an underline you can
 * walk back to. Escape returns to the reader.
 */
export function LearnMode({ title, text, documentId, passageKey, onExit }: LearnModeProps) {
  const initialRef = useRef<{ session: LearnSession; elapsed: number } | null>(null);
  if (initialRef.current === null) {
    const blank = createSession(text);
    const saved = loadLearnProgress(documentId, passageKey, sourceHash(blank));
    initialRef.current = { session: createSession(text, saved), elapsed: readElapsed(saved) };
  }
  const [session, setSession] = useState(initialRef.current.session);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const elapsedRef = useRef(initialRef.current.elapsed);
  const [elapsed, setElapsed] = useState(elapsedRef.current);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const saveTimer = useRef(0);
  const leftRef = useRef(false);
  const composingRef = useRef(false);

  const persist = () => {
    saveLearnProgress(
      documentId,
      toProgress(sessionRef.current, passageKey, elapsedRef.current),
    );
  };

  const scheduleSave = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(persist, 250);
  };

  const update = (fn: (current: LearnSession) => LearnSession) => {
    const next = fn(sessionRef.current);
    sessionRef.current = next;
    setSession(next);
    scheduleSave();
  };

  const exit = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    window.clearTimeout(saveTimer.current);
    persist();
    onExitRef.current(caretSourceIndex(sessionRef.current));
  };

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let mark = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === "visible") {
        elapsedRef.current += now - mark;
        setElapsed(elapsedRef.current);
      }
      mark = now;
    }, 1000);
    const onVis = () => {
      mark = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.clearTimeout(saveTimer.current);
      if (!leftRef.current) persist();
    };
    // Persist the latest session when the overlay goes away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        exit();
        return;
      }
      if (e.isComposing || composingRef.current) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "v") return;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === "Backspace") {
        stop();
        update(backspace);
        return;
      }
      if (e.key === "Delete") {
        stop();
        update(deleteForward);
        return;
      }
      if (e.key === "ArrowLeft") {
        stop();
        update((s) => (meta ? moveToStart(s) : moveCaret(s, -1)));
        return;
      }
      if (e.key === "ArrowRight") {
        stop();
        update((s) => (meta ? moveToEnd(s) : moveCaret(s, 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        stop();
        update((s) => moveVertically(s, -1));
        return;
      }
      if (e.key === "ArrowDown") {
        stop();
        update((s) => moveVertically(s, 1));
        return;
      }
      if (e.key === "Home") {
        stop();
        update((s) => (meta ? moveToStart(s) : moveToParagraphStart(s)));
        return;
      }
      if (e.key === "End") {
        stop();
        update((s) => (meta ? moveToEnd(s) : moveToParagraphEnd(s)));
        return;
      }
      if (e.key === "Enter") {
        stop();
        update((s) => applyInput(s, "\n"));
        return;
      }
      if (e.key === "Tab") {
        stop();
        return;
      }
      if (meta || (e.altKey && e.key.length !== 1)) {
        stop();
        return;
      }
      if (e.key.length === 1) {
        stop();
        update((s) => applyInput(s, e.key));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // The listener reads the session through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const caret = caretRef.current;
    if (!scroller || !caret) return;
    const sRect = scroller.getBoundingClientRect();
    const cRect = caret.getBoundingClientRect();
    if (sRect.height === 0) return;
    const relative = cRect.top - sRect.top;
    if (relative >= sRect.height * 0.28 && relative <= sRect.height * 0.62) return;
    scroller.scrollTop += relative - sRect.height * 0.36;
  }, [session.caret]);

  const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent as InputEvent;
    if (native.isComposing || composingRef.current) return;
    const el = e.currentTarget;
    const value = el.value;
    if (!value) return;
    el.value = "";
    update((s) => applyInput(s, value));
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    if (pasted) update((s) => applyInput(s, pasted));
  };

  const onPlace = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, textarea")) return;
    e.preventDefault();
    const atom = target.closest("[data-atom]");
    if (atom) {
      const index = Number(atom.getAttribute("data-atom"));
      if (Number.isFinite(index)) update((s) => moveCaretTo(s, index));
    }
    inputRef.current?.focus({ preventScroll: true });
  };

  const { page, pages } = pageOf(session);
  const stats = formatLearnStats(session.typedCount, session.correctCount, elapsed);

  return createPortal(
    <div
      className="learn-mode"
      role="dialog"
      aria-modal="true"
      aria-label={`Learn ${title}`}
      onMouseDown={onPlace}
    >
      <div className="learn-top">
        <button type="button" className="learn-esc" onClick={exit}>
          Esc
        </button>
        <div className="learn-heading">
          <h1 className="learn-title">{title}</h1>
          <p
            className="learn-stats"
            title={session.typedCount > 0 ? `${session.typedCount} characters typed` : undefined}
          >
            {stats}
          </p>
        </div>
        <p className="learn-page">{formatPage(page, pages)}</p>
      </div>
      <div className="learn-scroller" ref={scrollerRef}>
        <div className="learn-column">
          <Passage session={session} caretRef={caretRef} />
        </div>
      </div>
      <textarea
        ref={inputRef}
        className="learn-input"
        aria-label="Type the passage"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onInput={onInput}
        onPaste={onPaste}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
      />
      <p className="learn-sr">
        Type the passage. Letters you match brighten, and a mistake is underlined so you can go back. Escape returns to the reader.
      </p>
    </div>,
    document.body,
  );
}

function Passage({
  session,
  caretRef,
}: {
  session: LearnSession;
  caretRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const blocks: Array<Array<{ atom: LearnAtom; index: number } | { caret: true }>> = [];
  let current: Array<{ atom: LearnAtom; index: number } | { caret: true }> = [];
  const caretAt = (index: number) => {
    if (session.caret === index) current.push({ caret: true });
  };
  session.atoms.forEach((atom, index) => {
    if (atom.kind === "break") {
      caretAt(index);
      blocks.push(current);
      current = [];
      return;
    }
    caretAt(index);
    current.push({ atom, index });
  });
  caretAt(session.atoms.length);
  blocks.push(current);

  return (
    <>
      {blocks.map((block, blockIndex) => (
        <p key={blockIndex}>
          {block.length === 0 ? <br /> : null}
          {block.map((item, itemIndex) =>
            "caret" in item ? (
              <span key={`c-${itemIndex}`} ref={caretRef} className="learn-caret" aria-hidden="true" />
            ) : (
              <span
                key={item.index}
                data-atom={item.index}
                data-state={session.cells[item.index]}
                className={`learn-atom learn-${session.cells[item.index]}`}
              >
                {item.atom.text}
              </span>
            ),
          )}
        </p>
      ))}
    </>
  );
}
