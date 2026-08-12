import { describe, expect, it } from "vitest";
import fixture from "../fixtures/cases.json";
import { compileValeProject } from "../src/compiler.ts";

describe("compileValeProject", () => {
  it("creates derived styles for reviewed executable rules", () => {
    const project = compileValeProject(fixture.rules);

    expect(project.files[".vale.ini"]).toContain("BasedOnStyles = MarginGeneral");
    expect(project.files["styles/MarginGeneral/HedgingPileup.yml"]).toContain(
      "extends: existence",
    );
    expect(project.files["styles/MarginCoverLetter/CoverLetterCliche.yml"]).toContain(
      "level: error",
    );
    expect(Object.values(project.files).join("\n")).not.toContain("pending phrase");
  });

  it("keeps database rule ids in the check map", () => {
    const project = compileValeProject(fixture.rules);

    expect(project.checkToRuleId["MarginGeneral.HedgingPileup"]).toBe("hedging-pileup");
    expect(project.checkToRuleId["MarginCoverLetter.CoverLetterCliche"]).toBe(
      "cover-letter-cliche",
    );
  });

  it("does not enable an empty writing-type style", () => {
    const project = compileValeProject(fixture.rules, "blog");

    expect(project.files[".vale.ini"]).toContain("BasedOnStyles = MarginGeneral");
    expect(project.files[".vale.ini"]).not.toContain("MarginBlog");
  });

  it("uses raw scope when a rule targets Markdown syntax", () => {
    const project = compileValeProject([
      {
        id: "inline-header",
        writingType: "general",
        category: "structure",
        ruleText: "Avoid inline-header bullets.",
        severity: "should-fix",
        detectionPattern: String.raw`(?m)^[-*] \*\*[^*\n]+:\*\*`,
        source: "manual",
        reviewedAt: 1,
      },
    ]);

    expect(project.files["styles/MarginGeneral/InlineHeader.yml"]).toContain("scope: raw");
  });
});
