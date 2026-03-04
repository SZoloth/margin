package db

import (
	"database/sql"
	"fmt"
	"os"
	"regexp"
	"strings"
	"unicode"
)

type DocumentRecord struct {
	ID           string  `json:"id"`
	Source       string  `json:"source"`
	FilePath     *string `json:"file_path"`
	KeepLocalID  *string `json:"keep_local_id"`
	Title        *string `json:"title"`
	Author       *string `json:"author"`
	URL          *string `json:"url"`
	WordCount    int     `json:"word_count"`
	LastOpenedAt int64   `json:"last_opened_at"`
	CreatedAt    int64   `json:"created_at"`
}

type SearchResult struct {
	DocumentID string  `json:"documentId"`
	Title      string  `json:"title"`
	Snippet    string  `json:"snippet"`
	Rank       float64 `json:"rank"`
}

func ListDocuments(db *sql.DB, limit int) ([]DocumentRecord, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 100 {
		limit = 100
	}

	rows, err := db.Query(
		`SELECT id, source, file_path, keep_local_id, title, author, url,
		        word_count, last_opened_at, created_at
		 FROM documents
		 ORDER BY last_opened_at DESC
		 LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []DocumentRecord
	for rows.Next() {
		var d DocumentRecord
		if err := rows.Scan(&d.ID, &d.Source, &d.FilePath, &d.KeepLocalID,
			&d.Title, &d.Author, &d.URL, &d.WordCount, &d.LastOpenedAt, &d.CreatedAt); err != nil {
			return nil, err
		}
		docs = append(docs, d)
	}
	if docs == nil {
		docs = []DocumentRecord{}
	}
	return docs, nil
}

func GetDocument(db *sql.DB, documentID string) (*DocumentRecord, error) {
	var d DocumentRecord
	err := db.QueryRow(
		`SELECT id, source, file_path, keep_local_id, title, author, url,
		        word_count, last_opened_at, created_at
		 FROM documents WHERE id = ?`, documentID).Scan(
		&d.ID, &d.Source, &d.FilePath, &d.KeepLocalID,
		&d.Title, &d.Author, &d.URL, &d.WordCount, &d.LastOpenedAt, &d.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("Document not found: %s", documentID)
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func ReadDocument(db *sql.DB, documentID string) (string, error) {
	doc, err := GetDocument(db, documentID)
	if err != nil {
		return "", err
	}
	if doc.FilePath == nil {
		title := documentID
		if doc.Title != nil {
			title = *doc.Title
		}
		return "", fmt.Errorf("Document %q is a keep-local article without a file path. Content is only available in the Margin app.", title)
	}
	stat, err := os.Stat(*doc.FilePath)
	if err != nil {
		return "", fmt.Errorf("Failed to read file at %s: %s", *doc.FilePath, err)
	}
	if stat.Size() > 5*1024*1024 {
		return "", fmt.Errorf("File too large (%.1fMB). Maximum supported size is 5MB.", float64(stat.Size())/1024/1024)
	}
	data, err := os.ReadFile(*doc.FilePath)
	if err != nil {
		return "", fmt.Errorf("Failed to read file at %s: %s", *doc.FilePath, err)
	}
	return string(data), nil
}

var (
	ftsSpecialChars = regexp.MustCompile(`[(){}:^]`)
	ftsNonWordChars = regexp.MustCompile(`[^\p{L}\p{N}\-_]`)
)

// SanitizeFTSQuery ports sanitize_fts_query from search.rs.
func SanitizeFTSQuery(query string) string {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return ""
	}

	// Remove quotes and FTS5 special chars
	cleaned := strings.ReplaceAll(trimmed, `"`, "")
	cleaned = strings.ReplaceAll(cleaned, `'`, "")
	cleaned = ftsSpecialChars.ReplaceAllString(cleaned, "")

	words := strings.Fields(cleaned)
	var terms []string
	for _, word := range words {
		upper := strings.ToUpper(word)
		if upper == "AND" || upper == "OR" || upper == "NOT" || upper == "NEAR" {
			continue
		}
		hasAlphaNum := false
		for _, r := range word {
			if unicode.IsLetter(r) || unicode.IsDigit(r) {
				hasAlphaNum = true
				break
			}
		}
		if !hasAlphaNum {
			continue
		}
		safe := ftsNonWordChars.ReplaceAllString(word, "")
		if safe != "" {
			terms = append(terms, `"`+safe+`"*`)
		}
	}
	return strings.Join(terms, " ")
}

func SearchDocuments(db *sql.DB, query string, limit int) ([]SearchResult, error) {
	if limit < 1 {
		limit = 1
	}
	if limit > 50 {
		limit = 50
	}
	ftsQuery := SanitizeFTSQuery(query)
	if ftsQuery == "" {
		return []SearchResult{}, nil
	}

	// Check if FTS table exists
	var name sql.NullString
	db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'").Scan(&name)
	if !name.Valid {
		return nil, fmt.Errorf("Full-text search index not yet created. Open Margin and perform a search to build the index.")
	}

	rows, err := db.Query(
		`SELECT f.document_id, f.title,
		        snippet(documents_fts, 1, '<mark>', '</mark>', '…', 32) as snippet,
		        bm25(documents_fts, 10.0, 1.0) as rank
		 FROM documents_fts f
		 LEFT JOIN documents d ON d.id = f.document_id
		 WHERE documents_fts MATCH ?
		 ORDER BY bm25(documents_fts, 10.0, 1.0)
		          - (COALESCE(d.access_count, 0) * 1.0 /
		             (1.0 + MAX(0, julianday('now') - julianday(datetime(COALESCE(d.last_opened_at, 0) / 1000, 'unixepoch'))) * 0.1))
		          * 0.3
		 LIMIT ?`, ftsQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("Search failed: %s", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.DocumentID, &r.Title, &r.Snippet, &r.Rank); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	if results == nil {
		results = []SearchResult{}
	}
	return results, nil
}
