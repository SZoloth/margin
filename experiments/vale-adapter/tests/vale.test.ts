import { describe, expect, it } from "vitest";
import { parseValeAlerts } from "../src/vale.ts";

describe("parseValeAlerts", () => {
  it("maps Vale checks back to Margin rule ids with source positions", () => {
    const alerts = parseValeAlerts(
      JSON.stringify({
        "draft.md": [
          {
            Check: "MarginGeneral.HedgingPileup",
            Severity: "warning",
            Message: "Avoid stacked hedges.",
            Match: "could potentially",
            Line: 2,
            Span: [4, 20]
          }
        ]
      }),
      { "MarginGeneral.HedgingPileup": "hedging-pileup" },
    );

    expect(alerts).toEqual([
      {
        path: "draft.md",
        ruleId: "hedging-pileup",
        severity: "warning",
        message: "Avoid stacked hedges.",
        match: "could potentially",
        line: 2,
        span: [4, 20]
      }
    ]);
  });
});
