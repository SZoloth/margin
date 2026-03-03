#!/usr/bin/env node
import { mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ExportBridge } from "./export-bridge.js";
import { openReadDb, openWriteDb } from "./db.js";
import { startExportBridge } from "./startup.js";
import {
  listDocuments,
  getDocument,
  readDocument,
  searchDocuments,
} from "./tools/documents.js";
import {
  getAnnotations,
  createHighlight,
  createMarginNote,
  deleteHighlight,
  highlightByText,
  updateMarginNote,
  deleteMarginNote,
  updateHighlightColor,
} from "./tools/annotations.js";
import {
  getCorrections,
  getCorrectionsSummary,
  createCorrection,
  deleteCorrection,
  updateCorrectionWritingType,
  setCorrectionPolarity,
  getVoiceSignals,
} from "./tools/corrections.js";
import {
  getWritingRules,
  getWritingRulesMarkdown,
  getWritingProfileMarkdown,
  getWritingGuardPy,
  updateWritingRule,
  deleteWritingRule,
} from "./tools/writing-rules.js";

const server = new McpServer({
  name: "margin",
  version: "0.1.0",
});

const bridge = new ExportBridge();

// Push notifications to Claude Code when exports arrive
bridge.onExport((prompt) => {
  // 1. Resource-updated notification — tells the client margin://latest-export changed
  server.server.sendResourceUpdated({ uri: "margin://latest-export" }).catch(() => {});

  // 2. Logging notification — surfaces in Claude Code's output as an alert
  server.sendLoggingMessage({
    level: "alert",
    data: `New annotations exported from Margin. Call margin_wait_for_export to receive them, or read the margin://latest-export resource.`,
  }).catch(() => {});
});

let readDb: ReturnType<typeof openReadDb> | undefined;
let writeDb: ReturnType<typeof openWriteDb> | undefined;

function getReadDb() {
  if (!readDb) readDb = openReadDb();
  return readDb;
}

function getWriteDb() {
  if (!writeDb) writeDb = openWriteDb();
  return writeDb;
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function dbErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("SQLITE_CANTOPEN") || msg.includes("no such file")) {
    return `Cannot open Margin database (~/.margin/margin.db). Make sure the Margin app has been opened at least once.`;
  }
  return `Database error: ${msg}`;
}

/**
 * Auto-export unified writing profile (voice calibration + corrections + rules)
 * after a mutation. Fire-and-forget — errors are logged but don't fail the mutation.
 */
async function autoExportWritingProfile(): Promise<void> {
  try {
    // Use the write DB so we see the just-committed mutation (WAL visibility).
    const db = getWriteDb();
    const rules = getWritingRules(db);
    const corrections = getCorrections(db, undefined, 2000);
    const md = getWritingProfileMarkdown(rules, corrections);
    const hookPy = getWritingGuardPy(rules);

    const home = homedir();
    if (!home) return;

    const mdDir = join(home, ".margin");
    const hookDir = join(home, ".claude", "hooks");
    await Promise.all([mkdir(mdDir, { recursive: true }), mkdir(hookDir, { recursive: true })]);
    await Promise.all([
      writeFile(join(mdDir, "writing-rules.md"), md),
      writeFile(join(hookDir, "writing_guard.py"), hookPy, { mode: 0o755 }),
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Auto-export writing profile failed:", err);
  }
}

async function withDb(fn: () => ToolResult | Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return { content: [{ type: "text", text: dbErrorMessage(err) }], isError: true };
  }
}

/** Like withDb but also auto-exports the unified writing profile on success. */
async function withDbAndExport(fn: () => ToolResult | Promise<ToolResult>): Promise<ToolResult> {
  const result = await withDb(fn);
  if (!result.isError) void autoExportWritingProfile();
  return result;
}

// --- Read Tools ---

server.tool(
  "margin_list_documents",
  "List recent documents from the Margin reading app, ordered by last_opened_at DESC. Returns DB-backed fields like id, title, source, file_path, word_count, last_opened_at, created_at.",
  { limit: z.number().optional().describe("Max documents to return (default 20, max 100)") },
  async ({ limit }) => withDb(() => ({
    content: [{ type: "text", text: JSON.stringify(listDocuments(getReadDb(), limit), null, 2) }],
  })),
);

server.tool(
  "margin_get_document",
  "Get full metadata for a single document by ID.",
  { document_id: z.string().describe("Document ID") },
  async ({ document_id }) => withDb(() => {
    const doc = getDocument(getReadDb(), document_id);
    if (!doc) {
      return { content: [{ type: "text", text: `Document not found: ${document_id}` }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(doc, null, 2) }] };
  }),
);

server.tool(
  "margin_read_document",
  "Read the actual file content of a document. Works for file-based documents; keep-local articles may not have a file path.",
  { document_id: z.string().describe("Document ID") },
  async ({ document_id }) => withDb(() => {
    const result = readDocument(getReadDb(), document_id);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: result.content }] };
  }),
);

server.tool(
  "margin_search_documents",
  "Full-text search across indexed documents using FTS5 with BM25 ranking and frecency boosting. Returns results with documentId, title, snippet, rank.",
  {
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Max results (default 20, max 50)"),
  },
  async ({ query, limit }) => withDb(() => {
    const results = searchDocuments(getReadDb(), query, limit);
    if ("error" in results) {
      return { content: [{ type: "text", text: results.error }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  }),
);

server.tool(
  "margin_get_annotations",
  "Get all highlights and margin notes for a document, grouped by highlight and ordered by from_pos. Each entry contains the highlight (id, color, text_content, from_pos, to_pos, prefix_context, suffix_context, created_at, updated_at) and its associated notes array.",
  { document_id: z.string().describe("Document ID") },
  async ({ document_id }) => withDb(() => ({
    content: [{ type: "text", text: JSON.stringify(getAnnotations(getReadDb(), document_id), null, 2) }],
  })),
);

server.tool(
  "margin_get_corrections",
  "Get writing corrections with context. Optionally filter by document.",
  {
    document_id: z.string().optional().describe("Filter by document ID"),
    limit: z.number().optional().describe("Max results (default 200, max 2000)"),
  },
  async ({ document_id, limit }) => withDb(() => ({
    content: [{ type: "text", text: JSON.stringify(getCorrections(getReadDb(), document_id, limit), null, 2) }],
  })),
);

server.tool(
  "margin_get_corrections_summary",
  "Get aggregate statistics about writing corrections: total count, breakdown by writing type, and breakdown by document.",
  {},
  async () => withDb(() => ({
    content: [{ type: "text", text: JSON.stringify(getCorrectionsSummary(getReadDb()), null, 2) }],
  })),
);

server.tool(
  "margin_get_writing_rules",
  "Get writing rules from the database. Optionally filter by writing type (general, email, prd, blog, cover-letter, resume, slack, pitch, outreach).",
  { writing_type: z.string().optional().describe("Filter by writing type") },
  async ({ writing_type }) => withDb(() => ({
    content: [{ type: "text", text: JSON.stringify(getWritingRules(getReadDb(), writing_type), null, 2) }],
  })),
);

server.tool(
  "margin_get_writing_rules_markdown",
  "Get writing rules formatted as markdown, grouped by type and category. Suitable for including in prompts.",
  { writing_type: z.string().optional().describe("Filter by writing type") },
  async ({ writing_type }) => withDb(() => {
    const rules = getWritingRules(getReadDb(), writing_type);
    return { content: [{ type: "text", text: getWritingRulesMarkdown(rules) }] };
  }),
);

// --- Write Tools ---

server.tool(
  "margin_create_highlight",
  "Create a new text highlight in a document. Returns the created highlight record.",
  {
    document_id: z.string().describe("Document ID"),
    color: z.enum(["yellow", "green", "blue", "pink", "purple", "orange"]).describe("Highlight color"),
    text_content: z.string().describe("The highlighted text"),
    from_pos: z.number().describe("Start position in document"),
    to_pos: z.number().describe("End position in document"),
    prefix_context: z.string().optional().describe("Text before the highlight for anchoring"),
    suffix_context: z.string().optional().describe("Text after the highlight for anchoring"),
  },
  async (params) => withDb(() => {
    const result = createHighlight(getWriteDb(), params);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "margin_create_margin_note",
  "Create a margin note attached to an existing highlight. Returns the created note record.",
  {
    highlight_id: z.string().describe("Highlight ID to attach the note to"),
    content: z.string().describe("Note content"),
  },
  async ({ highlight_id, content }) => withDb(() => {
    const result = createMarginNote(getWriteDb(), highlight_id, content);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "margin_delete_highlight",
  "Delete a highlight and its attached margin notes (cascading delete).",
  { highlight_id: z.string().describe("Highlight ID to delete") },
  async ({ highlight_id }) => withDb(() => {
    const result = deleteHighlight(getWriteDb(), highlight_id);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: "Highlight and attached notes deleted." }] };
  }),
);

server.tool(
  "margin_highlight_by_text",
  "Highlight text in a document by providing the exact text string — no position math needed. Optionally attach a margin note. The tool finds the text, calculates positions, and creates the highlight.",
  {
    document_id: z.string().describe("Document ID"),
    text_to_highlight: z.string().describe("Exact text to highlight (must appear in the document)"),
    color: z.enum(["yellow", "green", "blue", "pink", "purple", "orange"]).describe("Highlight color"),
    note: z.string().optional().describe("Optional margin note to attach"),
  },
  async (params) => withDb(() => {
    const result = highlightByText(getWriteDb(), params);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "margin_create_correction",
  "Create a writing correction: finds the text in the document, creates a highlight, and records the correction with notes. Returns correction_id, highlight_id, and session_id.",
  {
    document_id: z.string().describe("Document ID"),
    original_text: z.string().describe("Exact text to mark as a correction"),
    notes: z.array(z.string()).describe("Correction notes (e.g. what's wrong, suggested fix)"),
    writing_type: z.string().optional().describe("Writing type: general, email, prd, blog, cover-letter, resume, slack, pitch, outreach"),
    color: z.enum(["yellow", "green", "blue", "pink", "purple", "orange"]).optional().describe("Highlight color (default: yellow)"),
  },
  async (params) => withDbAndExport(() => {
    const result = createCorrection(getWriteDb(), params);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "margin_delete_correction",
  "Delete a correction and its associated highlight by highlight_id.",
  { highlight_id: z.string().describe("Highlight ID of the correction to delete") },
  async ({ highlight_id }) => withDbAndExport(() => {
    const result = deleteCorrection(getWriteDb(), highlight_id);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: "Correction and highlight deleted." }] };
  }),
);

server.tool(
  "margin_update_correction_writing_type",
  "Update the writing_type of an existing correction.",
  {
    highlight_id: z.string().describe("Highlight ID of the correction"),
    writing_type: z.string().describe("New writing type: general, email, prd, blog, cover-letter, resume, slack, pitch, outreach"),
  },
  async ({ highlight_id, writing_type }) => withDbAndExport(() => {
    const result = updateCorrectionWritingType(getWriteDb(), highlight_id, writing_type);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: "Writing type updated." }] };
  }),
);

server.tool(
  "margin_update_margin_note",
  "Update the content of an existing margin note. Returns the updated note record.",
  {
    note_id: z.string().describe("Margin note ID"),
    content: z.string().describe("New note content"),
  },
  async ({ note_id, content }) => withDb(() => {
    const result = updateMarginNote(getWriteDb(), note_id, content);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "margin_delete_margin_note",
  "Delete a single margin note without deleting its parent highlight.",
  { note_id: z.string().describe("Margin note ID to delete") },
  async ({ note_id }) => withDb(() => {
    const result = deleteMarginNote(getWriteDb(), note_id);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: "Margin note deleted." }] };
  }),
);

server.tool(
  "margin_update_highlight_color",
  "Update the color of an existing highlight.",
  {
    highlight_id: z.string().describe("Highlight ID"),
    color: z.enum(["yellow", "green", "blue", "pink", "purple", "orange"]).describe("New highlight color"),
  },
  async ({ highlight_id, color }) => withDb(() => {
    const result = updateHighlightColor(getWriteDb(), highlight_id, color);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: "Highlight color updated." }] };
  }),
);

server.tool(
  "margin_set_correction_polarity",
  "Set the polarity (voice signal) of a correction. Polarity indicates whether a correction marks something positive (to reinforce) or corrective (to fix).",
  {
    highlight_id: z.string().describe("Highlight ID of the correction"),
    polarity: z.enum(["positive", "corrective"]).describe("Voice signal polarity"),
  },
  async ({ highlight_id, polarity }) => withDbAndExport(() => {
    const result = setCorrectionPolarity(getWriteDb(), highlight_id, polarity);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: "Polarity updated." }] };
  }),
);

server.tool(
  "margin_get_voice_signals",
  "Get corrections that have been tagged with a voice signal polarity. Optionally filter by polarity (positive or corrective). Without a filter, returns all corrections with any polarity set.",
  {
    polarity: z.enum(["positive", "corrective"]).optional().describe("Filter by polarity"),
    limit: z.number().optional().describe("Max results (default 500, max 2000)"),
  },
  async ({ polarity, limit }) => withDb(() => ({
    content: [{ type: "text", text: JSON.stringify(getVoiceSignals(getReadDb(), polarity, limit), null, 2) }],
  })),
);

server.tool(
  "margin_update_writing_rule",
  "Update fields of an existing writing rule. Only provided fields are updated.",
  {
    id: z.string().describe("Writing rule ID"),
    rule_text: z.string().optional().describe("New rule text"),
    severity: z.enum(["must-fix", "should-fix", "nice-to-fix"]).optional().describe("New severity"),
    when_to_apply: z.string().nullable().optional().describe("When to apply this rule"),
    why: z.string().nullable().optional().describe("Why this rule exists"),
    example_before: z.string().nullable().optional().describe("Example of text before applying the rule"),
    example_after: z.string().nullable().optional().describe("Example of text after applying the rule"),
    notes: z.string().nullable().optional().describe("Additional notes"),
    writing_type: z.string().optional().describe("Writing type: general, email, prd, blog, cover-letter, resume, slack, pitch, outreach"),
  },
  async (params) => withDbAndExport(() => {
    const result = updateWritingRule(getWriteDb(), params);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }),
);

server.tool(
  "margin_delete_writing_rule",
  "Delete a writing rule by ID.",
  { id: z.string().describe("Writing rule ID to delete") },
  async ({ id }) => withDbAndExport(() => {
    const result = deleteWritingRule(getWriteDb(), id);
    if ("error" in result) {
      return { content: [{ type: "text", text: result.error }], isError: true };
    }
    return { content: [{ type: "text", text: "Writing rule deleted." }] };
  }),
);

// --- Export Bridge Tool ---

server.tool(
  "margin_wait_for_export",
  "Block until the user exports annotations from Margin. Call this when you want to receive annotation data. Returns formatted annotation markdown. After receiving, analyze the highlights and notes.",
  {
    timeout_seconds: z.number().optional().describe("How long to wait for an export (default 300, max 600)"),
  },
  async ({ timeout_seconds }) => {
    const timeoutMs = Math.min((timeout_seconds ?? 300), 600) * 1000;
    try {
      const prompt = await bridge.waitForExport(timeoutMs);
      return { content: [{ type: "text", text: prompt }] };
    } catch {
      return {
        content: [{ type: "text", text: "Timed out waiting for export from Margin. The user may not have exported yet — try again or ask them to export." }],
        isError: true,
      };
    }
  },
);

// --- Prompts ---

server.prompt(
  "review-annotations",
  "Review annotations across documents or for a specific document. Identifies themes and patterns in highlights and margin notes.",
  { document_id: z.string().optional().describe("Optional document ID to focus on") },
  async ({ document_id }) => {
    try {
      const db = getReadDb();
      if (document_id) {
        const doc = getDocument(db, document_id);
        const annotations = getAnnotations(db, document_id);
        const title = doc?.title ?? document_id;
        return {
          messages: [{
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Review the annotations for "${title}".\n\nAnnotations:\n${JSON.stringify(annotations, null, 2)}\n\nPlease identify key themes, patterns, and notable highlights. What are the main ideas being annotated?`,
            },
          }],
        };
      }
      // List documents with annotations
      const docs = listDocuments(db, 50);
      const docsWithAnnotations = docs
        .map((doc) => {
          const annotations = getAnnotations(db, doc.id);
          if (annotations.length === 0) return null;
          return { title: doc.title, id: doc.id, annotationCount: annotations.length };
        })
        .filter(Boolean);

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Here are my annotated documents:\n${JSON.stringify(docsWithAnnotations, null, 2)}\n\nPlease identify themes across my reading and annotations. Which documents share common topics? What patterns do you see in what I'm highlighting?`,
          },
        }],
      };
    } catch (err) {
      return {
        messages: [{
          role: "user" as const,
          content: { type: "text" as const, text: `Error loading annotations: ${err instanceof Error ? err.message : String(err)}` },
        }],
      };
    }
  },
);

server.prompt(
  "writing-feedback",
  "Analyze writing corrections and rules to identify patterns and areas for improvement.",
  { writing_type: z.string().optional().describe("Optional writing type to focus on") },
  async ({ writing_type }) => {
    try {
      const db = getReadDb();
      const corrections = getCorrections(db, undefined, 200);
      const rules = getWritingRules(db, writing_type);
      const rulesMarkdown = getWritingRulesMarkdown(rules);
      const summary = getCorrectionsSummary(db);

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Analyze my writing corrections and rules${writing_type ? ` for "${writing_type}" writing` : ""}.\n\nSummary:\n${JSON.stringify(summary, null, 2)}\n\nRecent corrections:\n${JSON.stringify(corrections.slice(0, 50), null, 2)}\n\nWriting rules:\n${rulesMarkdown}\n\nWhat patterns do you see in my corrections? Which rules am I violating most? What should I focus on improving?`,
          },
        }],
      };
    } catch (err) {
      return {
        messages: [{
          role: "user" as const,
          content: { type: "text" as const, text: `Error loading writing data: ${err instanceof Error ? err.message : String(err)}` },
        }],
      };
    }
  },
);

server.prompt(
  "reading-summary",
  "Summarize recent reading activity with annotation counts.",
  {},
  async () => {
    try {
      const db = getReadDb();
      const docs = listDocuments(db, 20);
      const docsWithCounts = docs.map((doc) => {
        const annotations = getAnnotations(db, doc.id);
        return {
          title: doc.title,
          source: doc.source,
          word_count: doc.word_count,
          last_opened_at: doc.last_opened_at,
          annotation_count: annotations.length,
        };
      });

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Here are my 20 most recent documents:\n${JSON.stringify(docsWithCounts, null, 2)}\n\nSummarize my recent reading activity. What am I reading most? Which documents have the most annotations? Any patterns in the types of content I'm engaging with?`,
          },
        }],
      };
    } catch (err) {
      return {
        messages: [{
          role: "user" as const,
          content: { type: "text" as const, text: `Error loading reading data: ${err instanceof Error ? err.message : String(err)}` },
        }],
      };
    }
  },
);

// --- Resources ---

server.resource(
  "recent-documents",
  "margin://documents",
  { description: "List of 20 most recent documents from Margin" },
  async () => {
    const docs = listDocuments(getReadDb(), 20);
    return {
      contents: [{
        uri: "margin://documents",
        mimeType: "application/json",
        text: JSON.stringify(docs, null, 2),
      }],
    };
  },
);

server.resource(
  "document-annotations",
  new ResourceTemplate("margin://documents/{id}/annotations", { list: undefined }),
  { description: "Annotations (highlights and margin notes) for a specific document" },
  async (uri, { id }) => {
    const docId = Array.isArray(id) ? id[0] : id;
    const annotations = getAnnotations(getReadDb(), docId);
    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(annotations, null, 2),
      }],
    };
  },
);

server.resource(
  "writing-rules",
  "margin://writing-rules",
  { description: "Writing rules formatted as markdown" },
  async () => {
    const rules = getWritingRules(getReadDb());
    const markdown = getWritingRulesMarkdown(rules);
    return {
      contents: [{
        uri: "margin://writing-rules",
        mimeType: "text/markdown",
        text: markdown,
      }],
    };
  },
);

server.resource(
  "corrections-summary",
  "margin://corrections/summary",
  { description: "Aggregate statistics about writing corrections" },
  async () => {
    const summary = getCorrectionsSummary(getReadDb());
    return {
      contents: [{
        uri: "margin://corrections/summary",
        mimeType: "application/json",
        text: JSON.stringify(summary, null, 2),
      }],
    };
  },
);

server.resource(
  "latest-export",
  "margin://latest-export",
  { description: "The most recent annotation export from Margin. Updated in real-time via notifications." },
  async () => {
    const content = bridge.latestExport;
    if (!content) {
      return {
        contents: [{
          uri: "margin://latest-export",
          mimeType: "text/plain",
          text: "No exports yet. The user hasn't exported annotations from Margin.",
        }],
      };
    }
    return {
      contents: [{
        uri: "margin://latest-export",
        mimeType: "text/markdown",
        text: content,
      }],
    };
  },
);

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const enabled = (process.env.MARGIN_EXPORT_BRIDGE ?? "1") !== "0";
  const preferredPort = process.env.MARGIN_EXPORT_BRIDGE_PORT
    ? Number(process.env.MARGIN_EXPORT_BRIDGE_PORT)
    : 24784;

  void startExportBridge({
    bridge,
    enabled,
    preferredPort,
    log: (...args) => console.error(...args),
  });
}

function shutdown() {
  bridge.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("MCP server error:", err);
  try {
    bridge.stop();
  } catch {
    // ignore
  }
  process.exit(1);
});
