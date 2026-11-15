/**
 * Learn mode: type a passage over a dimmed copy of itself.
 *
 * The passage is a row of atoms (letters, spaces, paragraph breaks, and
 * punctuation that keyboards spell differently from typeset text). Each atom
 * is pending, matched, or missed. A miss advances anyway — you can keep
 * going and step back to fix it. Progress is local storage only.
 */

export const LEARN_PROGRESS_KEY = "margin-learn-progress";

/** Roughly a page of prose, for the quiet page number in the header. */
export const LEARN_PAGE_CHARS = 1200;

export type CellState = "pending" | "match" | "miss";

export type AtomKind =
  | "char"
  | "space"
  | "break"
  | "quote"
  | "apostrophe"
  | "dash"
  | "ellipsis"
  | "period";

/** Hyphens the source used. Only en/em forms swallow a typed "--" or "---". */
export type DashForm = "-" | "–" | "—";

export interface LearnAtom {
  /** Glyphs shown for this atom. An em dash typed as "--" in the source is one atom. */
  text: string;
  kind: AtomKind;
  dash?: DashForm;
  /** Index of `text` in the original passage string passed to {@link createSession}. */
  sourceIndex: number;
}

/** Extra keystrokes that belong to the atom just matched (the second hyphen of "--"). */
interface Absorb {
  char: string;
  left: number;
  used: number;
}

export interface LearnSession {
  atoms: LearnAtom[];
  cells: CellState[];
  /** Atom the next keystroke will try. `atoms.length` means the passage is finished. */
  caret: number;
  absorb: Absorb | null;
  /** Character attempts, including misses and retypes. Backspace does not subtract. */
  typedCount: number;
  /** Attempts that matched. Cumulative, so fixing a miss does not erase the miss. */
  correctCount: number;
}

export interface LearnProgress {
  passageKey: string;
  sourceHash: string;
  caret: number;
  /** `1` match, `0` miss, `.` a hole you stepped back through. Length is the high-water mark. */
  mask: string;
  charactersTyped: number;
  correctCount: number;
  elapsedMs: number;
  updatedAt: number;
}

const DOUBLE_QUOTES = new Set(['"', "“", "”", "«", "»", "„", "‟"]);
const SINGLE_QUOTES = new Set(["'", "‘", "’", "‚", "‛", "‹", "›"]);
const DASH_CHARS = new Set(["-", "‐", "‑", "‒", "–", "—", "―", "−"]);
const WIDE_DASHES = new Set(["–", "—", "―", "−"]);

function isSpace(ch: string): boolean {
  return (
    ch === " " ||
    ch === "\t" ||
    ch === "\u00A0" ||
    ch === "\u2000" ||
    ch === "\u2001" ||
    ch === "\u2002" ||
    ch === "\u2003" ||
    ch === "\u2004" ||
    ch === "\u2005" ||
    ch === "\u2006" ||
    ch === "\u2007" ||
    ch === "\u2008" ||
    ch === "\u2009" ||
    ch === "\u200A" ||
    ch === "\u202F" ||
    ch === "\u205F" ||
    ch === "\u3000"
  );
}

function isIgnorable(ch: string): boolean {
  return ch === "\u200B" || ch === "\u200C" || ch === "\u200D" || ch === "\uFEFF" || ch === "\u2060";
}

function dashForm(ch: string): DashForm {
  if (ch === "–") return "–";
  if (WIDE_DASHES.has(ch)) return "—";
  return "-";
}

interface Scanned {
  ch: string;
  index: number;
}

/** Walk the passage one character at a time, folding CRLF to a single break. */
function scanPassage(text: string): Scanned[] {
  const out: Scanned[] = [];
  for (let i = 0; i < text.length; ) {
    if (text[i] === "\r" && text[i + 1] === "\n") {
      out.push({ ch: "\n", index: i });
      i += 2;
      continue;
    }
    if (text[i] === "\r") {
      out.push({ ch: "\n", index: i });
      i += 1;
      continue;
    }
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    if (!isIgnorable(ch)) out.push({ ch, index: i });
    i += ch.length;
  }
  return out;
}

function tokenize(text: string): LearnAtom[] {
  const scan = scanPassage(text);
  let start = 0;
  let end = scan.length;
  while (start < end && (isSpace(scan[start]!.ch) || scan[start]!.ch === "\n")) start++;
  while (end > start && (isSpace(scan[end - 1]!.ch) || scan[end - 1]!.ch === "\n")) end--;

  const atoms: LearnAtom[] = [];
  for (let i = start; i < end; ) {
    const { ch, index } = scan[i]!;
    if (ch === "\n") {
      atoms.push({ text: "\n", kind: "break", sourceIndex: index });
      i += 1;
      continue;
    }
    if (isSpace(ch)) {
      atoms.push({ text: " ", kind: "space", sourceIndex: index });
      i += 1;
      continue;
    }
    if (ch === "…") {
      atoms.push({ text: "…", kind: "ellipsis", sourceIndex: index });
      i += 1;
      continue;
    }
    if (ch === "." && scan[i + 1]?.ch === "." && scan[i + 2]?.ch === ".") {
      atoms.push({ text: "...", kind: "ellipsis", sourceIndex: index });
      i += 3;
      continue;
    }
    if (ch === ".") {
      atoms.push({ text: ".", kind: "period", sourceIndex: index });
      i += 1;
      continue;
    }
    if (DOUBLE_QUOTES.has(ch)) {
      atoms.push({ text: ch, kind: "quote", sourceIndex: index });
      i += 1;
      continue;
    }
    if (SINGLE_QUOTES.has(ch)) {
      atoms.push({ text: ch, kind: "apostrophe", sourceIndex: index });
      i += 1;
      continue;
    }
    if (DASH_CHARS.has(ch)) {
      if (ch === "-") {
        let j = i + 1;
        while (j < end && scan[j]?.ch === "-") j++;
        const run = j - i;
        if (run >= 2) {
          const take = Math.min(run, 3);
          atoms.push({
            text: "-".repeat(take),
            kind: "dash",
            dash: "—",
            sourceIndex: index,
          });
          i += take;
          continue;
        }
      }
      atoms.push({ text: ch, kind: "dash", dash: dashForm(ch), sourceIndex: index });
      i += 1;
      continue;
    }
    atoms.push({ text: ch, kind: "char", sourceIndex: index });
    i += 1;
  }
  return atoms;
}

function accepts(atom: LearnAtom, ch: string): boolean {
  switch (atom.kind) {
    case "char":
      return ch === atom.text;
    case "space":
      return isSpace(ch);
    case "break":
      return ch === "\n";
    case "quote":
      return DOUBLE_QUOTES.has(ch);
    case "apostrophe":
      return SINGLE_QUOTES.has(ch);
    case "dash":
      return DASH_CHARS.has(ch);
    case "ellipsis":
      return ch === "…" || ch === ".";
    case "period":
      return ch === "." || ch === "…";
    default:
      return false;
  }
}

/** A single "-" or "." stands in for an em dash or ellipsis; the rest of "--" / "..." is the same atom. */
function absorbFor(atom: LearnAtom, ch: string): Absorb | null {
  if (atom.kind === "ellipsis" && ch === ".") return { char: ".", left: 2, used: 0 };
  if (atom.kind === "dash" && atom.dash !== "-" && ch === "-") return { char: "-", left: 2, used: 0 };
  return null;
}

export function frontierOf(cells: CellState[]): number {
  let frontier = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== "pending") frontier = i + 1;
  }
  return frontier;
}

export function sourceHash(session: LearnSession): string {
  let text = "";
  for (const atom of session.atoms) text += atom.kind === "break" ? "\n" : atom.text;
  return hashText(text);
}

export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h, 33) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

export function isLearnable(text: string): boolean {
  return tokenize(text).some((atom) => atom.kind !== "space" && atom.kind !== "break");
}

export function createSession(text: string, saved?: LearnProgress | null): LearnSession {
  const atoms = tokenize(text);
  const cells: CellState[] = atoms.map(() => "pending");
  const blank: LearnSession = {
    atoms,
    cells,
    caret: 0,
    absorb: null,
    typedCount: 0,
    correctCount: 0,
  };
  if (!saved || saved.sourceHash !== sourceHash(blank)) return blank;
  return restoreSession(blank, saved);
}

function restoreSession(session: LearnSession, saved: LearnProgress): LearnSession {
  const cells = session.cells.slice();
  const mask = saved.mask;
  for (let i = 0; i < mask.length && i < cells.length; i++) {
    const ch = mask[i];
    if (ch === "1") cells[i] = "match";
    else if (ch === "0") cells[i] = "miss";
  }
  const frontier = frontierOf(cells);
  const caret = Number.isFinite(saved.caret) ? Math.max(0, Math.min(frontier, Math.floor(saved.caret))) : 0;
  let attempts = 0;
  let matches = 0;
  for (const ch of mask) {
    if (ch === "1") {
      attempts++;
      matches++;
    } else if (ch === "0") attempts++;
  }
  const typed = Number.isFinite(saved.charactersTyped) ? Math.max(attempts, Math.floor(saved.charactersTyped)) : attempts;
  const correctRaw = Number.isFinite(saved.correctCount) ? Math.floor(saved.correctCount) : matches;
  const correct = Math.min(typed, Math.max(matches, correctRaw));
  return { ...session, cells, caret, typedCount: typed, correctCount: correct };
}

export function encodeMask(cells: CellState[]): string {
  let last = -1;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== "pending") last = i;
  }
  let mask = "";
  for (let i = 0; i <= last; i++) {
    const cell = cells[i];
    mask += cell === "match" ? "1" : cell === "miss" ? "0" : ".";
  }
  return mask;
}

export function applyInput(session: LearnSession, input: string): LearnSession {
  let next = session;
  for (const ch of input.normalize("NFC")) {
    next = applyChar(next, ch);
  }
  return next;
}

function applyChar(session: LearnSession, ch: string): LearnSession {
  if (session.absorb && ch === session.absorb.char && session.absorb.left > 0) {
    return {
      ...session,
      absorb: {
        char: session.absorb.char,
        left: session.absorb.left - 1,
        used: session.absorb.used + 1,
      },
    };
  }
  const base = session.absorb ? { ...session, absorb: null } : session;
  if (base.caret >= base.atoms.length) return base;
  if (isIgnorable(ch) || (ch < " " && ch !== "\n")) return base;
  const atom = base.atoms[base.caret]!;
  const ok = accepts(atom, ch);
  const cells = base.cells.slice();
  cells[base.caret] = ok ? "match" : "miss";
  return {
    ...base,
    cells,
    caret: base.caret + 1,
    absorb: ok ? absorbFor(atom, ch) : null,
    typedCount: base.typedCount + 1,
    correctCount: base.correctCount + (ok ? 1 : 0),
  };
}

export function backspace(session: LearnSession): LearnSession {
  if (session.absorb && session.absorb.used > 0) {
    return {
      ...session,
      absorb: {
        char: session.absorb.char,
        left: session.absorb.left + 1,
        used: session.absorb.used - 1,
      },
    };
  }
  if (session.caret <= 0) return session.absorb ? { ...session, absorb: null } : session;
  const caret = session.caret - 1;
  const cells = session.cells.slice();
  cells[caret] = "pending";
  return { ...session, cells, caret, absorb: null };
}

export function deleteForward(session: LearnSession): LearnSession {
  const frontier = frontierOf(session.cells);
  if (session.caret >= frontier) return session.absorb ? { ...session, absorb: null } : session;
  const cells = session.cells.slice();
  cells[session.caret] = "pending";
  return { ...session, cells, absorb: null };
}

function withCaret(session: LearnSession, caret: number): LearnSession {
  const frontier = frontierOf(session.cells);
  const next = Math.max(0, Math.min(frontier, caret));
  if (next === session.caret && !session.absorb) return session;
  return { ...session, caret: next, absorb: null };
}

export function moveCaret(session: LearnSession, delta: number): LearnSession {
  return withCaret(session, session.caret + delta);
}

/** Place the caret on an atom. You cannot skip past the last character you have tried. */
export function moveCaretTo(session: LearnSession, index: number): LearnSession {
  return withCaret(session, index);
}

export function moveToStart(session: LearnSession): LearnSession {
  return withCaret(session, 0);
}

export function moveToEnd(session: LearnSession): LearnSession {
  return withCaret(session, frontierOf(session.cells));
}

function paragraphStart(session: LearnSession, index: number): number {
  let i = Math.max(0, Math.min(index, session.atoms.length));
  while (i > 0 && session.atoms[i - 1]?.kind !== "break") i--;
  return i;
}

export function moveToParagraphStart(session: LearnSession): LearnSession {
  return withCaret(session, paragraphStart(session, session.caret));
}

export function moveToParagraphEnd(session: LearnSession): LearnSession {
  let i = session.caret;
  while (i < session.atoms.length && session.atoms[i]?.kind !== "break") i++;
  return withCaret(session, i);
}

export function moveVertically(session: LearnSession, direction: -1 | 1): LearnSession {
  if (direction < 0) {
    const start = paragraphStart(session, session.caret);
    const atStart = session.caret === start;
    if (!atStart) return withCaret(session, start);
    if (start === 0) return withCaret(session, 0);
    return withCaret(session, paragraphStart(session, start - 1));
  }
  let i = session.caret;
  while (i < session.atoms.length && session.atoms[i]?.kind !== "break") i++;
  if (i < session.atoms.length && session.atoms[i]?.kind === "break") i++;
  return withCaret(session, i);
}

/** Where in the original passage string the reader should put the cursor on exit. */
export function caretSourceIndex(session: LearnSession): number {
  if (session.atoms.length === 0) return 0;
  if (session.caret <= 0) return session.atoms[0]!.sourceIndex;
  if (session.caret >= session.atoms.length) {
    const last = session.atoms[session.atoms.length - 1]!;
    return last.sourceIndex + last.text.length;
  }
  return session.atoms[session.caret]!.sourceIndex;
}

export function accuracyOf(typedCount: number, correctCount: number): number | null {
  if (typedCount <= 0) return null;
  return correctCount / typedCount;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${minutes}:${ss}`;
}

export function formatLearnStats(typed: number, correct: number, elapsedMs: number): string {
  const parts: string[] = [];
  const accuracy = accuracyOf(typed, correct);
  if (accuracy !== null) parts.push(`${Math.round(accuracy * 100)}%`);
  if (elapsedMs >= 1000) parts.push(formatElapsed(elapsedMs));
  return parts.join(" · ");
}

export function pageOf(session: LearnSession): { page: number; pages: number } {
  const last = session.atoms[session.atoms.length - 1];
  const total = last ? last.sourceIndex + last.text.length : 1;
  const at = caretSourceIndex(session);
  const pages = Math.max(1, Math.ceil(total / LEARN_PAGE_CHARS));
  const page = Math.min(pages, Math.floor(at / LEARN_PAGE_CHARS) + 1);
  return { page, pages };
}

export function formatPage(page: number, pages: number): string {
  return pages > 1 ? `${page} / ${pages}` : `${page}`;
}

export function toProgress(
  session: LearnSession,
  passageKey: string,
  elapsedMs: number,
  now = Date.now(),
): LearnProgress {
  return {
    passageKey,
    sourceHash: sourceHash(session),
    caret: session.caret,
    mask: encodeMask(session.cells),
    charactersTyped: session.typedCount,
    correctCount: session.correctCount,
    elapsedMs: Math.max(0, Math.floor(elapsedMs)),
    updatedAt: now,
  };
}

type ProgressStore = Record<string, Record<string, LearnProgress>>;

function readStore(): ProgressStore {
  try {
    const raw = localStorage.getItem(LEARN_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ProgressStore;
  } catch {
    return {};
  }
}

function isProgress(value: unknown): value is LearnProgress {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LearnProgress>;
  return (
    typeof row.passageKey === "string" &&
    typeof row.sourceHash === "string" &&
    typeof row.mask === "string" &&
    typeof row.caret === "number" &&
    typeof row.charactersTyped === "number" &&
    typeof row.correctCount === "number" &&
    typeof row.elapsedMs === "number"
  );
}

export function loadLearnProgress(
  documentId: string,
  passageKey: string,
  hash: string,
): LearnProgress | null {
  const row = readStore()[documentId]?.[passageKey];
  if (!isProgress(row)) return null;
  if (row.passageKey !== passageKey || row.sourceHash !== hash) return null;
  return row;
}

export function saveLearnProgress(documentId: string, progress: LearnProgress): void {
  if (!documentId) return;
  try {
    const store = readStore();
    const existing = store[documentId];
    const doc =
      existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
    doc[progress.passageKey] = progress;
    store[documentId] = doc;
    localStorage.setItem(LEARN_PROGRESS_KEY, JSON.stringify(store));
  } catch {
    // A full or blocked store keeps the session in memory for this sitting.
  }
}

export function readElapsed(saved: LearnProgress | null): number {
  if (!saved || !Number.isFinite(saved.elapsedMs)) return 0;
  return Math.max(0, saved.elapsedMs);
}
