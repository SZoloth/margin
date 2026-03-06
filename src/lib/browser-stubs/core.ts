/**
 * Browser mock for @tauri-apps/api/core
 *
 * When `pnpm dev` runs without the Tauri runtime, Vite aliases
 * @tauri-apps/api/core → this file. Provides in-memory CRUD for
 * annotations and sensible defaults for all other commands.
 */

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE_DOC_ID = "sample-doc";

const sampleDocument = {
  id: SAMPLE_DOC_ID,
  source: "file" as const,
  file_path: "/mock/documents/welcome.md",
  keep_local_id: null,
  title: "Welcome to Margin",
  author: null,
  url: null,
  word_count: 128,
  last_opened_at: Date.now(),
  created_at: Date.now() - 86_400_000,
};

const sampleMarkdown = `# Welcome to Margin

Margin is a local-first reading and annotation app. Open markdown files, highlight text, and write margin notes.

## Getting started

Select any text and choose a highlight color from the floating toolbar. Click a highlight to add a margin note.

> "The art of reading is the art of picking up cues from a text." — Mortimer Adler
`;

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

type HighlightRow = {
  id: string;
  document_id: string;
  color: string;
  text_content: string;
  from_pos: number;
  to_pos: number;
  prefix_context: string | null;
  suffix_context: string | null;
  created_at: number;
  updated_at: number;
};

type MarginNoteRow = {
  id: string;
  highlight_id: string;
  content: string;
  created_at: number;
  updated_at: number;
};

let highlights: HighlightRow[] = [];
let marginNotes: MarginNoteRow[] = [];
let idCounter = 0;

function uid(): string {
  return `mock-${++idCounter}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Command dispatcher
// ---------------------------------------------------------------------------

const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  // --- Mount-time (must return correct shape or app crashes) ----------------
  get_recent_documents: () => [sampleDocument],
  get_open_tabs: () => [],
  index_all_documents: () => ({ indexed: 0, skipped: 0, errors: 0 }),
  drain_pending_open_files: () => [],

  // --- File ops -------------------------------------------------------------
  read_file: () => sampleMarkdown,
  open_file_dialog: () => null,
  save_file: () => undefined,
  list_markdown_files: () => [],
  upsert_document: (a) => a.doc ?? sampleDocument,
  rename_file: (a) => a.doc ?? sampleDocument,

  // --- Highlight CRUD -------------------------------------------------------
  get_highlights: (a) => {
    const docId = a.documentId as string | undefined;
    return docId ? highlights.filter((h) => h.document_id === docId) : highlights;
  },

  create_highlight: (a) => {
    const row: HighlightRow = {
      id: uid(),
      document_id: a.documentId as string,
      color: a.color as string,
      text_content: a.textContent as string,
      from_pos: a.fromPos as number,
      to_pos: a.toPos as number,
      prefix_context: (a.prefixContext as string) ?? null,
      suffix_context: (a.suffixContext as string) ?? null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    highlights.push(row);
    return row;
  },

  delete_highlight: (a) => {
    highlights = highlights.filter((h) => h.id !== a.id);
  },

  delete_all_highlights_for_document: (a) => {
    highlights = highlights.filter((h) => h.document_id !== a.documentId);
  },

  update_highlight_positions: () => undefined,

  // --- Margin note CRUD -----------------------------------------------------
  get_margin_notes: () => [...marginNotes],

  create_margin_note: (a) => {
    const row: MarginNoteRow = {
      id: uid(),
      highlight_id: a.highlightId as string,
      content: a.content as string,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    marginNotes.push(row);
    return row;
  },

  update_margin_note: (a) => {
    const note = marginNotes.find((n) => n.id === a.id);
    if (note) {
      note.content = a.content as string;
      note.updated_at = Date.now();
    }
  },

  delete_margin_note: (a) => {
    marginNotes = marginNotes.filter((n) => n.id !== a.id);
  },

  // --- Search (empty) -------------------------------------------------------
  search_documents: () => [],
  search_files_on_disk: () => [],
  index_document: () => undefined,
  remove_document_index: () => undefined,

  // --- Keep-local (offline) -------------------------------------------------
  keep_local_health: () => ({ ok: false, now: Date.now() }),
  keep_local_list_items: () => ({ items: [], count: 0 }),
  keep_local_get_content: () => "",

  // --- File watcher (no-op) -------------------------------------------------
  watch_file: () => undefined,
  unwatch_file: () => undefined,

  // --- Corrections / writing rules (empty) ----------------------------------
  persist_corrections: () => "mock-export-id",
  get_all_corrections: () => [],
  get_corrections_count: () => 0,
  get_corrections_by_document: () => [],
  get_corrections_flat: () => [],
  update_correction_writing_type: () => undefined,
  delete_correction: () => undefined,
  export_corrections_json: () => ({ count: 0, highlightIds: [] }),
  mark_corrections_synthesized: () => 0,
  bulk_delete_corrections: () => 0,
  bulk_tag_corrections: () => 0,
  bulk_set_polarity_corrections: () => 0,
  get_voice_signals: () => [],
  export_voice_profile: () => ({
    path: "",
    positiveCount: 0,
    correctiveCount: 0,
    unclassifiedCount: 0,
    ruleCount: 0,
  }),

  get_writing_rules: () => [],
  export_writing_rules: () => ({ markdownPath: "", hookPath: "", ruleCount: 0 }),
  update_writing_rule: () => undefined,
  delete_writing_rule: () => undefined,

  // --- Tabs -----------------------------------------------------------------
  save_open_tabs: () => undefined,

  // --- Snapshots ------------------------------------------------------------
  save_content_snapshot: () => "mock-snapshot",
  get_content_snapshot: () => null,
  delete_content_snapshot: () => undefined,
};

// ---------------------------------------------------------------------------
// Public API (matches @tauri-apps/api/core)
// ---------------------------------------------------------------------------

export async function invoke<T = unknown>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const handler = handlers[cmd];
  if (handler) {
    return handler(args) as T;
  }
  console.warn(`[browser-mock] unhandled: ${cmd}`);
  return undefined as T;
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

export function __resetForTests(): void {
  highlights = [];
  marginNotes = [];
  idCounter = 0;
}
