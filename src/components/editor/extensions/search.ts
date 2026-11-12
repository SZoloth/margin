import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";

export interface SearchResult {
  from: number;
  to: number;
}

export interface SearchStorage {
  results: SearchResult[];
  activeIndex: number;
  searchTerm: string;
}

const searchPluginKey = new PluginKey("search");

export function findAllMatches(doc: PmNode, term: string): SearchResult[] {
  if (!term) return [];

  const lowerTerm = term.toLowerCase();
  const segments: Array<{ text: string; pos: number }> = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      segments.push({ text: node.text, pos });
    }
  });

  if (segments.length === 0) return [];

  // Build flat string + offset mapping
  let flat = "";
  const offsetToPos: Array<{ flatStart: number; tiptapStart: number; length: number }> = [];
  for (const seg of segments) {
    offsetToPos.push({ flatStart: flat.length, tiptapStart: seg.pos, length: seg.text.length });
    flat += seg.text;
  }

  const lowerFlat = flat.toLowerCase();
  const results: SearchResult[] = [];
  let searchFrom = 0;

  while (searchFrom < lowerFlat.length) {
    const idx = lowerFlat.indexOf(lowerTerm, searchFrom);
    if (idx === -1) break;

    const fromFlat = idx;
    const toFlat = idx + term.length;

    let from = -1;
    let to = -1;
    for (const map of offsetToPos) {
      const segEnd = map.flatStart + map.length;
      if (from === -1 && fromFlat >= map.flatStart && fromFlat < segEnd) {
        from = map.tiptapStart + (fromFlat - map.flatStart);
      }
      if (toFlat >= map.flatStart && toFlat <= segEnd) {
        to = map.tiptapStart + (toFlat - map.flatStart);
        break;
      }
    }

    if (from !== -1 && to !== -1) {
      results.push({ from, to });
    }

    searchFrom = idx + 1;
  }

  return results;
}

function buildDecorations(state: EditorState, results: SearchResult[], activeIndex: number): DecorationSet {
  if (results.length === 0) return DecorationSet.empty;

  const decorations = results.map((r, i) =>
    Decoration.inline(r.from, r.to, {
      class: i === activeIndex ? "find-match find-match-active" : "find-match",
    }),
  );

  return DecorationSet.create(state.doc, decorations);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    search: {
      setSearchTerm: (term: string) => ReturnType;
      clearSearch: () => ReturnType;
      nextMatch: () => ReturnType;
      prevMatch: () => ReturnType;
    };
  }
}

export const Search = Extension.create<Record<string, never>, SearchStorage>({
  name: "search",

  addStorage() {
    return {
      results: [],
      activeIndex: 0,
      searchTerm: "",
    };
  },

  addCommands() {
    return {
      setSearchTerm:
        (term: string) =>
        ({ editor, tr, dispatch }) => {
          const results = findAllMatches(editor.state.doc, term);
          this.storage.searchTerm = term;
          this.storage.results = results;
          this.storage.activeIndex = results.length > 0 ? 0 : -1;

          if (dispatch) {
            tr.setMeta(searchPluginKey, { results, activeIndex: this.storage.activeIndex });
            dispatch(tr);

            // Scroll first match into view
            if (results.length > 0 && results[0]) {
              editor.commands.setTextSelection(results[0].from);
              editor.commands.scrollIntoView();
            }
          }
          return true;
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          this.storage.searchTerm = "";
          this.storage.results = [];
          this.storage.activeIndex = -1;
          if (dispatch) {
            tr.setMeta(searchPluginKey, { results: [], activeIndex: -1 });
            dispatch(tr);
          }
          return true;
        },

      nextMatch:
        () =>
        ({ editor, tr, dispatch }) => {
          const { results } = this.storage;
          if (results.length === 0) return false;

          const next = (this.storage.activeIndex + 1) % results.length;
          this.storage.activeIndex = next;

          if (dispatch) {
            tr.setMeta(searchPluginKey, { results, activeIndex: next });
            dispatch(tr);
            editor.commands.setTextSelection(results[next]!.from);
            editor.commands.scrollIntoView();
          }
          return true;
        },

      prevMatch:
        () =>
        ({ editor, tr, dispatch }) => {
          const { results } = this.storage;
          if (results.length === 0) return false;

          const prev = (this.storage.activeIndex - 1 + results.length) % results.length;
          this.storage.activeIndex = prev;

          if (dispatch) {
            tr.setMeta(searchPluginKey, { results, activeIndex: prev });
            dispatch(tr);
            editor.commands.setTextSelection(results[prev]!.from);
            editor.commands.scrollIntoView();
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldDecos, _oldState, newState) {
            const meta = tr.getMeta(searchPluginKey) as
              | { results: SearchResult[]; activeIndex: number }
              | undefined;

            if (meta) {
              return buildDecorations(newState, meta.results, meta.activeIndex);
            }

            // If the doc changed and we have active results, recompute
            if (tr.docChanged && storage.searchTerm) {
              const results = findAllMatches(newState.doc, storage.searchTerm);
              storage.results = results;
              // Clamp activeIndex
              if (results.length === 0) {
                storage.activeIndex = -1;
              } else if (storage.activeIndex >= results.length) {
                storage.activeIndex = results.length - 1;
              }
              return buildDecorations(newState, results, storage.activeIndex);
            }

            if (tr.docChanged) {
              return oldDecos.map(tr.mapping, tr.doc);
            }

            return oldDecos;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
