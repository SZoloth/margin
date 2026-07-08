package profile

import (
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

func TestSynthesisPromptGeneralizesFeedback(t *testing.T) {
	path, d := setupCoachingFileDB(t)
	// A feedback correction awaiting synthesis.
	insertCorrectionV2(t, d, "h1", "This is the kind of thing that matters", `["AI slop tell — cut the 'kind of thing that'"]`, strp("blog"), strp("corrective"))
	// A non-feedback correction that must NOT enter synthesis.
	mustExecSynth(t, d, `INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, highlight_color, created_at, updated_at, category)
		VALUES ('x', 'h2', 'doc1', 'sess1', 'do research on X', '["NOT FEEDBACK, A REQUEST/PROMPT"]', 'pink', 1000, 1000, 'non-feedback')`)
	// An already-synthesized correction must NOT re-enter.
	mustExecSynth(t, d, `INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, highlight_color, created_at, updated_at, synthesized_at)
		VALUES ('y', 'h3', 'doc1', 'sess1', 'already done', '["old"]', 'pink', 1000, 1000, 5000)`)
	d.Close()

	prompt, err := GenerateSynthesisPrompt(path, "", 0)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(prompt, "h1") {
		t.Error("feedback correction missing from synthesis prompt")
	}
	if strings.Contains(prompt, "do research on X") {
		t.Error("non-feedback correction leaked into synthesis prompt")
	}
	if strings.Contains(prompt, "already done") {
		t.Error("already-synthesized correction re-entered synthesis prompt")
	}
	// The output contract must instruct generalization + the JSON shape.
	for _, marker := range []string{"GENERALIZE", "source_highlight_ids", "detection_pattern", "category"} {
		if !strings.Contains(prompt, marker) {
			t.Errorf("synthesis prompt missing contract marker %q", marker)
		}
	}
}

func TestSynthesisPromptEmptyQueueErrors(t *testing.T) {
	path, d := setupCoachingFileDB(t)
	d.Close()
	_, err := GenerateSynthesisPrompt(path, "", 0)
	if err == nil {
		t.Error("expected error on empty synthesis queue, got nil")
	}
}

func TestSynthesisStatsCountsByType(t *testing.T) {
	path, d := setupCoachingFileDB(t)
	insertCorrectionV2(t, d, "h1", "a", `["note"]`, strp("blog"), nil)
	insertCorrectionV2(t, d, "h2", "b", `["note"]`, strp("blog"), nil)
	insertCorrectionV2(t, d, "h3", "c", `["note"]`, strp("email"), nil)
	insertCorrectionV2(t, d, "h4", "d", `["note"]`, nil, nil)
	d.Close()

	stats, err := SynthesisStats(path)
	if err != nil {
		t.Fatal(err)
	}
	if stats["total"] != 4 {
		t.Errorf("total = %d, want 4", stats["total"])
	}
	if stats["blog"] != 2 {
		t.Errorf("blog = %d, want 2", stats["blog"])
	}
	if stats["general"] != 1 {
		t.Errorf("general (untyped) = %d, want 1", stats["general"])
	}
}

func TestParseCandidateRules(t *testing.T) {
	jsonText := `[{"category":"ai-slop","rule_text":"Never use 'kind of thing that'","writing_type":"blog","severity":"must-fix","detection_pattern":"(?i)kind of \\w+ that","signal_count":3,"source_highlight_ids":["h1","h2","h3"]}]`
	rules, err := ParseCandidateRules(jsonText)
	if err != nil {
		t.Fatal(err)
	}
	if len(rules) != 1 {
		t.Fatalf("got %d rules, want 1", len(rules))
	}
	if rules[0].Category != "ai-slop" || rules[0].SignalCount != 3 || len(rules[0].SourceHighlights) != 3 {
		t.Errorf("candidate rule parsed incorrectly: %+v", rules[0])
	}
}

func mustExecSynth(t *testing.T, d *sql.DB, q string) {
	t.Helper()
	if _, err := d.Exec(q); err != nil {
		t.Fatal(err)
	}
}
