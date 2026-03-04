package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

type CorrectionRecord struct {
	OriginalText    string   `json:"originalText"`
	Notes           []string `json:"notes"`
	HighlightColor  string   `json:"highlightColor"`
	DocumentTitle   *string  `json:"documentTitle"`
	DocumentID      string   `json:"documentId"`
	CreatedAt       int64    `json:"createdAt"`
	WritingType     *string  `json:"writingType"`
	Polarity        *string  `json:"polarity"`
	PrefixContext   *string  `json:"prefixContext"`
	SuffixContext   *string  `json:"suffixContext"`
	ExtendedContext *string  `json:"extendedContext"`
}

type CorrectionsSummary struct {
	Total         int                `json:"total"`
	ByWritingType []WritingTypeCount `json:"byWritingType"`
	ByDocument    []DocumentCount    `json:"byDocument"`
}

type WritingTypeCount struct {
	WritingType *string `json:"writingType"`
	Count       int     `json:"count"`
}

type DocumentCount struct {
	DocumentID    string  `json:"documentId"`
	DocumentTitle *string `json:"documentTitle"`
	Count         int     `json:"count"`
}

type CreateCorrectionResult struct {
	CorrectionID string `json:"correction_id"`
	HighlightID  string `json:"highlight_id"`
	SessionID    string `json:"session_id"`
}

type VoiceSignalRecord struct {
	HighlightID     string   `json:"highlightId"`
	OriginalText    string   `json:"originalText"`
	Notes           []string `json:"notes"`
	ExtendedContext *string  `json:"extendedContext"`
	HighlightColor  string   `json:"highlightColor"`
	WritingType     *string  `json:"writingType"`
	Polarity        string   `json:"polarity"`
	DocumentTitle   *string  `json:"documentTitle"`
	CreatedAt       int64    `json:"createdAt"`
}

var ValidPolarities = []string{"positive", "corrective"}

func parseNotesJSON(raw string) []string {
	var parsed []any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return []string{}
	}
	var result []string
	for _, v := range parsed {
		if s, ok := v.(string); ok {
			result = append(result, s)
		}
	}
	if result == nil {
		result = []string{}
	}
	return result
}

func GetCorrections(d *sql.DB, documentID *string, limit int) ([]CorrectionRecord, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 2000 {
		limit = 2000
	}

	var rows *sql.Rows
	var err error

	if documentID != nil {
		rows, err = d.Query(
			`SELECT original_text, notes_json, highlight_color,
			        document_title, document_id, created_at,
			        writing_type, polarity, prefix_context,
			        suffix_context, extended_context
			 FROM corrections
			 WHERE document_id = ? AND session_id != '__backfilled__'
			 ORDER BY created_at DESC
			 LIMIT ?`, *documentID, limit)
	} else {
		rows, err = d.Query(
			`SELECT original_text, notes_json, highlight_color,
			        document_title, document_id, created_at,
			        writing_type, polarity, prefix_context,
			        suffix_context, extended_context
			 FROM corrections
			 WHERE session_id != '__backfilled__'
			 ORDER BY created_at DESC
			 LIMIT ?`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []CorrectionRecord
	for rows.Next() {
		var r CorrectionRecord
		var notesJSON string
		if err := rows.Scan(&r.OriginalText, &notesJSON, &r.HighlightColor,
			&r.DocumentTitle, &r.DocumentID, &r.CreatedAt,
			&r.WritingType, &r.Polarity, &r.PrefixContext,
			&r.SuffixContext, &r.ExtendedContext); err != nil {
			return nil, err
		}
		r.Notes = parseNotesJSON(notesJSON)
		records = append(records, r)
	}
	if records == nil {
		records = []CorrectionRecord{}
	}
	return records, nil
}

func GetAllCorrectionsForProfile(d *sql.DB) ([]CorrectionRecord, error) {
	rows, err := d.Query(
		`SELECT original_text, notes_json, highlight_color,
		        document_title, document_id, created_at,
		        writing_type, polarity, prefix_context,
		        suffix_context, extended_context
		 FROM corrections
		 WHERE session_id != '__backfilled__'
		 ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []CorrectionRecord
	for rows.Next() {
		var r CorrectionRecord
		var notesJSON string
		if err := rows.Scan(&r.OriginalText, &notesJSON, &r.HighlightColor,
			&r.DocumentTitle, &r.DocumentID, &r.CreatedAt,
			&r.WritingType, &r.Polarity, &r.PrefixContext,
			&r.SuffixContext, &r.ExtendedContext); err != nil {
			return nil, err
		}
		r.Notes = parseNotesJSON(notesJSON)
		records = append(records, r)
	}
	if records == nil {
		records = []CorrectionRecord{}
	}
	return records, nil
}

func GetCorrectionsSummary(d *sql.DB) (*CorrectionsSummary, error) {
	var total int
	d.QueryRow("SELECT COUNT(*) FROM corrections WHERE session_id != '__backfilled__'").Scan(&total)

	byTypeRows, err := d.Query(
		`SELECT writing_type, COUNT(*) as count
		 FROM corrections
		 WHERE session_id != '__backfilled__'
		 GROUP BY writing_type
		 ORDER BY count DESC`)
	if err != nil {
		return nil, err
	}
	defer byTypeRows.Close()

	var byType []WritingTypeCount
	for byTypeRows.Next() {
		var wt WritingTypeCount
		byTypeRows.Scan(&wt.WritingType, &wt.Count)
		byType = append(byType, wt)
	}
	if byType == nil {
		byType = []WritingTypeCount{}
	}

	byDocRows, err := d.Query(
		`SELECT document_id, document_title, COUNT(*) as count
		 FROM corrections
		 WHERE session_id != '__backfilled__'
		 GROUP BY document_id
		 ORDER BY count DESC`)
	if err != nil {
		return nil, err
	}
	defer byDocRows.Close()

	var byDoc []DocumentCount
	for byDocRows.Next() {
		var dc DocumentCount
		byDocRows.Scan(&dc.DocumentID, &dc.DocumentTitle, &dc.Count)
		byDoc = append(byDoc, dc)
	}
	if byDoc == nil {
		byDoc = []DocumentCount{}
	}

	return &CorrectionsSummary{Total: total, ByWritingType: byType, ByDocument: byDoc}, nil
}

func CreateCorrection(d *sql.DB, documentID string, originalText string, notes []string, writingType *string, color string) (*CreateCorrectionResult, error) {
	if color == "" {
		color = "yellow"
	}

	loc, err := FindTextInDocument(d, documentID, originalText)
	if err != nil {
		return nil, err
	}

	h, err := CreateHighlight(d, documentID, color, loc.TextContent, loc.FromPos, loc.ToPos, &loc.PrefixContext, &loc.SuffixContext)
	if err != nil {
		return nil, err
	}

	doc, _ := GetDocument(d, documentID)
	correctionID := uuid.New().String()
	sessionID := uuid.New().String()
	now := NowMillis()

	notesJSON, _ := json.Marshal(notes)

	var docTitle *string
	var docSource string = "file"
	var docPath *string
	if doc != nil {
		docTitle = doc.Title
		docSource = doc.Source
		docPath = doc.FilePath
	}

	_, err = d.Exec(
		`INSERT INTO corrections
		   (id, highlight_id, document_id, session_id, original_text,
		    prefix_context, suffix_context, notes_json,
		    document_title, document_source, document_path,
		    highlight_color, created_at, updated_at, writing_type)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		correctionID, h.ID, documentID, sessionID, originalText,
		loc.PrefixContext, loc.SuffixContext, string(notesJSON),
		docTitle, docSource, docPath,
		color, now, now, writingType)
	if err != nil {
		return nil, err
	}

	return &CreateCorrectionResult{
		CorrectionID: correctionID,
		HighlightID:  h.ID,
		SessionID:    sessionID,
	}, nil
}

func DeleteCorrection(d *sql.DB, highlightID string) error {
	var id string
	err := d.QueryRow("SELECT id FROM corrections WHERE highlight_id = ?", highlightID).Scan(&id)
	if err != nil {
		return fmt.Errorf("Correction not found for highlight: %s", highlightID)
	}

	d.Exec("DELETE FROM corrections WHERE highlight_id = ?", highlightID)
	d.Exec("DELETE FROM highlights WHERE id = ?", highlightID)
	return nil
}

func UpdateCorrectionWritingType(d *sql.DB, highlightID, writingType string) error {
	result, err := d.Exec("UPDATE corrections SET writing_type = ?, updated_at = ? WHERE highlight_id = ?",
		writingType, NowMillis(), highlightID)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("Correction not found for highlight: %s", highlightID)
	}
	return nil
}

func SetCorrectionPolarity(d *sql.DB, highlightID, polarity string) error {
	valid := false
	for _, p := range ValidPolarities {
		if p == polarity {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("Invalid polarity %q. Allowed: %s", polarity, strings.Join(ValidPolarities, ", "))
	}

	result, err := d.Exec("UPDATE corrections SET polarity = ?, updated_at = ? WHERE highlight_id = ?",
		polarity, NowMillis(), highlightID)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("Correction not found for highlight: %s", highlightID)
	}
	return nil
}

func GetVoiceSignals(d *sql.DB, polarity *string, limit int) ([]VoiceSignalRecord, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 2000 {
		limit = 2000
	}

	var rows *sql.Rows
	var err error

	if polarity != nil {
		rows, err = d.Query(
			`SELECT highlight_id, original_text, notes_json,
			        extended_context, highlight_color,
			        writing_type, polarity, document_title,
			        created_at
			 FROM corrections
			 WHERE session_id != '__backfilled__' AND polarity = ?
			 ORDER BY created_at DESC
			 LIMIT ?`, *polarity, limit)
	} else {
		rows, err = d.Query(
			`SELECT highlight_id, original_text, notes_json,
			        extended_context, highlight_color,
			        writing_type, polarity, document_title,
			        created_at
			 FROM corrections
			 WHERE session_id != '__backfilled__' AND polarity IS NOT NULL
			 ORDER BY created_at DESC
			 LIMIT ?`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []VoiceSignalRecord
	for rows.Next() {
		var r VoiceSignalRecord
		var notesJSON string
		if err := rows.Scan(&r.HighlightID, &r.OriginalText, &notesJSON,
			&r.ExtendedContext, &r.HighlightColor,
			&r.WritingType, &r.Polarity, &r.DocumentTitle,
			&r.CreatedAt); err != nil {
			return nil, err
		}
		r.Notes = parseNotesJSON(notesJSON)
		records = append(records, r)
	}
	if records == nil {
		records = []VoiceSignalRecord{}
	}
	return records, nil
}
