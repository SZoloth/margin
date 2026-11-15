import { describe, expect, it } from "vitest";
import { rangeLaunch, wholeDocumentLaunch } from "../learn-launch";

const BODY = "I went to the woods because I wished to live deliberately, to front only the essential facts of life.";

describe("learn launch", () => {
  it("lifts a leading heading into the header and types the prose under it", () => {
    const flat = `Walden\n${BODY}`;
    const launch = wholeDocumentLaunch(flat, "Walden", "Welcome to Margin");
    expect(launch).toMatchObject({
      title: "Walden",
      text: BODY,
      flatFrom: "Walden\n".length,
      passageKey: "document",
      mapCaret: true,
    });
  });

  it("uses the document title when the work has no heading", () => {
    const launch = wholeDocumentLaunch(BODY, null, "Notes");
    expect(launch).toMatchObject({
      title: "Notes",
      text: BODY,
      flatFrom: 0,
      passageKey: "document",
    });
  });

  it("types the heading itself when there is no prose under it", () => {
    const launch = wholeDocumentLaunch("Walden", "Walden", "Notes");
    expect(launch).toMatchObject({ title: "Notes", text: "Walden", flatFrom: 0 });
    expect(wholeDocumentLaunch("Walden", "Walden", null)?.title).toBe("Walden");
  });

  it("refuses a blank document", () => {
    expect(wholeDocumentLaunch(" \n\n ", null, "Notes")).toBeNull();
  });

  it("launches a selection inside the work without taking the rest of it", () => {
    const from = BODY.indexOf("essential facts");
    const launch = rangeLaunch(BODY, from, from + "essential facts".length, "Walden");
    expect(launch).toMatchObject({
      title: "Walden",
      text: "essential facts",
      flatFrom: from,
      mapCaret: true,
    });
    expect(launch?.passageKey.startsWith("passage:")).toBe(true);
    expect(rangeLaunch(BODY, from, from, "Walden")).toBeNull();
  });

  it("gives the same selection the same passage key", () => {
    const a = rangeLaunch(BODY, 2, 10, "Walden");
    const b = rangeLaunch(`${BODY} more`, 2, 10, "Other");
    expect(a?.passageKey).toBe(b?.passageKey);
  });
});
