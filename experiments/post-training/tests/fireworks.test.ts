import { describe, expect, it, vi } from "vitest";
import { probeFireworksCapabilities } from "../src/fireworks.ts";

describe("Fireworks no-spend capability probe", () => {
  it("uses GET model inspection and omits credentials from its result", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          name: "accounts/fireworks/models/qwen3-4b",
          huggingFaceUrl: "https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507",
          importedFrom: "Qwen/Qwen3-4B-Instruct-2507@fixture-revision",
          tunable: true,
          supportsLora: true,
          supportsServerless: true,
          supervisedLoraTunable: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await probeFireworksCapabilities({
      apiKey: "secret-fixture-key",
      models: [
        {
          resourceName: "accounts/fireworks/models/qwen3-4b",
          expectedHuggingFaceUrl:
            "https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507",
          expectedRevision: "fixture-revision",
        },
      ],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[1]).toMatchObject({ method: "GET" });
    expect(JSON.stringify(result)).not.toContain("secret-fixture-key");
    expect(result.models[0]).toMatchObject({
      revisionMatched: true,
      canRunManagedSft: true,
      canRunManagedDpo: true,
    });
    expect(result.customTraining).toEqual({
      access: "unverified",
      callbackTensor: "target-token-logprobs",
      fullVocabularyLogits: false,
      canRunConditionD: false,
      canRunConditionF: false,
    });
  });

  it("fails closed on a model revision mismatch", async () => {
    const result = await probeFireworksCapabilities({
      apiKey: "secret-fixture-key",
      models: [
        {
          resourceName: "accounts/fireworks/models/qwen3-4b",
          expectedHuggingFaceUrl: "https://huggingface.co/Qwen/expected-revision",
          expectedRevision: "expected-revision-hash",
        },
      ],
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            name: "accounts/fireworks/models/qwen3-4b",
            huggingFaceUrl: "https://huggingface.co/Qwen/different-revision",
            importedFrom: "Qwen/different-revision@different-hash",
            tunable: true,
            supportsLora: true,
            supervisedLoraTunable: true,
          }),
          { status: 200 },
        ),
    });

    expect(result.models[0]?.revisionMatched).toBe(false);
    expect(result.models[0]?.canRunManagedSft).toBe(false);
    expect(result.models[0]?.canRunManagedDpo).toBe(false);
  });
});
