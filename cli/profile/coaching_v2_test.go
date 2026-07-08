package profile

import (
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// Coaching prompt v2: selection filtering + DB-sourced prohibitions.

// setupCoachingFileDB creates a file-backed DB with the full schema the v2
// selection queries touch (writing_type, polarity, notes, when_to_apply, why).
func setupCoachingFileDB(t *testing.T) (string, *sql.DB) {
	t.Helper()
	path := t.TempDir() + "/coaching.db"
	d, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	stmts := []string{
		`CREATE TABLE corrections (
			id TEXT PRIMARY KEY, highlight_id TEXT, document_id TEXT,
			session_id TEXT, original_text TEXT, prefix_context TEXT,
			suffix_context TEXT, notes_json TEXT, document_title TEXT,
			document_source TEXT, document_path TEXT, highlight_color TEXT,
			created_at INTEGER, updated_at INTEGER, writing_type TEXT,
			polarity TEXT, extended_context TEXT, category TEXT,
			suggested_edit TEXT, synthesized_at INTEGER
		)`,
		`CREATE TABLE writing_rules (
			id TEXT PRIMARY KEY, writing_type TEXT, category TEXT,
			rule_text TEXT, when_to_apply TEXT, why TEXT, severity TEXT,
			example_before TEXT, example_after TEXT, source TEXT,
			signal_count INTEGER DEFAULT 1, notes TEXT,
			created_at INTEGER, updated_at INTEGER, reviewed_at INTEGER, detection_pattern TEXT
		)`,
	}
	for _, s := range stmts {
		if _, err := d.Exec(s); err != nil {
			t.Fatalf("setup SQL failed: %v", err)
		}
	}
	return path, d
}

func insertCorrectionV2(t *testing.T, d *sql.DB, id, text, notes string, writingType, polarity *string) {
	t.Helper()
	_, err := d.Exec(
		`INSERT INTO corrections (id, highlight_id, document_id, session_id,
			original_text, notes_json, highlight_color, created_at, updated_at,
			writing_type, polarity)
		 VALUES (?, ?, 'doc1', 'sess1', ?, ?, 'pink', 1000, 1000, ?, ?)`,
		id, id, text, notes, writingType, polarity)
	if err != nil {
		t.Fatal(err)
	}
}

func strp(s string) *string { return &s }

func TestCoachingPromptExcludesNonFeedbackNotes(t *testing.T) {
	path, d := setupCoachingFileDB(t)
	insertCorrectionV2(t, d, "c1", "flagged text", `["NOT FEEDBACK, A REQUEST/PROMPT: do research on X"]`, nil, nil)
	insertCorrectionV2(t, d, "c2", "real feedback text", `["cut the filler"]`, nil, nil)
	d.Close()

	result, err := GenerateCoachingPrompt(path, "blog", "")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(result, "do research on X") {
		t.Error("non-feedback note leaked into coaching prompt")
	}
	if !strings.Contains(result, "cut the filler") {
		t.Error("real feedback missing from coaching prompt")
	}
}

func TestCoachingPromptExcludesPositivePolarity(t *testing.T) {
	path, d := setupCoachingFileDB(t)
	insertCorrectionV2(t, d, "c1", "great sentence", `["love this rhythm"]`, nil, strp("positive"))
	insertCorrectionV2(t, d, "c2", "weak sentence", `["too hedgy"]`, nil, strp("corrective"))
	d.Close()

	result, err := GenerateCoachingPrompt(path, "blog", "")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(result, "love this rhythm") {
		t.Error("positive-polarity correction rendered as something to avoid")
	}
	if !strings.Contains(result, "too hedgy") {
		t.Error("corrective correction missing")
	}
}

func TestCoachingPromptScopesCorrectionsByType(t *testing.T) {
	path, d := setupCoachingFileDB(t)
	insertCorrectionV2(t, d, "c1", "resume bullet", `["quantify the outcome"]`, strp("resume"), nil)
	insertCorrectionV2(t, d, "c2", "blog para", `["open with the point"]`, strp("blog"), nil)
	insertCorrectionV2(t, d, "c3", "untyped text", `["tighten this"]`, nil, nil)
	d.Close()

	result, err := GenerateCoachingPrompt(path, "blog", "")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(result, "quantify the outcome") {
		t.Error("resume-scoped correction leaked into blog prompt")
	}
	if !strings.Contains(result, "open with the point") {
		t.Error("blog-scoped correction missing")
	}
	if !strings.Contains(result, "tighten this") {
		t.Error("untyped correction should be included for any type")
	}
}

func TestCoachingPromptScopesRulesByType(t *testing.T) {
	path, d := setupCoachingFileDB(t)
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := d.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	mustExec(`INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, signal_count, created_at, updated_at)
		VALUES ('r1', 'resume', 'structure', 'Resume-only rule text', 'must-fix', 'manual', 5, 1000, 1000)`)
	mustExec(`INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, signal_count, created_at, updated_at)
		VALUES ('r2', 'blog', 'structure', 'Blog-only rule text', 'must-fix', 'manual', 5, 1000, 1000)`)
	mustExec(`INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, signal_count, created_at, updated_at)
		VALUES ('r3', 'general', 'structure', 'General rule text', 'must-fix', 'manual', 5, 1000, 1000)`)
	d.Close()

	result, err := GenerateCoachingPrompt(path, "blog", "")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(result, "Resume-only rule text") {
		t.Error("resume-scoped rule leaked into blog prompt")
	}
	if !strings.Contains(result, "Blog-only rule text") {
		t.Error("blog-scoped rule missing")
	}
	if !strings.Contains(result, "General rule text") {
		t.Error("general rule missing")
	}
}

func TestCoachingPromptProhibitionsFromDB(t *testing.T) {
	path, d := setupCoachingFileDB(t)
	if _, err := d.Exec(`INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, signal_count, notes, why, example_before, example_after, created_at, updated_at)
		VALUES ('p1', 'general', 'prohibition', 'Never use the test pattern.', 'must-fix', 'seed-prohibitions-v1', 1, 'prohibition-id:TEST_PATTERN', 'Instead: write plainly.', 'the test pattern here', 'plain text here', 1000, 1000)`); err != nil {
		t.Fatal(err)
	}
	d.Close()

	result, err := GenerateCoachingPrompt(path, "blog", "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(result, `<prohibition id="TEST_PATTERN" severity="BLOCK">`) {
		t.Errorf("DB prohibition not rendered; got:\n%s", result)
	}
	if strings.Contains(result, "NEG_PARALLELISM") {
		t.Error("hardcoded fallback rendered despite DB prohibitions present")
	}
	if strings.Count(result, "Never use the test pattern.") != 1 {
		t.Error("prohibition rendered more than once")
	}
}
