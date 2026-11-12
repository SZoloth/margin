package db

import (
	"database/sql"
	"fmt"

	"github.com/google/uuid"
)

// CreateMarginNote creates a margin note attached to a highlight.
func CreateMarginNote(d *sql.DB, highlightID, content string) (*MarginNoteRecord, error) {
	var hID, docID string
	err := d.QueryRow("SELECT id, document_id FROM highlights WHERE id = ?", highlightID).Scan(&hID, &docID)
	if err != nil {
		return nil, fmt.Errorf("Highlight not found: %s", highlightID)
	}

	id := uuid.New().String()
	now := NowMillis()

	_, err = d.Exec(
		`INSERT INTO margin_notes (id, highlight_id, content, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?)`, id, highlightID, content, now, now)
	if err != nil {
		return nil, err
	}

	TouchDocument(d, docID)

	return &MarginNoteRecord{
		ID: id, HighlightID: highlightID, Content: content,
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

// UpdateMarginNote updates a margin note's content.
func UpdateMarginNote(d *sql.DB, noteID, content string) (*MarginNoteRecord, error) {
	var id, highlightID string
	var createdAt int64
	var docID string
	err := d.QueryRow(
		`SELECT mn.id, mn.highlight_id, mn.created_at, h.document_id
		 FROM margin_notes mn
		 JOIN highlights h ON mn.highlight_id = h.id
		 WHERE mn.id = ?`, noteID).Scan(&id, &highlightID, &createdAt, &docID)
	if err != nil {
		return nil, fmt.Errorf("Margin note not found: %s", noteID)
	}

	now := NowMillis()
	d.Exec("UPDATE margin_notes SET content = ?, updated_at = ? WHERE id = ?", content, now, noteID)
	TouchDocument(d, docID)

	return &MarginNoteRecord{
		ID: id, HighlightID: highlightID, Content: content,
		CreatedAt: createdAt, UpdatedAt: now,
	}, nil
}

// DeleteMarginNote deletes a margin note.
func DeleteMarginNote(d *sql.DB, noteID string) error {
	var id, docID string
	err := d.QueryRow(
		`SELECT mn.id, h.document_id
		 FROM margin_notes mn
		 JOIN highlights h ON mn.highlight_id = h.id
		 WHERE mn.id = ?`, noteID).Scan(&id, &docID)
	if err != nil {
		return fmt.Errorf("Margin note not found: %s", noteID)
	}

	d.Exec("DELETE FROM margin_notes WHERE id = ?", noteID)
	TouchDocument(d, docID)
	return nil
}
