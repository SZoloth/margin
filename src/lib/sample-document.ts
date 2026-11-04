/** The first-run sample is on screen whenever text is loaded without a file behind it. */
export function isShowingSample(currentDoc: unknown, content: string): boolean {
  return currentDoc === null && content.length > 0;
}

/** On first launch the sample is written here and opened like any other file. */
export const SAMPLE_FILE_NAME = "first-draft.md";

export function isSampleFilePath(path: string | null | undefined): boolean {
  if (!path) return false;
  return /[\\/]\.margin[\\/]samples[\\/]first-draft\.md$/.test(path);
}

/**
 * The tells planted in the sample. Each appears in both drafts, so a phrase
 * banned in the first draft is visibly caught again in the second.
 */
export const SAMPLE_PLANTED_TELLS = [
  "I hope this finds you well",
  "delve into",
  "leverage",
  "it's not just",
  "explore this further",
] as const;

/** Mirrors MAX_NEVER_PHRASE_CHARS in src-tauri/src/commands/onboarding.rs. */
export const MAX_NEVER_PHRASE_CHARS = 60;

/** Whether a selection is short enough to ban word for word. */
export function canNeverWrite(text: string): boolean {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 0 && t.length <= MAX_NEVER_PHRASE_CHARS;
}

export const SAMPLE_DOCUMENT_CONTENT = `# A draft from an AI assistant

*An AI wrote the email below. Select a phrase you'd never write and choose **Never write this**. Margin will catch it from then on, here and in anything else you open.*

Hi Jordan,

I hope this finds you well! I wanted to reach out and delve into how our team can leverage the new reporting dashboard. It's not just a tool, it's a whole new way of working together.

The dashboard is fast, flexible, and, most importantly, built for the way you actually work. In today's fast-paced landscape, real-time insight isn't a luxury anymore. It's a necessity.

Happy to set up a quick call if you'd like to explore this further!

Best,
Alex

## Another AI draft

*Rules you make above are underlined here too.*

Hi Priya,

I hope this finds you well. Before Thursday's sync, I'd love to delve into the Q3 numbers and leverage what we learned from the pilot. It's not just a report, it's a roadmap for next year.

Let me know if you'd like to explore this further.

Thanks,
Alex
`;
