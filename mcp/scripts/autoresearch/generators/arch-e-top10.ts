/**
 * Architecture E-top10 (Scenario B): corrections + top-10 rules.
 *
 * The experiment log's pending hypothesis — keep arch-d's correction data
 * but replace the 40-rule dump with the top 10 by signal_count, applying
 * the arch-a-top10 finding (10 high-signal rules beat volume) to the
 * hybrid's stronger data layer.
 */

import { generateWithRuleLimit } from "./arch-e-hybrid.ts";

export function generate(type: string, prompt: string, register: string): string {
  return generateWithRuleLimit(type, prompt, register, 10);
}
