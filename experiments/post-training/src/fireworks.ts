export type TrainingApiAccess = "unverified" | "granted" | "denied";

export interface FireworksModelTarget {
  resourceName: string;
  expectedHuggingFaceUrl: string;
  expectedRevision: string;
}

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface FireworksProbeOptions {
  apiKey?: string;
  models: FireworksModelTarget[];
  fetchImpl?: FetchImplementation;
  apiBaseUrl?: string;
  customTrainingAccess?: TrainingApiAccess;
}

interface FireworksModelResponse {
  name?: string;
  huggingFaceUrl?: string;
  importedFrom?: string;
  tunable?: boolean;
  supportsLora?: boolean;
  supportsServerless?: boolean;
  supervisedLoraTunable?: boolean;
  baseModelDetails?: {
    huggingfaceFiles?: string[];
  };
}

function parseResourceName(resourceName: string): { accountId: string; modelId: string } {
  const match = /^accounts\/([^/]+)\/models\/([^/]+)$/.exec(resourceName);
  if (!match?.[1] || !match[2]) {
    throw new Error(`invalid Fireworks model resource: ${resourceName}`);
  }
  return { accountId: match[1], modelId: match[2] };
}

function normalizeUrl(value: string | undefined): string {
  return (value ?? "").replace(/\/$/u, "").toLocaleLowerCase("en-US");
}

function customTrainingResult(access: TrainingApiAccess) {
  return {
    access,
    callbackTensor: "target-token-logprobs" as const,
    fullVocabularyLogits: false,
    canRunConditionD: false,
    canRunConditionF: false,
  };
}

export async function probeFireworksCapabilities(options: FireworksProbeOptions) {
  const customTraining = customTrainingResult(
    options.customTrainingAccess ?? "unverified",
  );
  if (!options.apiKey) {
    return {
      schemaVersion: 1,
      credentials: "missing" as const,
      paidJobStarted: false,
      models: [],
      customTraining,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.fireworks.ai").replace(/\/$/u, "");
  const models = [];
  for (const target of options.models) {
    const { accountId, modelId } = parseResourceName(target.resourceName);
    const response = await fetchImpl(
      `${apiBaseUrl}/v1/accounts/${encodeURIComponent(accountId)}/models/${encodeURIComponent(modelId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      models.push({
        resourceName: target.resourceName,
        accessible: false,
        revisionMatched: false,
        canRunManagedSft: false,
        canRunManagedDpo: false,
        error: `HTTP ${response.status}`,
      });
      continue;
    }

    const model = (await response.json()) as FireworksModelResponse;
    const sourceMatched =
      normalizeUrl(model.huggingFaceUrl) === normalizeUrl(target.expectedHuggingFaceUrl);
    const revisionEvidence = [
      model.importedFrom,
      ...(model.baseModelDetails?.huggingfaceFiles ?? []),
    ].filter((value): value is string => typeof value === "string");
    const revisionMatched =
      sourceMatched &&
      target.expectedRevision.trim().length > 0 &&
      revisionEvidence.some((value) => value.includes(target.expectedRevision));
    const supportsLora = model.supportsLora === true;
    const tunable = model.tunable === true;

    models.push({
      resourceName: model.name ?? target.resourceName,
      accessible: true,
      huggingFaceUrl: model.huggingFaceUrl ?? null,
      sourceMatched,
      revisionMatched,
      tunable,
      supportsLora,
      supportsServerless: model.supportsServerless === true,
      supervisedLoraTunable: model.supervisedLoraTunable === true,
      canRunManagedSft:
        revisionMatched && tunable && supportsLora && model.supervisedLoraTunable === true,
      canRunManagedDpo: revisionMatched && tunable && supportsLora,
    });
  }

  return {
    schemaVersion: 1,
    credentials: "present" as const,
    paidJobStarted: false,
    models,
    customTraining,
  };
}
