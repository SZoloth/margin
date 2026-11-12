export interface Document {
  id: string;
  source: "file" | "keep-local";
  file_path: string | null;
  keep_local_id: string | null;
  title: string | null;
  author: string | null;
  url: string | null;
  word_count: number;
  last_opened_at: number;
  created_at: number;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}
