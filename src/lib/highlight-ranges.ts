import type { MarkType, Node as PMNode } from "@tiptap/pm/model";

/**
 * Split [from, to) into the contiguous sub-ranges where `markType` can
 * actually be applied — i.e. the parent node allows the mark (code blocks
 * declare `marks: ""`) and no existing mark excludes it (the inline `code`
 * mark excludes every other mark). Ranges are merged across non-text gaps
 * (block boundaries, atoms) but split on disallowed text, so a selection
 * spanning a code block yields one range per side.
 *
 * `tr.addMark` silently drops disallowed regions — callers must use this to
 * keep persisted rows in sync with what actually renders.
 */
export function allowedMarkRanges(
  doc: PMNode,
  markType: MarkType,
  from: number,
  to: number,
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let gap = true;
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isText || !node.text) return true;
    const segFrom = Math.max(from, pos);
    const segTo = Math.min(to, pos + node.nodeSize);
    if (segFrom >= segTo) return true;
    const allowed =
      (parent?.type.allowsMarkType(markType) ?? false) &&
      !node.marks.some((m) => m.type.excludes(markType));
    if (!allowed) {
      gap = true;
      return true;
    }
    const last = ranges[ranges.length - 1];
    if (last && !gap) last.to = segTo;
    else ranges.push({ from: segFrom, to: segTo });
    gap = false;
    return true;
  });
  return ranges;
}

export interface MarkExtent {
  id: string;
  from: number;
  to: number;
  color: string;
}

/**
 * Full document extent of each `highlightId`-bearing mark of `markName`.
 * One id is assumed contiguous — the highlight pipeline keeps it that way.
 */
export function collectMarkExtents(
  doc: PMNode,
  markName: string,
): Map<string, MarkExtent> {
  const extents = new Map<string, MarkExtent>();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find((m) => m.type.name === markName);
    const id = mark?.attrs.highlightId as string | null | undefined;
    if (!mark || !id) return true;
    const end = pos + node.nodeSize;
    const cur = extents.get(id);
    if (cur) {
      cur.from = Math.min(cur.from, pos);
      cur.to = Math.max(cur.to, end);
    } else {
      extents.set(id, {
        id,
        from: pos,
        to: end,
        color: (mark.attrs.color as string) ?? "yellow",
      });
    }
    return true;
  });
  return extents;
}

export interface HighlightOverlapPlan {
  /**
   * Existing highlight fully covered by the new range — reuse its row/id for
   * the new mark so attached margin notes survive a recolor/extend.
   */
  reuse: MarkExtent | null;
  /** Fully covered highlights not reused — their rows must be deleted. */
  deleteIds: string[];
  /**
   * Partially covered highlights — the row is shrunk to this remaining piece
   * (its marks outside the new range keep the existing id, no restamp needed).
   */
  shrink: Array<{ id: string; color: string; from: number; to: number }>;
  /**
   * Second remainder of a highlight split on both sides — needs a new sibling
   * row, and the marks in this range must be restamped with the new id.
   */
  clone: Array<{ id: string; color: string; from: number; to: number }>;
}

/**
 * Work out which existing highlight marks the range [from, to) will
 * overwrite, so applying a new mark can update rows instead of leaving ghost
 * rows that resurrect stale marks on reload.
 *
 * `knownIds` restricts planning to marks backed by a loaded row — marks
 * carrying an unknown id are treated as unbacked and simply overwritten.
 */
export function planHighlightOverlap(
  doc: PMNode,
  markName: string,
  from: number,
  to: number,
  knownIds?: ReadonlySet<string>,
): HighlightOverlapPlan {
  const extents = collectMarkExtents(doc, markName);
  const overlapped = [...extents.values()]
    .filter(
      (e) =>
        e.from < to && e.to > from && (!knownIds || knownIds.has(e.id)),
    )
    .sort((a, b) => a.from - b.from);

  const plan: HighlightOverlapPlan = {
    reuse: null,
    deleteIds: [],
    shrink: [],
    clone: [],
  };

  for (const e of overlapped) {
    const before = e.from < from ? { from: e.from, to: from } : null;
    const after = e.to > to ? { from: to, to: e.to } : null;
    if (!before && !after) {
      if (!plan.reuse) plan.reuse = e;
      else plan.deleteIds.push(e.id);
    } else {
      const keep = before ?? after!;
      plan.shrink.push({ id: e.id, color: e.color, from: keep.from, to: keep.to });
      if (before && after) {
        plan.clone.push({ id: e.id, color: e.color, from: after.from, to: after.to });
      }
    }
  }
  return plan;
}
