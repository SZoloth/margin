export interface KeepLocalItem {
  id: string;
  url: string;
  title: string | null;
  author: string | null;
  domain: string | null;
  platform: string | null;
  wordCount: number;
  tags: string[];
  createdAt: number;
  status: string;
  contentAvailable: boolean;
}

export interface KeepLocalHealth {
  ok: boolean;
  now: number;
}

export interface KeepLocalListResult {
  items: KeepLocalItem[];
  count: number;
}
