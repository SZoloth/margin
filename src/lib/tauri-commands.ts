import { invoke } from "@tauri-apps/api/core";
import type { Document, FileEntry } from "@/types/document";

export async function openFileDialog(): Promise<string | null> {
  return invoke<string | null>("open_file_dialog");
}

export async function readFile(path: string): Promise<string> {
  return invoke<string>("read_file", { path });
}

export async function saveFile(path: string, content: string): Promise<void> {
  return invoke<void>("save_file", { path, content });
}

export async function listMarkdownFiles(dir: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_markdown_files", { dir });
}

export async function getRecentDocuments(limit?: number): Promise<Document[]> {
  return invoke<Document[]>("get_recent_documents", { limit });
}

export async function upsertDocument(doc: Document): Promise<Document> {
  return invoke<Document>("upsert_document", { doc });
}
