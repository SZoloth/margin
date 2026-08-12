export interface MarginRule {
  id: string;
  writingType: string;
  category: string;
  ruleText: string;
  severity: string;
  detectionPattern?: string | null;
  exampleBefore?: string | null;
  exampleAfter?: string | null;
  notes?: string | null;
  source: string;
  reviewedAt?: number | null;
}

export interface FixtureCase {
  name: string;
  writingType: string;
  path: string;
  input: string;
  expectedRuleIds: string[];
}

export interface AdapterFixture {
  schemaVersion: number;
  rules: MarginRule[];
  cases: FixtureCase[];
}

export interface Detection {
  ruleId: string;
  start: number;
  end: number;
  match: string;
}

export interface ValeAlert {
  path: string;
  ruleId: string;
  severity: string;
  message: string;
  match: string;
  line: number;
  span: [number, number];
}

export interface Score {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}
