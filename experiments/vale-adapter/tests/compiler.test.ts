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
});
