import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db.js";
import {
  getWritingRules,
  getWritingRulesMarkdown,
  updateWritingRule,
  deleteWritingRule,
  createWritingRule,
  getWritingProfileMarkdown,
  getWritingGuardPy,
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

describe("updateWritingRule", () => {
  it("updates rule_text and returns updated record", () => {
    insertRule("r1", "general", "ai-slop", "Old rule text", "must-fix");

    const result = updateWritingRule(db, { id: "r1", rule_text: "New rule text" });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.ruleText).toBe("New rule text");
      expect(result.category).toBe("ai-slop");
    }
  });

  it("updates multiple fields", () => {
    insertRule("r1", "general", "tone", "Be direct", "should-fix");

    const result = updateWritingRule(db, {
      id: "r1",
      severity: "must-fix",
      why: "Important for clarity",
      notes: "Updated note",
    });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.severity).toBe("must-fix");
      expect(result.why).toBe("Important for clarity");
      expect(result.notes).toBe("Updated note");
    }
  });

  it("errors for nonexistent rule", () => {
    const result = updateWritingRule(db, { id: "nonexistent", rule_text: "test" });
    expect(result).toHaveProperty("error");
  });

  it("rejects invalid severity", () => {
    insertRule("r1", "general", "tone", "Rule", "should-fix");
    const result = updateWritingRule(db, { id: "r1", severity: "invalid" });
    expect(result).toHaveProperty("error");
  });

  it("rejects invalid writing_type", () => {
    insertRule("r1", "general", "tone", "Rule", "should-fix");
    const result = updateWritingRule(db, { id: "r1", writing_type: "invalid" });
    expect(result).toHaveProperty("error");
  });

  it("errors when no fields to update", () => {
    insertRule("r1", "general", "tone", "Rule", "should-fix");
    const result = updateWritingRule(db, { id: "r1" });
    expect(result).toHaveProperty("error");
  });
});

describe("deleteWritingRule", () => {
  it("deletes a rule", () => {
    insertRule("r1", "general", "tone", "Be direct", "should-fix");

    const result = deleteWritingRule(db, "r1");
    expect(result).toHaveProperty("success");

    const count = (db.prepare("SELECT COUNT(*) as c FROM writing_rules").get() as { c: number }).c;
    expect(count).toBe(0);
  });

  it("errors for nonexistent rule", () => {
    const result = deleteWritingRule(db, "nonexistent");
    expect(result).toHaveProperty("error");
  });
});

describe("createWritingRule", () => {
  it("creates rule with all fields and returns complete WritingRule", () => {
    const result = createWritingRule(db, {
      rule_text: "Avoid passive voice",
      writing_type: "general",
      category: "tone",
      severity: "must-fix",
      when_to_apply: "Any sentence with was/were + past participle",
      why: "Passive voice weakens prose",
      example_before: "The report was written by the team.",
      example_after: "The team wrote the report.",
      notes: "Common in academic writing",
      source: "manual",
      signal_count: 3,
    });

    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.id).toBeTruthy();
      expect(result.writingType).toBe("general");
      expect(result.category).toBe("tone");
      expect(result.ruleText).toBe("Avoid passive voice");
      expect(result.whenToApply).toBe("Any sentence with was/were + past participle");
      expect(result.why).toBe("Passive voice weakens prose");
      expect(result.severity).toBe("must-fix");
      expect(result.exampleBefore).toBe("The report was written by the team.");
      expect(result.exampleAfter).toBe("The team wrote the report.");
      expect(result.source).toBe("manual");
      expect(result.signalCount).toBe(3);
      expect(result.notes).toBe("Common in academic writing");
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    }
  });

  it("defaults source to 'synthesis' and signal_count to 1 when omitted", () => {
    const result = createWritingRule(db, {
      rule_text: "Be concise",
      writing_type: "email",
      category: "brevity",
      severity: "should-fix",
    });

    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.source).toBe("synthesis");
      expect(result.signalCount).toBe(1);
    }
  });

  it("rejects invalid severity", () => {
    const result = createWritingRule(db, {
      rule_text: "Some rule",
      writing_type: "general",
      category: "tone",
      severity: "critical",
    });

    expect(result).toHaveProperty("error");
  });

  it("rejects invalid writing_type", () => {
    const result = createWritingRule(db, {
      rule_text: "Some rule",
      writing_type: "tweet",
      category: "tone",
      severity: "must-fix",
    });

    expect(result).toHaveProperty("error");
  });

  it("rejects invalid signal_count", () => {
    const result = createWritingRule(db, {
      rule_text: "Some rule",
      writing_type: "general",
      category: "tone",
      severity: "must-fix",
      signal_count: 0,
    });

    expect(result).toHaveProperty("error");
  });

  it("coalesces duplicate create into update and increments signal_count", () => {
    const first = createWritingRule(db, {
      rule_text: "No filler",
      writing_type: "general",
      category: "brevity",
      severity: "should-fix",
      signal_count: 1,
    });
    expect(first).not.toHaveProperty("error");
    if ("error" in first) {
      throw new Error(first.error);
    }

    const second = createWritingRule(db, {
      rule_text: "No filler",
      writing_type: "general",
      category: "brevity",
      severity: "must-fix",
      signal_count: 4,
      when_to_apply: "On long paragraphs",
    });
    expect(second).not.toHaveProperty("error");
    if ("error" in second) {
      throw new Error(second.error);
    }

    // Same logical rule should be merged, not duplicated.
    expect(second.id).toBe(first.id);
    expect(second.signalCount).toBe(5);
    expect(second.severity).toBe("must-fix");
    expect(second.whenToApply).toBe("On long paragraphs");

    const all = getWritingRules(db, "general");
    expect(all).toHaveLength(1);
  });

  it("round-trips unicode rule_text correctly", () => {
    const unicodeText = "Avoid clich\u00e9s \u2014 use fresh language \ud83d\udcdd \u4f60\u597d";
    const result = createWritingRule(db, {
      rule_text: unicodeText,
      writing_type: "blog",
      category: "style",
      severity: "nice-to-fix",
    });

    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.ruleText).toBe(unicodeText);
    }
  });
});

describe("getWritingProfileMarkdown", () => {
  it("returns header only for empty rules and corrections", () => {
    const md = getWritingProfileMarkdown([], []);
    expect(md).toContain("# Writing Profile");
    expect(md).not.toContain("## ");
  });

  it("produces Voice Calibration section for voice-calibration rules", () => {
    insertRule("r1", "general", "voice-calibration", "Short sentences preferred", "must-fix", {
      whenToApply: "All prose",
      why: "Matches author's natural voice",
    });

    const rules = getWritingRules(db);
    const md = getWritingProfileMarkdown(rules, []);

    expect(md).toContain("## Voice Calibration");
    expect(md).not.toContain("## Writing Rules");
    expect(md).toContain("Short sentences preferred");
  });

  it("produces Writing Samples section for positive corrections", () => {
    const md = getWritingProfileMarkdown([], [
      { originalText: "This is a well-crafted sentence.", notes: ["Great rhythm"], polarity: "positive" },
    ]);

    expect(md).toContain("## Writing Samples");
    expect(md).toContain("> This is a well-crafted sentence.");
    expect(md).toContain("Great rhythm");
  });

  it("produces Corrections section for corrective corrections", () => {
    const md = getWritingProfileMarkdown([], [
      { originalText: "It's important to note that", notes: ["Filler phrase", "Cut entirely"], polarity: "corrective" },
    ]);

    expect(md).toContain("## Corrections");
    expect(md).toContain("**It's important to note that**");
    expect(md).toContain("Filler phrase; Cut entirely");
  });

  it("produces Unclassified section with 120-char truncation and 'flagged' for empty notes", () => {
    const longText = "A".repeat(150);
    const md = getWritingProfileMarkdown([], [
      { originalText: longText, notes: [], polarity: null },
    ]);

    expect(md).toContain("## Unclassified");
    // Truncated to 120 chars + ellipsis
    expect(md).toContain("A".repeat(120) + "\u2026");
    expect(md).toContain("flagged");
  });
});

describe("getWritingGuardPy", () => {
  it("produces valid Python with empty KILL_WORDS and SLOP_PATTERNS for no rules", () => {
    const py = getWritingGuardPy([]);
    expect(py).toContain("KILL_WORDS = json.loads(r\"\"\"[]\"\"\"");
    expect(py).toContain("SLOP_PATTERNS = json.loads(r\"\"\"[]\"\"\"");
    expect(py).toContain("#!/usr/bin/env python3");
  });

  it("includes only must-fix kill-words category in KILL_WORDS", () => {
    insertRule("r1", "general", "kill-words", "leverage", "must-fix");
    insertRule("r2", "general", "kill-words", "synergy", "should-fix"); // wrong severity
    insertRule("r3", "general", "tone", "be direct", "must-fix"); // wrong category

    const rules = getWritingRules(db);
    const py = getWritingGuardPy(rules);

    expect(py).toContain("leverage");
    expect(py).not.toContain("synergy");
    expect(py).not.toContain("be direct");
  });

  it("includes only ai-slop category with exampleBefore in SLOP_PATTERNS", () => {
    insertRule("r1", "general", "ai-slop", "Negative parallelism", "must-fix", {
      exampleBefore: "The hard part isn't X",
    });
    insertRule("r2", "general", "ai-slop", "Rule of three padding", "must-fix"); // no exampleBefore
    insertRule("r3", "general", "tone", "Some rule", "must-fix", {
      exampleBefore: "example",
    }); // wrong category

    const rules = getWritingRules(db);
    const py = getWritingGuardPy(rules);

    expect(py).toContain("Negative parallelism");
    expect(py).toContain("The hard part isn't X");
    expect(py).not.toContain("Rule of three padding");
    expect(py).not.toContain("Some rule");
  });

  it("safely handles rule text containing triple quotes without injection", () => {
    // JSON.stringify escapes double quotes, so '"""' in rule text becomes '\"\"\"'
    // in the serialized JSON. The triple-quote guard is defense-in-depth; here we
    // verify that triple-quote rule text produces a valid Python script (not the
    // error script), because JSON.stringify prevents the injection.
    insertRule("r1", "general", "kill-words", '"""', "must-fix");

    const rules = getWritingRules(db);
    const py = getWritingGuardPy(rules);

    // JSON serialization escapes the quotes, so the guard doesn't trigger
    expect(py).toContain("KILL_WORDS");
    expect(py).toContain("#!/usr/bin/env python3");
    expect(py).not.toContain("triple-quote injection blocked");
  });

  it("JSON-escapes special chars in rule text", () => {
    insertRule("r1", "general", "kill-words", 'word with "quotes" and \\backslash', "must-fix");

    const rules = getWritingRules(db);
    const py = getWritingGuardPy(rules);

    // The rule text should be JSON-encoded inside the Python script
    expect(py).toContain('\\"quotes\\"');
    expect(py).toContain("\\\\backslash");
  });
});
