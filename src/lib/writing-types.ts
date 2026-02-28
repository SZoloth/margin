export const WRITING_TYPES = [
  { value: "general", label: "General" },
  { value: "email", label: "Email" },
  { value: "prd", label: "PRD" },
  { value: "blog", label: "Blog" },
  { value: "cover-letter", label: "Cover letter" },
  { value: "resume", label: "Resume" },
  { value: "slack", label: "Slack" },
  { value: "pitch", label: "Pitch" },
  { value: "outreach", label: "Outreach" },
] as const;

export type WritingType = (typeof WRITING_TYPES)[number]["value"];
