/**
 * Architecture Skill: Full skill invocation simulation.
 * Reads SKILL.md + runs `margin export coaching-prompt` to build the same
 * context Claude would see when /writing-voice triggers, then generates via
 * `claude --print`.
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { cleanEnv, stripMetaCommentary } from "../../shared.ts";

const SKILL_PATH = join(
  homedir(),
  ".claude/skills/writing-voice/SKILL.md"
);

function loadSkillMd(): string {
  return readFileSync(SKILL_PATH, "utf-8");
}

function loadCoachingPrompt(type: string, register: string): string {
  try {
    return execSync(
      `margin export coaching-prompt --type ${type} --register ${register}`,
      { encoding: "utf-8", timeout: 15_000, env: cleanEnv() }
    ).trim();
  } catch (err) {
    console.error(
      `Failed to load coaching prompt for ${type}/${register}:`,
      (err as Error).message
    );
    return "";
  }
}

export function generate(
  type: string,
  prompt: string,
  register: string
): string {
  const skillMd = loadSkillMd();
  const coaching = loadCoachingPrompt(type, register);

  if (!coaching) {
    console.error(`No coaching context for ${type}/${register} — skipping`);
    return "";
  }

  const fullPrompt = `<skill-instructions>
${skillMd}
</skill-instructions>

<coaching-context>
${coaching}
</coaching-context>

Writing type: ${type}
Register: ${register}
${type === "email" || type === "outreach" || type === "slack" ? "Keep it SHORT. Emails: 3-5 sentences max. Outreach: 2-3 sentences max. Slack: 1-2 sentences." : ""}
${type === "resume" ? "One bullet point only. Under 30 words." : ""}

Output ONLY the prose — no commentary, critique, word counts, or meta-discussion. No bracketed coaching instructions like [One sentence about why...]. Short placeholder names like [Name] or [Company] are fine.

${prompt}`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: fullPrompt,
      encoding: "utf-8",
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv(),
    });
    return stripMetaCommentary(result.trim());
  } catch (err) {
    console.error("Generation failed:", (err as Error).message);
    return "";
  }
}
