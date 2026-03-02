import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db.js";
import {
  getWritingRules,
  getWritingRulesMarkdown,
} from "../tools/writing-rules.js";

let db: Database.Database;

function insertRule(
  id: string,
  writingType: string,
  category: string,
  ruleText: string,
  severity: string,
  opts: {
    whenToApply?: string;
    why?: string;
    exampleBefore?: string;
    exampleAfter?: string;
    signalCount?: number;
    notes?: string;
  } = {},
) {
  db.prepare(
    `INSERT INTO writing_rules
       (id, writing_type, category, rule_text, when_to_apply, why, severity,
        example_before, example_after, source, signal_count, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, 1000, 1000)`,
  ).run(
    id,
    writingType,
    category,
    ruleText,
    opts.whenToApply ?? null,
    opts.why ?? null,
    severity,
    opts.exampleBefore ?? null,
    opts.exampleAfter ?? null,
    opts.signalCount ?? 1,
    opts.notes ?? null,
  );
}

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe("getWritingRules", () => {
  it("returns all rules", () => {
    insertRule("r1", "general", "ai-slop", "No parallelism", "must-fix");
    insertRule("r2", "email", "tone", "Be direct", "should-fix");

    const rules = getWritingRules(db);
    expect(rules).toHaveLength(2);
  });

  it("filters by writing_type", () => {
    insertRule("r1", "general", "ai-slop", "No parallelism", "must-fix");
    insertRule("r2", "email", "tone", "Be direct", "should-fix");
    insertRule("r3", "email", "hedging", "No hedging", "should-fix");

    const rules = getWritingRules(db, "email");
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r.writingType === "email")).toBe(true);
  });

  it("returns empty array for empty table", () => {
    expect(getWritingRules(db)).toHaveLength(0);
  });

  it("orders by signal_count DESC", () => {
    insertRule("r1", "general", "tone", "Rule A", "should-fix", {
      signalCount: 1,
    });
    insertRule("r2", "general", "tone", "Rule B", "should-fix", {
      signalCount: 5,
    });

    const rules = getWritingRules(db, "general");
    expect(rules[0].ruleText).toBe("Rule B");
    expect(rules[1].ruleText).toBe("Rule A");
  });
});

describe("getWritingRulesMarkdown", () => {
  it("has header and agent instruction", () => {
    const md = getWritingRulesMarkdown([]);
    expect(md).toContain("# Writing Rules");
    expect(md).toContain("_For AI agents:");
  });

  it("groups by writing_type with General first", () => {
    insertRule("r1", "general", "ai-slop", "No parallelism", "must-fix");
    insertRule("r2", "blog", "structure", "Use transitions", "should-fix");
    insertRule("r3", "general", "tone", "Be human", "should-fix");

    const rules = getWritingRules(db);
    const md = getWritingRulesMarkdown(rules);

    expect(md).toContain("## General");
    expect(md).toContain("## Blog / essay");

    const genPos = md.indexOf("## General");
    const blogPos = md.indexOf("## Blog / essay");
    expect(genPos).toBeLessThan(blogPos);
  });

  it("includes rule details with severity badge", () => {
    insertRule("r1", "general", "ai-slop", "No negative parallelism", "must-fix", {
      whenToApply: "Any sentence with isn't X, it's Y",
      why: "AI slop marker",
      exampleBefore: "The issue isn't X. It's Y.",
      exampleAfter: "State directly: Y is the real issue.",
      signalCount: 3,
    });

    const rules = getWritingRules(db);
    const md = getWritingRulesMarkdown(rules);

    expect(md).toContain("**Rule: No negative parallelism** [must-fix]");
    expect(md).toContain("- When to apply: Any sentence with isn't X, it's Y");
    expect(md).toContain("- Why: AI slop marker");
    expect(md).toContain("- Signal: seen 3 time(s)");
    expect(md).toContain('Before: "The issue isn\'t X. It\'s Y."');
    expect(md).toContain('After: "State directly: Y is the real issue."');
  });

  it("sub-groups by category with title-cased headers", () => {
    insertRule("r1", "general", "ai-slop", "Rule 1", "must-fix");
    insertRule("r2", "general", "argument-rigor", "Rule 2", "should-fix");

    const rules = getWritingRules(db);
    const md = getWritingRulesMarkdown(rules);

    expect(md).toContain("### Ai Slop");
    expect(md).toContain("### Argument Rigor");
  });

  it("returns minimal markdown for empty rules", () => {
    const md = getWritingRulesMarkdown([]);
    expect(md).toContain("# Writing Rules");
    expect(md).not.toContain("##");
  });
});
