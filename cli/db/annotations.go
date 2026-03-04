package db

import "database/sql"

type HighlightRecord struct {
	ID            string  `json:"id"`
	DocumentID    string  `json:"document_id"`
	Color         string  `json:"color"`
	TextContent   string  `json:"text_content"`
	FromPos       int     `json:"from_pos"`
	ToPos         int     `json:"to_pos"`
	PrefixContext *string `json:"prefix_context"`
	SuffixContext *string `json:"suffix_context"`
	CreatedAt     int64   `json:"created_at"`
	UpdatedAt     int64   `json:"updated_at"`
}

type MarginNoteRecord struct {
	ID          string `json:"id"`
	HighlightID string `json:"highlight_id"`
	Content     string `json:"content"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

type AnnotationEntry struct {
	Highlight HighlightRecord    `json:"highlight"`
	Notes     []MarginNoteRecord `json:"notes"`
}

func GetAnnotations(db *sql.DB, documentID string) ([]AnnotationEntry, error) {
	highlights, err := db.Query(
		`SELECT id, document_id, color, text_content, from_pos, to_pos,
		        prefix_context, suffix_context, created_at, updated_at
		 FROM highlights
		 WHERE document_id = ?
		 ORDER BY from_pos`, documentID)
	if err != nil {
		return nil, err
	}
	defer highlights.Close()

	var hList []HighlightRecord
	for highlights.Next() {
		var h HighlightRecord
		if err := highlights.Scan(&h.ID, &h.DocumentID, &h.Color, &h.TextContent,
			&h.FromPos, &h.ToPos, &h.PrefixContext, &h.SuffixContext,
			&h.CreatedAt, &h.UpdatedAt); err != nil {
			return nil, err
		}
		hList = append(hList, h)
	}
	if len(hList) == 0 {
		return []AnnotationEntry{}, nil
	}

	notes, err := db.Query(
		`SELECT mn.id, mn.highlight_id, mn.content, mn.created_at, mn.updated_at
		 FROM margin_notes mn
		 JOIN highlights h ON mn.highlight_id = h.id
		 WHERE h.document_id = ?
		 ORDER BY h.from_pos, mn.created_at`, documentID)
	if err != nil {
		return nil, err
	}
	defer notes.Close()

	notesByHighlight := make(map[string][]MarginNoteRecord)
	for notes.Next() {
		var n MarginNoteRecord
		if err := notes.Scan(&n.ID, &n.HighlightID, &n.Content, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		notesByHighlight[n.HighlightID] = append(notesByHighlight[n.HighlightID], n)
	}

	entries := make([]AnnotationEntry, len(hList))
	for i, h := range hList {
		n := notesByHighlight[h.ID]
		if n == nil {
			n = []MarginNoteRecord{}
		}
		entries[i] = AnnotationEntry{Highlight: h, Notes: n}
	}
	return entries, nil
}
