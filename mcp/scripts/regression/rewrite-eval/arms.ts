/** The five arms of the humanizer comparison. See docs/humanizer-baseline-eval.md. */
import { execSync } from "child_process";
import { cleanEnv, evalCmd, stripMetaCommentary } from "../../shared.ts";
import { genericEditPrompt, ruleEditPrompt } from "./prompts.ts";

export const ARMS = ["a0", "a1", "a2", "a3", "a4"] as const;
export type Arm = (typeof ARMS)[number];

export const ARM_LABELS: Record<Arm, string> = {
  a0: "identity",
  a1: "generic-editor",
  a2: "humanizer",
  a3: "margin-editor",
  a4: "humanizer+margin",
};

export function isArm(s: string): s is Arm {
  return (ARMS as readonly string[]).includes(s);
}

/** stdin to stdout; throws on non-zero exit or timeout so a failure is never scored as output. */
export function runCmd(cmd: string, input: string, timeoutMs: number): string {
  return execSync(cmd, {
    input,
    encoding: "utf-8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    env: cleanEnv(),
  }).trim();
}

export function humanizerCmd(): string {
  return process.env.MARGIN_HUMANIZER_CMD ?? "python3 scripts/regression/humanizer-cmd.py";
}

export interface ArmContext {
  rules: string;
}

export interface Runners {
  editor: (prompt: string) => string;
  humanizer: (draft: string) => string;
}

export const defaultRunners: Runners = {
  editor: (prompt) => stripMetaCommentary(runCmd(evalCmd(), prompt, 180_000)),
  humanizer: (draft) => runCmd(humanizerCmd(), draft, 600_000),
};

/** a2Output lets the caller reuse an existing humanizer sample for a4. */
export function runArm(
  arm: Arm,
  draft: string,
  ctx: ArmContext,
  runners: Runners = defaultRunners,
  a2Output?: string,
): string {
  switch (arm) {
    case "a0":
      return draft;
    case "a1":
      return runners.editor(genericEditPrompt(draft));
    case "a2":
      return runners.humanizer(draft);
    case "a3":
      return runners.editor(ruleEditPrompt(draft, ctx.rules));
    case "a4": {
      const h = a2Output ?? runners.humanizer(draft);
      return runners.editor(ruleEditPrompt(h, ctx.rules));
    }
  }
}
