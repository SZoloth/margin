package db

import (
	"database/sql"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

var AllowedColors = []string{"yellow", "green", "blue", "pink", "purple", "orange"}

func isValidColor(color string) bool {
	for _, c := range AllowedColors {
		if c == color {
			return true
		}
	}
	return false
}

type TextLocation struct {
	FromPos       int    `json:"from_pos"`
	ToPos         int    `json:"to_pos"`
	TextContent   string `json:"text_content"`
	PrefixContext string `json:"prefix_context"`
	SuffixContext string `json:"suffix_context"`
}

// FindTextInDocument locates text within a document's file content.
func FindTextInDocument(d *sql.DB, documentID string, textToHighlight string) (*TextLocation, error) {
	content, err := ReadDocument(d, documentID)
	if err != nil {
		return nil, err
	}

	byteIdx := strings.Index(content, textToHighlight)
	if byteIdx == -1 {
		truncated := textToHighlight
		runes := []rune(truncated)
		if len(runes) > 80 {
			truncated = string(runes[:80])
		}
		return nil, fmt.Errorf("Text not found in document: %q", truncated)
	}

	// Convert byte offsets to rune (character) offsets to match JS indexOf behavior.
	// TipTap positions are character-based, not byte-based.
	fromRune := utf8.RuneCountInString(content[:byteIdx])
	toRune := fromRune + utf8.RuneCountInString(textToHighlight)

	// Context windows: 50 characters before/after, using rune boundaries
	runes := []rune(content)
	prefixStart := fromRune - 50
	if prefixStart < 0 {
		prefixStart = 0
	}
	suffixEnd := toRune + 50
	if suffixEnd > len(runes) {
		suffixEnd = len(runes)
	}

	return &TextLocation{
		FromPos:       fromRune,
		ToPos:         toRune,
		TextContent:   textToHighlight,
		PrefixContext: string(runes[prefixStart:fromRune]),
		SuffixContext: string(runes[toRune:suffixEnd]),
	}, nil
}

// CreateHighlight creates a positional highlight.
func CreateHighlight(d *sql.DB, documentID, color, textContent string, fromPos, toPos int, prefixCtx, suffixCtx *string) (*HighlightRecord, error) {
	if !isValidColor(color) {
		return nil, fmt.Errorf("Invalid color %q. Allowed: %s", color, strings.Join(AllowedColors, ", "))
	}
	if fromPos < 0 || fromPos >= toPos {
		return nil, fmt.Errorf("Invalid position range: from_pos (%d) must be a non-negative integer less than to_pos (%d).", fromPos, toPos)
	}

	// Verify document exists
	var docID string
	err := d.QueryRow("SELECT id FROM documents WHERE id = ?", documentID).Scan(&docID)
	if err != nil {
		return nil, fmt.Errorf("Document not found: %s", documentID)
	}

	id := uuid.New().String()
	now := NowMillis()

	_, err = d.Exec(
		`INSERT INTO highlights
		   (id, document_id, color, text_content, from_pos, to_pos,
		    prefix_context, suffix_context, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, documentID, color, textContent, fromPos, toPos, prefixCtx, suffixCtx, now, now)
	if err != nil {
		return nil, err
	}

	TouchDocument(d, documentID)

	return &HighlightRecord{
		ID: id, DocumentID: documentID, Color: color, TextContent: textContent,
		FromPos: fromPos, ToPos: toPos, PrefixContext: prefixCtx, SuffixContext: suffixCtx,
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

type HighlightByTextResult struct {
	Highlight HighlightRecord   `json:"highlight"`
	Note      *MarginNoteRecord `json:"note,omitempty"`
}

// HighlightByText finds text in a document and creates a highlight (and optional note).
func HighlightByText(d *sql.DB, documentID, text, color string, noteContent *string) (*HighlightByTextResult, error) {
	loc, err := FindTextInDocument(d, documentID, text)
	if err != nil {
		return nil, err
	}

	h, err := CreateHighlight(d, documentID, color, loc.TextContent, loc.FromPos, loc.ToPos, &loc.PrefixContext, &loc.SuffixContext)
	if err != nil {
		return nil, err
	}

	result := &HighlightByTextResult{Highlight: *h}

	if noteContent != nil {
		note, err := CreateMarginNote(d, h.ID, *noteContent)
		if err != nil {
			return nil, err
		}
		result.Note = note
	}

	return result, nil
}

// DeleteHighlight deletes a highlight and cascading margin notes.
func DeleteHighlight(d *sql.DB, highlightID string) error {
	var docID string
	err := d.QueryRow("SELECT document_id FROM highlights WHERE id = ?", highlightID).Scan(&docID)
	if err != nil {
		return fmt.Errorf("Highlight not found: %s", highlightID)
	}

	d.Exec("DELETE FROM highlights WHERE id = ?", highlightID)
	TouchDocument(d, docID)
	return nil
}

// UpdateHighlightColor changes a highlight's color.
func UpdateHighlightColor(d *sql.DB, highlightID, color string) error {
	if !isValidColor(color) {
		return fmt.Errorf("Invalid color %q. Allowed: %s", color, strings.Join(AllowedColors, ", "))
	}

	var docID string
	err := d.QueryRow("SELECT document_id FROM highlights WHERE id = ?", highlightID).Scan(&docID)
	if err != nil {
		return fmt.Errorf("Highlight not found: %s", highlightID)
	}

	d.Exec("UPDATE highlights SET color = ?, updated_at = ? WHERE id = ?", color, NowMillis(), highlightID)
	TouchDocument(d, docID)
	return nil
}
