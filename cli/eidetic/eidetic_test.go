package eidetic

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func TestSlugTagAndCleanTags(t *testing.T) {
	if got := SlugTag("Audience awareness"); got != "audience-awareness" {
		t.Fatalf("expected audience-awareness, got %q", got)
	}
	if got := SlugTag("  Voice DNA!!  "); got != "voice-dna" {
		t.Fatalf("expected voice-dna, got %q", got)
	}
	long := strings.Repeat("a", 60)
	if got := SlugTag(long); len(got) != MaxTagLen {
		t.Fatalf("expected max length %d, got %d", MaxTagLen, len(got))
	}
	cleaned := CleanTags([]string{"Voice DNA", "voice-dna", "", "  ", "Must-Fix"})
	if len(cleaned) != 2 || cleaned[0] != "voice-dna" || cleaned[1] != "must-fix" {
		t.Fatalf("unexpected cleaned tags: %#v", cleaned)
	}
}

func TestChunkRecords(t *testing.T) {
	recs := make([]RememberRecord, 53)
	chunks := ChunkRecords(recs, 20)
	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d", len(chunks))
	}
	if len(chunks[0]) != 20 || len(chunks[1]) != 20 || len(chunks[2]) != 13 {
		t.Fatalf("unexpected chunk sizes: %d, %d, %d", len(chunks[0]), len(chunks[1]), len(chunks[2]))
	}
}

func TestExtractRecordsFromMarginDB(t *testing.T) {
	conn, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	schema := `
	CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT, source TEXT);
	CREATE TABLE writing_rules (
		id TEXT PRIMARY KEY, writing_type TEXT, category TEXT, rule_text TEXT,
		when_to_apply TEXT, why TEXT, severity TEXT, example_before TEXT, example_after TEXT,
		signal_count INTEGER, polarity TEXT, updated_at INTEGER, archived_at INTEGER
	);
	CREATE TABLE highlights (
		id TEXT PRIMARY KEY, document_id TEXT, color TEXT, text_content TEXT,
		anchor_heading_path TEXT, updated_at INTEGER
	);
	CREATE TABLE margin_notes (id TEXT PRIMARY KEY, highlight_id TEXT, intent TEXT, content TEXT);
	CREATE TABLE corrections (
		id TEXT PRIMARY KEY, document_id TEXT, document_title TEXT, original_text TEXT,
		notes_json TEXT, writing_type TEXT, polarity TEXT, feedback_type TEXT,
		suggested_edit TEXT, rationale TEXT, updated_at INTEGER
	);
	INSERT INTO documents VALUES ('doc1', 'Test Essay', 'local');
	INSERT INTO writing_rules VALUES ('r1', 'cover-letter', 'Audience awareness', 'Lead with reader value.', 'Persuasive prose', 'Avoids self-promo', 'must-fix', 'Why me:', 'What you get:', 3, 'corrective', 100, NULL);
	INSERT INTO writing_rules VALUES ('r2', 'general', 'Old', 'Archived rule', '', '', 'nice-to-fix', '', '', 1, 'positive', 50, 999);
	INSERT INTO highlights VALUES ('h1', 'doc1', 'yellow', 'Problem selection matters more than speed.', 'Intro', 200);
	INSERT INTO margin_notes VALUES ('n1', 'h1', 'note', 'Core thesis for portfolio.');
	INSERT INTO corrections VALUES ('c1', 'doc1', 'Test Essay', 'This sentence was overly verbose and vague.', '["Cut filler"]', 'blog', 'corrective', 'wordiness', 'Cut the filler.', 'Tighter prose', 300);
	`
	if _, err := conn.Exec(schema); err != nil {
		t.Fatal(err)
	}

	recs, rCount, hCount, cCount, err := ExtractRecords(conn, 10, 10, 10)
	if err != nil {
		t.Fatal(err)
	}
	if rCount != 1 || hCount != 1 || cCount != 1 || len(recs) != 3 {
		t.Fatalf("expected 1/1/1 (3 total), got %d/%d/%d (%d)", rCount, hCount, cCount, len(recs))
	}
	if recs[0].Level != "procedural" || recs[0].Kind != "anti-pattern" || recs[0].Source != "manual://margin/writing-rule/r1" {
		t.Fatalf("unexpected rule record: %+v", recs[0])
	}
	if recs[1].Level != "semantic" || !strings.Contains(recs[1].Content, "Core thesis for portfolio.") {
		t.Fatalf("unexpected highlight record: %+v", recs[1])
	}
	if recs[2].Level != "episodic" || recs[2].Kind != "failure" {
		t.Fatalf("unexpected correction record: %+v", recs[2])
	}
}

func TestDowngradeForeignTrust(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "in.jsonl")
	dst := filepath.Join(dir, "out.jsonl")

	input := strings.Join([]string{
		`{"type":"header","exportId":"bk_1"}`,
		`{"type":"memory","trust_class":"human_explicit","content":"rule 1"}`,
		`{"type":"memory","data":{"trustClass":"human_explicit","content":"rule 2"}}`,
		`{"type":"memory","trust_class":"agent_assertion","content":"rule 3"}`,
	}, "\n") + "\n"
	if err := os.WriteFile(src, []byte(input), 0o644); err != nil {
		t.Fatal(err)
	}

	n, err := DowngradeForeignTrust(src, dst)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("expected 2 downgraded rows, got %d", n)
	}

	raw, err := os.ReadFile(dst)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(raw)), "\n")
	if len(lines) != 4 {
		t.Fatalf("expected 4 output lines, got %d", len(lines))
	}
	var m1, m2 map[string]any
	_ = json.Unmarshal([]byte(lines[1]), &m1)
	_ = json.Unmarshal([]byte(lines[2]), &m2)
	if m1["trust_class"] != "agent_validated" {
		t.Fatalf("expected agent_validated, got %v", m1["trust_class"])
	}
	if m2["data"].(map[string]any)["trustClass"] != "agent_validated" {
		t.Fatalf("expected nested agent_validated, got %v", m2["data"])
	}
}

func TestResolveEEBinaryMissingOverride(t *testing.T) {
	_, err := ResolveEEBinary("/nonexistent/path/to/ee")
	if err == nil {
		t.Fatal("expected error for nonexistent ee override")
	}
}
