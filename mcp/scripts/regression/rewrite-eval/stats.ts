/** Small seeded statistics helpers. No dependencies. */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Interval {
  mean: number;
  lo: number;
  hi: number;
  n: number;
}

/** Percentile bootstrap of the mean of per-draft paired differences. */
export function pairedBootstrap(diffs: number[], iters = 10_000, seed = 1): Interval {
  const n = diffs.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, n: 0 };
  const rnd = mulberry32(seed);
  const means: number[] = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += diffs[Math.floor(rnd() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  return { mean, lo: means[Math.floor(0.025 * iters)], hi: means[Math.ceil(0.975 * iters) - 1], n };
}

function logFactorials(n: number): number[] {
  const f = [0];
  for (let i = 1; i <= n; i++) f.push(f[i - 1] + Math.log(i));
  return f;
}

/** P(X >= k) for X ~ Binomial(n, p). */
export function binomTailGE(k: number, n: number, p: number): number {
  if (k <= 0) return 1;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const lf = logFactorials(n);
  let s = 0;
  for (let i = k; i <= n; i++) {
    s += Math.exp(lf[n] - lf[i] - lf[n - i] + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, s);
}

/** Exact two-sided p-value against p = 0.5. */
export function binomTwoSidedP(k: number, n: number): number {
  if (n === 0) return 1;
  const extreme = Math.max(k, n - k);
  return Math.min(1, 2 * binomTailGE(extreme, n, 0.5));
}

/** One-sided 95% Clopper-Pearson lower bound for a success proportion. */
export function binomLowerBound95(k: number, n: number): number {
  if (n === 0 || k === 0) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // smallest p with P(X >= k | p) >= 0.05
    if (binomTailGE(k, n, mid) < 0.05) lo = mid;
    else hi = mid;
  }
  return hi;
}
