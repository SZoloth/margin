package db

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// OpenRead opens the database in read-only mode.
func OpenRead(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("cannot open Margin database (%s). Make sure the Margin app has been opened at least once", path)
	}
	db.Exec("PRAGMA busy_timeout = 5000")
	return db, nil
}

// OpenWrite opens the database in read-write mode.
func OpenWrite(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("cannot open Margin database (%s). Make sure the Margin app has been opened at least once", path)
	}
	db.Exec("PRAGMA journal_mode = WAL")
	db.Exec("PRAGMA foreign_keys = ON")
	db.Exec("PRAGMA busy_timeout = 5000")
	db.Exec("PRAGMA synchronous = NORMAL")
	return db, nil
}

// NowMillis returns current time in milliseconds.
func NowMillis() int64 {
	return time.Now().UnixMilli()
}

// TouchDocument updates last_opened_at for a document.
func TouchDocument(db *sql.DB, documentID string) {
	db.Exec("UPDATE documents SET last_opened_at = ? WHERE id = ?", NowMillis(), documentID)
}
