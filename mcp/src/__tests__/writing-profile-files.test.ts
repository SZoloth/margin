import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadFullWritingProfile } from "../../scripts/shared";

describe("loadFullWritingProfile", () => {
  it("joins the entry file with every per-type file", () => {
    const home = mkdtempSync(join(tmpdir(), "margin-profile-"));
    mkdirSync(join(home, ".margin", "writing-rules"), { recursive: true });
    writeFileSync(join(home, ".margin", "writing-rules.md"), "# Writing Profile\nentry rule\n");
    writeFileSync(join(home, ".margin", "writing-rules", "email.md"), "# Email\nemail rule\n");
    writeFileSync(join(home, ".margin", "writing-rules", "notes.txt"), "not a rule file");

    const text = loadFullWritingProfile(home);

    expect(text).toContain("entry rule");
    expect(text).toContain("email rule");
    expect(text).not.toContain("not a rule file");
    expect(text.indexOf("entry rule")).toBeLessThan(text.indexOf("email rule"));
  });

  it("returns an empty string when there is no profile", () => {
    const home = mkdtempSync(join(tmpdir(), "margin-profile-"));
    expect(loadFullWritingProfile(home)).toBe("");
  });
});
