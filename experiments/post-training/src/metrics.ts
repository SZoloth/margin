function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
  );
}

function ngrams(tokens: string[], size: number): string[] {
  const values: string[] = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    values.push(tokens.slice(index, index + size).join(" "));
  }
  return values;
}

function distribution(texts: string[], size: number): Map<string, number> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const text of texts) {
    for (const value of ngrams(tokenize(text), size)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
      total += 1;
    }
  }
  if (total === 0) return new Map();
  return new Map([...counts].map(([key, count]) => [key, count / total]));
}

export function ngramL2Distance(
  candidateTexts: string[],
  referenceTexts: string[],
  size: number,
): number {
  if (!Number.isInteger(size) || size < 1) throw new Error("ngram size must be positive");
  const candidate = distribution(candidateTexts, size);
  const reference = distribution(referenceTexts, size);
  const keys = new Set([...candidate.keys(), ...reference.keys()]);
  let squaredDistance = 0;
  for (const key of keys) {
    const difference = (candidate.get(key) ?? 0) - (reference.get(key) ?? 0);
    squaredDistance += difference * difference;
  }
  return Math.sqrt(squaredDistance);
}

function distinctRatio(texts: string[], size: number): number {
  const values = texts.flatMap((text) => ngrams(tokenize(text), size));
  return values.length === 0 ? 0 : new Set(values).size / values.length;
}

function repeatedSentenceStarts(texts: string[]): number {
  const starts = texts.flatMap((text) =>
    text
      .split(/[.!?]+/u)
      .map((sentence) => tokenize(sentence).slice(0, 3).join(" "))
      .filter(Boolean),
  );
  const counts = new Map<string, number>();
  for (const start of starts) counts.set(start, (counts.get(start) ?? 0) + 1);
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

export function corpusMetrics(texts: string[], factualConstraints: string[]) {
  const combined = texts.join("\n").normalize("NFKC").toLocaleLowerCase("en-US");
  const matched = factualConstraints.filter((constraint) =>
    combined.includes(constraint.normalize("NFKC").toLocaleLowerCase("en-US")),
  );
  const missing = factualConstraints.filter((constraint) => !matched.includes(constraint));
  const tokens = texts.flatMap(tokenize);

  return {
    documents: texts.length,
    characters: texts.reduce((total, text) => total + text.length, 0),
    tokens: tokens.length,
    distinctNgramRatio: {
      one: distinctRatio(texts, 1),
      two: distinctRatio(texts, 2),
      three: distinctRatio(texts, 3),
    },
    repeatedSentenceStarts: repeatedSentenceStarts(texts),
    factualConstraints: {
      total: factualConstraints.length,
      matched,
      missing,
      recall: factualConstraints.length === 0 ? 1 : matched.length / factualConstraints.length,
    },
  };
}
