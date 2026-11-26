import { describe, it, expect } from "vitest";
import { scanStructuralTells } from "../../scripts/compliance-check.ts";

describe("scanStructuralTells psycholinguistic checks (arXiv:2610.29162)", () => {
  it("catches inanimate subject with animate verb", () => {
    const hits = scanStructuralTells(
      "Inference and training workloads buy compute in very different ways."
    );
    expect(hits.some((h) => h.pattern.includes("Animacy violation"))).toBe(true);
  });

  it("catches backwards cleft and topic-stress inversions", () => {
    const hits = scanStructuralTells(
      "MemoryAlloy is what makes that shift an opportunity, and the scarce part is reliability."
    );
    expect(hits.some((h) => h.pattern.includes("Backwards cleft"))).toBe(true);
  });

  it("catches AI framing tells (nobody [verb]ed, quietly, timing feels right)", () => {
    const hits = scanStructuralTells(
      "The timing feels right because decisions nobody reviewed quietly piled up."
    );
    expect(hits.some((h) => h.pattern.includes("AI framing tell"))).toBe(true);
  });

  it("passes clean human prose with zero false positives", () => {
    const hits = scanStructuralTells(
      "Teams running inference buy compute differently than teams training foundation models. " +
        "We shipped 3 features at DreamWorks and cut lookup time from 15 minutes to seconds."
    );
    expect(hits).toEqual([]);
  });
});
