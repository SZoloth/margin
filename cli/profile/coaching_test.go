package profile

import (
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func setupCoachingDB(t *testing.T) *sql.DB {
	t.Helper()
	d, err := sql.Open("sqlite", ":memory:")
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
			polarity TEXT, extended_context TEXT
		)`,
		`CREATE TABLE writing_rules (
			id TEXT PRIMARY KEY, writing_type TEXT, category TEXT,
			rule_text TEXT, when_to_apply TEXT, why TEXT, severity TEXT,
			example_before TEXT, example_after TEXT, source TEXT,
			signal_count INTEGER DEFAULT 1, notes TEXT,
			created_at INTEGER, updated_at INTEGER
		)`,
	}
	for _, s := range stmts {
		if _, err := d.Exec(s); err != nil {
			t.Fatalf("setup SQL failed: %v\n%s", err, s)
		}
	}
	return d
}

func insertTestCorrection(t *testing.T, d *sql.DB, id, text, notes string, prefix, suffix *string) {
	t.Helper()
	_, err := d.Exec(
		`INSERT INTO corrections (id, highlight_id, document_id, session_id,
			original_text, notes_json, prefix_context, suffix_context,
			highlight_color, created_at, updated_at)
		 VALUES (?, ?, 'doc1', 'sess1', ?, ?, ?, ?, 'pink', 1000, 1000)`,
		id, id, text, notes, prefix, suffix)
	if err != nil {
		t.Fatal(err)
	}
}

func insertTestRule(t *testing.T, d *sql.DB, id, wt, severity string, signalCount int, before, after *string) {
	t.Helper()
	_, err := d.Exec(
		`INSERT INTO writing_rules (id, writing_type, category, rule_text,
			severity, source, signal_count, example_before, example_after,
			created_at, updated_at)
		 VALUES (?, ?, 'editorial', 'Test rule: '||?, ?, 'manual', ?, ?, ?, 1000, 1000)`,
		id, wt, id, severity, signalCount, before, after)
	if err != nil {
		t.Fatal(err)
	}
}

func testCoachingPromptFromDB(t *testing.T, d *sql.DB, writingType, register string) string {
	t.Helper()

	// Write to temp file
	tmpDir := t.TempDir()
	tmpDB := tmpDir + "/test.db"

	// Copy the in-memory DB to a file
	dest, err := sql.Open("sqlite", tmpDB)
	if err != nil {
		t.Fatal(err)
	}

	// Re-create tables and copy data
	stmts := []string{
		`CREATE TABLE corrections (
			id TEXT PRIMARY KEY, highlight_id TEXT, document_id TEXT,
			session_id TEXT, original_text TEXT, prefix_context TEXT,
			suffix_context TEXT, notes_json TEXT, document_title TEXT,
			document_source TEXT, document_path TEXT, highlight_color TEXT,
			created_at INTEGER, updated_at INTEGER, writing_type TEXT,
			polarity TEXT, extended_context TEXT
		)`,
		`CREATE TABLE writing_rules (
			id TEXT PRIMARY KEY, writing_type TEXT, category TEXT,
			rule_text TEXT, when_to_apply TEXT, why TEXT, severity TEXT,
			example_before TEXT, example_after TEXT, source TEXT,
			signal_count INTEGER DEFAULT 1, notes TEXT,
			created_at INTEGER, updated_at INTEGER
		)`,
	}
	for _, s := range stmts {
		dest.Exec(s)
	}

	// Copy corrections
	rows, _ := d.Query("SELECT id, highlight_id, document_id, session_id, original_text, notes_json, prefix_context, suffix_context, highlight_color, created_at, updated_at FROM corrections")
	for rows.Next() {
		var id, hid, did, sid, text, notes, color string
		var prefix, suffix *string
		var ca, ua int64
		rows.Scan(&id, &hid, &did, &sid, &text, &notes, &prefix, &suffix, &color, &ca, &ua)
		dest.Exec("INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, prefix_context, suffix_context, highlight_color, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
			id, hid, did, sid, text, notes, prefix, suffix, color, ca, ua)
	}
	rows.Close()

	// Copy rules
	rrows, _ := d.Query("SELECT id, writing_type, category, rule_text, severity, source, signal_count, example_before, example_after, created_at, updated_at FROM writing_rules")
	for rrows.Next() {
		var id, wt, cat, rt, sev, src string
		var sc int
		var eb, ea *string
		var ca, ua int64
		rrows.Scan(&id, &wt, &cat, &rt, &sev, &src, &sc, &eb, &ea, &ca, &ua)
		dest.Exec("INSERT INTO writing_rules (id, writing_type, category, rule_text, severity, source, signal_count, example_before, example_after, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
			id, wt, cat, rt, sev, src, sc, eb, ea, ca, ua)
	}
	rrows.Close()
	dest.Close()

	result, err := GenerateCoachingPrompt(tmpDB, writingType, register)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestCoachingPromptEmptyDB(t *testing.T) {
	d := setupCoachingDB(t)
	defer d.Close()

	result := testCoachingPromptFromDB(t, d, "email", "")

	// Should still have prohibition blocks
	if !strings.Contains(result, "<prohibitions>") {
		t.Error("missing prohibitions section")
	}
	if !strings.Contains(result, "NEG_PARALLELISM") {
		t.Error("missing NEG_PARALLELISM prohibition")
	}

	// Should NOT have corrections or rules sections
	if strings.Contains(result, "<corrections>") {
		t.Error("empty DB should not have corrections section")
	}
	if strings.Contains(result, "<structural-rules>") {
		t.Error("empty DB should not have structural-rules section")
	}

	if !strings.Contains(result, "Writing type: email") {
		t.Error("missing writing type")
	}
	if !strings.Contains(result, "Register: professional") {
		t.Error("email should default to professional register")
	}
}

func TestCoachingPromptWithCorrections(t *testing.T) {
	d := setupCoachingDB(t)
	defer d.Close()

	insertTestCorrection(t, d, "c1", "The challenge isn't technical", `["Negative parallelism"]`, ptr("said that"), ptr("it's organizational"))
	insertTestCorrection(t, d, "c2", "furthermore", `["Kill word"]`, nil, nil)
	insertTestCorrection(t, d, "c3", "delve into the details", `["AI slop vocabulary"]`, ptr("we need to"), nil)

	result := testCoachingPromptFromDB(t, d, "blog", "casual")

	if !strings.Contains(result, "<corrections>") {
		t.Error("missing corrections section")
	}
	if !strings.Contains(result, `1. Flagged: "The challenge isn't technical"`) {
		t.Error("missing first correction")
	}
	if !strings.Contains(result, "Negative parallelism") {
		t.Error("missing correction notes")
	}
	if !strings.Contains(result, "...said that") {
		t.Error("missing prefix context")
	}
	if !strings.Contains(result, "it's organizational...") {
		t.Error("missing suffix context")
	}
	if !strings.Contains(result, "2.") {
		t.Error("corrections should be numbered")
	}
}

func TestCoachingPromptWithHighSignalRules(t *testing.T) {
	d := setupCoachingDB(t)
	defer d.Close()

	before := "I was wondering if"
	after := "Can you"
	insertTestRule(t, d, "high", "general", "must-fix", 3, &before, &after)
	insertTestRule(t, d, "low", "general", "nice-to-fix", 1, nil, nil)

	result := testCoachingPromptFromDB(t, d, "general", "professional")

	if !strings.Contains(result, "<structural-rules>") {
		t.Error("missing structural-rules section")
	}
	if !strings.Contains(result, "Test rule: high") {
		t.Error("high-signal rule should appear")
	}
	if strings.Contains(result, "Test rule: low") {
		t.Error("low-signal rule should NOT appear")
	}
	if !strings.Contains(result, `Bad: "I was wondering if"`) {
		t.Error("missing example_before")
	}
	if !strings.Contains(result, `Good: "Can you"`) {
		t.Error("missing example_after")
	}
}

func TestCoachingPromptTypeConstraints(t *testing.T) {
	d := setupCoachingDB(t)
	defer d.Close()

	tests := []struct {
		writingType string
		contains    string
	}{
		{"email", "3-5 sentences"},
		{"outreach", "2-3 sentences"},
		{"slack", "1-2 sentences"},
		{"resume", "Under 30 words"},
		{"text", "1-3 sentences"},
		{"blog", ""},
	}

	for _, tt := range tests {
		result := testCoachingPromptFromDB(t, d, tt.writingType, "")
		if tt.contains != "" && !strings.Contains(result, tt.contains) {
			t.Errorf("type %q: expected %q in output", tt.writingType, tt.contains)
		}
		if tt.contains == "" && strings.Contains(result, "Keep it SHORT") {
			t.Errorf("type %q: should NOT have length constraint", tt.writingType)
		}
	}
}

func TestCoachingPromptProhibitionBlocksPresent(t *testing.T) {
	d := setupCoachingDB(t)
	defer d.Close()

	result := testCoachingPromptFromDB(t, d, "general", "")

	prohibitionIDs := []string{
		"NEG_PARALLELISM",
		"EM_DASH_LIMIT",
		"TERMINAL_PUNCTUATION",
		"AI_SLOP",
		"COLON_LIMIT",
	}
	for _, id := range prohibitionIDs {
		if !strings.Contains(result, id) {
			t.Errorf("missing prohibition: %s", id)
		}
	}
}

func TestCoachingPromptRegisterDefaults(t *testing.T) {
	d := setupCoachingDB(t)
	defer d.Close()

	tests := []struct {
		writingType      string
		expectedRegister string
	}{
		{"email", "professional"},
		{"slack", "casual"},
		{"blog", "casual"},
		{"text", "casual"},
		{"cover-letter", "professional"},
		{"prd", "explaining"},
	}

	for _, tt := range tests {
		result := testCoachingPromptFromDB(t, d, tt.writingType, "")
		expected := "Register: " + tt.expectedRegister
		if !strings.Contains(result, expected) {
			t.Errorf("type %q: expected %q, got different register", tt.writingType, tt.expectedRegister)
		}
	}
}

func TestCoachingPromptRegisterOverride(t *testing.T) {
	d := setupCoachingDB(t)
	defer d.Close()

	result := testCoachingPromptFromDB(t, d, "email", "casual")
	if !strings.Contains(result, "Register: casual") {
		t.Error("register override not applied")
	}
}

func TestCoachingPromptBackfilledCorrectionsExcluded(t *testing.T) {
	d := setupCoachingDB(t)
	defer d.Close()

	// Insert a backfilled correction — should be excluded
	_, err := d.Exec(
		`INSERT INTO corrections (id, highlight_id, document_id, session_id,
			original_text, notes_json, highlight_color, created_at, updated_at)
		 VALUES ('bf1', 'bf1', 'doc1', '__backfilled__', 'backfilled text', '["note"]', 'pink', 1000, 1000)`)
	if err != nil {
		t.Fatal(err)
	}

	result := testCoachingPromptFromDB(t, d, "general", "")

	if strings.Contains(result, "backfilled text") {
		t.Error("backfilled corrections should be excluded")
	}
}
