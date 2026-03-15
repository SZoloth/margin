/**
 * Rule Study: Type definitions, register map, and prompt bank.
 *
 * 13 writing types (up from 9), with 3 prompts per type.
 * The email split (email vs email-hiring + email-friend) is an experimental
 * variable — Phase 1 generates under all three to test which scoping works better.
 */

export const WRITING_TYPES = [
  "general",
  "blog",
  "case-study",
  "cover-letter",
  "email",
  "email-hiring",
  "email-friend",
  "outreach",
  "pitch",
  "prd",
  "resume",
  "slack",
  "social-post",
  "text-friend",
] as const;

export type WritingType = (typeof WRITING_TYPES)[number];

export const REGISTER_MAP: Record<WritingType, "casual" | "professional"> = {
  general: "casual",
  blog: "professional",
  "case-study": "professional",
  "cover-letter": "professional",
  email: "casual",
  "email-hiring": "professional",
  "email-friend": "casual",
  outreach: "professional",
  pitch: "professional",
  prd: "professional",
  resume: "professional",
  slack: "casual",
  "social-post": "casual",
  "text-friend": "casual",
};

/**
 * 3 prompts per type. Each prompt is a realistic task Sam would actually ask
 * Claude to do. Prompts vary in difficulty, length, and register.
 *
 * Prompt 1: used in baseline + round 2
 * Prompt 2: used in rounds 3-4
 * Prompt 3: used in final validation (unseen until then)
 */
export const PROMPT_BANK: Record<WritingType, [string, string, string]> = {
  general: [
    "Write a 200-word blog intro about why product managers should learn to code",
    "Write a short reflection on what makes a good portfolio project — what separates a project that shows judgment from one that just shows technical ability",
    "Write a paragraph explaining why writing quality matters more than writing quantity for knowledge workers",
  ],
  blog: [
    "Write a paragraph arguing that most product roadmaps are theater",
    "Write a 300-word section about how corrections-based writing systems differ from prompt engineering — the key insight is that corrections capture editorial judgment, not just style rules",
    "Write an opening section for a post about building tools for yourself as a form of product thinking",
  ],
  "case-study": [
    "Write the 'Challenge' section of a case study about building an annotation tool that captures editorial voice. The challenge was that AI writing assistants produce generic output because they lack persistent memory of user corrections.",
    "Write the 'Approach' section describing how you designed a system where reading corrections automatically become enforceable writing rules — covering the technical architecture decisions and why SQLite was chosen as the coordination layer",
    "Write the 'Results' section of a case study about a writing quality system, focusing on measurable improvements: rule count growth, correction-per-document trends, and the shift from prompt-level to tool-level enforcement",
  ],
  "cover-letter": [
    "Write an opening paragraph for a PM role at Stripe",
    "Write a paragraph for a cover letter explaining how building Margin demonstrates product judgment — specifically how the correction-to-rule pipeline shows systems thinking applied to a real user problem",
    "Write a closing paragraph for a senior PM role that connects the candidate's experience building internal tools at DreamWorks Animation to the company's focus on developer experience",
  ],
  email: [
    "Draft a follow-up email after a job interview at a company you're excited about",
    "Draft a short email to a former colleague asking if they'd be willing to refer you for an open role at their company",
    "Write a brief email declining a recruiter's outreach for a role that isn't a good fit, while keeping the door open for future opportunities",
  ],
  "email-hiring": [
    "Draft a follow-up email to a hiring manager after a second-round interview, referencing a specific conversation point about their team's approach to discovery",
    "Write a thank-you email to a VP of Product after a final-round interview, connecting your experience building Margin to their product challenges",
    "Draft an email to a recruiter accepting an offer, confirming start date and expressing genuine enthusiasm without being over-the-top",
  ],
  "email-friend": [
    "Write a casual email to a friend you haven't talked to in a few months, catching up and mentioning you're job searching without making it the whole email",
    "Draft a quick email to a friend recommending a book you just finished — keep it natural, not like a book review",
    "Write an email to a college friend who just had a kid, congratulating them and suggesting you catch up soon",
  ],
  outreach: [
    "Draft a cold LinkedIn message to a VP of Product at a Series B startup",
    "Write a short outreach message to a product leader you admire, referencing something specific they wrote or built, and asking for a 15-minute conversation",
    "Draft a message to a hiring manager at a company where you found an open role, explaining why you're interested without rehashing your resume",
  ],
  pitch: [
    "Write the opening of a pitch deck for a reading annotation tool that captures editorial voice",
    "Write the problem slide narrative for Margin — a tool that solves the problem of AI writing assistants producing generic output by turning reading corrections into enforceable rules",
    "Write the 'Why now?' section of a pitch explaining why persistent editorial memory for AI is newly possible and newly necessary",
  ],
  prd: [
    "Write the problem statement section for a feature that adds dark mode",
    "Write the user stories section for a feature that lets users export their writing rules as a shareable voice profile that other people can import",
    "Write the success metrics section for a correction auto-synthesis pipeline — how do you measure whether automatically generated rules actually reduce future corrections",
  ],
  resume: [
    "Write a bullet point for leading a product redesign that increased retention 15%",
    "Write two bullet points for a PM resume describing the experience of building Margin — focus on the product decisions (what to build and what not to build) rather than the technology",
    "Write a bullet point about launching an internal analytics tool at DreamWorks Animation that changed how teams tracked production metrics",
  ],
  slack: [
    "Write a message asking your team to review a doc before Friday",
    "Write a Slack message to your manager giving a quick status update on a project that's slightly behind schedule — be direct about the delay without being dramatic",
    "Draft a message to a team channel proposing a change to how the team does weekly standups, keeping it casual but making a clear case",
  ],
  "social-post": [
    "Write a tweet-length post about a lesson learned from building a side project as a PM",
    "Write a short LinkedIn post announcing that you shipped a new feature in Margin — the auto-synthesis pipeline that turns corrections into rules. Keep it genuine, not performative",
    "Write a brief post sharing an insight about why most AI writing tools fail: they optimize for fluency instead of voice fidelity",
  ],
  "text-friend": [
    "Text a friend about a restaurant you just tried — you loved it and want them to go",
    "Text a friend asking if they want to grab coffee this weekend — you haven't hung out in a while",
    "Text a friend reacting to something they sent you — a podcast episode about AI that you found interesting but disagree with on a key point",
  ],
};

/** Get the prompt for a given type and round (0-indexed). */
export function getPrompt(type: WritingType, promptIndex: number): string {
  const prompts = PROMPT_BANK[type];
  return prompts[Math.min(promptIndex, prompts.length - 1)];
}

/**
 * Types to generate in the baseline round.
 * Includes the email experiment: email + email-hiring + email-friend.
 */
export const BASELINE_TYPES: WritingType[] = WRITING_TYPES.filter(
  (t) => t !== "general"
);
