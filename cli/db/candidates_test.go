package db

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func setupRulesDB(t *testing.T) *sql.DB {
	t.Helper()
	path := t.TempDir() + "/rules.db"
	d, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = d.Exec(`CREATE TABLE writing_rules (
		id TEXT PRIMARY KEY, writing_type TEXT, category TEXT, rule_text TEXT,
		when_to_apply TEXT, why TEXT, severity TEXT, example_before TEXT,
		example_after TEXT, source TEXT, signal_count INTEGER DEFAULT 1,
		notes TEXT, created_at INTEGER, updated_at INTEGER,
		detection_pattern TEXT, reviewed_at INTEGER,
		UNIQUE(writing_type, category, rule_text)
	)`)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// The core safety property: a synthesized candidate is invisible to every
// export selection until it is accepted.
func TestCandidateReviewGate(t *testing.T) {
	d := setupRulesDB(t)
	defer d.Close()

	n, err := InsertCandidateRules(d, []CandidateRuleInput{
		{Category: "ai-slop", RuleText: "Never hedge-stack", WritingType: "blog",
			Severity: "must-fix", SignalCount: 4, SourceHighlights: []string{"h1", "h2"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("inserted %d, want 1", n)
	}

	// Excluded from coaching selection while unreviewed.
	high, err := GetHighSignalRules(d, 30, "blog")
	if err != nil {
		t.Fatal(err)
	}
	if len(high) != 0 {
		t.Errorf("unreviewed candidate leaked into GetHighSignalRules (%d rules)", len(high))
	}

	// Visible in the candidate queue.
	cands, err := GetCandidateRules(d, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(cands) != 1 {
		t.Fatalf("candidate queue has %d, want 1", len(cands))
	}
	if !cands[0].IsUnreviewedCandidate() {
		t.Error("candidate should report IsUnreviewedCandidate = true")
	}
	// Source-highlight provenance is preserved in notes.
	if cands[0].Notes == nil || *cands[0].Notes != "synthesized-from:h1,h2" {
		t.Errorf("source-highlight provenance missing: %v", cands[0].Notes)
	}

	// Accept it → now it flows into coaching.
	if err := AcceptCandidateRule(d, cands[0].ID); err != nil {
		t.Fatal(err)
	}
	high, err = GetHighSignalRules(d, 30, "blog")
	if err != nil {
		t.Fatal(err)
	}
	if len(high) != 1 {
		t.Errorf("accepted candidate missing from GetHighSignalRules (%d rules)", len(high))
	}
	if high[0].Source != "synthesis" {
		t.Errorf("accepted candidate source = %q, want synthesis", high[0].Source)
	}
}

func TestRejectCandidateRemovesIt(t *testing.T) {
	d := setupRulesDB(t)
	defer d.Close()

	InsertCandidateRules(d, []CandidateRuleInput{
		{Category: "tone", RuleText: "Drop the exclamation points", WritingType: "email", Severity: "should-fix", SignalCount: 2},
	})
	cands, _ := GetCandidateRules(d, false)
	if len(cands) != 1 {
		t.Fatalf("setup: want 1 candidate, got %d", len(cands))
	}
	if err := RejectCandidateRule(d, cands[0].ID); err != nil {
		t.Fatal(err)
	}
	after, _ := GetCandidateRules(d, false)
	if len(after) != 0 {
		t.Errorf("rejected candidate still present (%d)", len(after))
	}
}

func TestAcceptedCandidateCannotBeRejected(t *testing.T) {
	d := setupRulesDB(t)
	defer d.Close()

	InsertCandidateRules(d, []CandidateRuleInput{
		{Category: "structure", RuleText: "Lead with the outcome", WritingType: "general", Severity: "should-fix", SignalCount: 3},
	})
	cands, _ := GetCandidateRules(d, false)
	AcceptCandidateRule(d, cands[0].ID)
	// Once accepted it's no longer an unreviewed candidate, so reject is a no-op error.
	if err := RejectCandidateRule(d, cands[0].ID); err == nil {
		t.Error("expected reject of an accepted rule to fail")
	}
}
