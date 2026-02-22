import type { Document } from "@/types/document";
import type { Highlight, MarginNote } from "@/types/annotations";

export interface Tab {
  id: string;
  documentId: string | null;
  title: string;
  isDirty: boolean;
  order: number;
}

export interface TabCache {
  document: Document | null;
  content: string;
  filePath: string | null;
  highlights: Highlight[];
  marginNotes: MarginNote[];
  annotationsLoaded: boolean;
  scrollPosition: number;
}

export interface PersistedTab {
  id: string;
  document_id: string;
  tab_order: number;
  is_active: boolean;
  created_at: number;
}
