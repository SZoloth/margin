export interface RewriteRecord {
  text: string;
  ms: number;
  error?: string;
}

/** draft id to the arm's rewrite of it */
export type RewriteFile = Record<string, RewriteRecord>;
