package profile

import (
	"strings"
	"testing"

	"github.com/nicholasgasior/margin/cli/db"
)

func TestFormatCodexAgentsMD_EmptyRules(t *testing.T) {
	md := FormatCodexAgentsMD(nil, nil)
	if !strings.Contains(md, "# Writing Rules") {
		t.Error("FormatCodexAgentsMD: missing '# Writing Rules' header with no rules")
	}
	if !strings.Contains(md, "AUTO-GENERATED") {
		t.Error("FormatCodexAgentsMD: missing AUTO-GENERATED marker")
	}
}

func TestFormatCodexAgentsMD_KillWords(t *testing.T) {
	rules := []db.WritingRule{
		{
			ID: "1", WritingType: "general", Category: "kill-words",
			RuleText: "leverage", Severity: "must-fix",
			SignalCount: 3, Source: "manual",
		},
		{
			ID: "2", WritingType: "general", Category: "kill-words",
			RuleText: "utilize", Severity: "must-fix",
			SignalCount: 2, Source: "manual",
		},
	}

	md := FormatCodexAgentsMD(rules, nil)

	checks := []string{
		"Do not use the word",
		"leverage",
		"utilize",
	}
	for _, check := range checks {
		if !strings.Contains(md, check) {
			t.Errorf("FormatCodexAgentsMD kill words: missing %q\n\nFull output:\n%s", check, md)
		}
	}
}

func TestFormatCodexAgentsMD_EditorialRules(t *testing.T) {
	rules := []db.WritingRule{
		{
			ID: "1", WritingType: "general", Category: "editorial",
			RuleText: "Keep sentences short", Severity: "must-fix",
			SignalCount: 5, Source: "manual",
		},
		{
			ID: "2", WritingType: "email", Category: "tone",
			RuleText: "Be direct", Severity: "should-fix",
			WhenToApply: ptr("Cold outreach"),
			SignalCount: 2, Source: "manual",
		},
	}

	md := FormatCodexAgentsMD(rules, nil)

	checks := []string{
		"Keep sentences short",
		"Be direct",
		"General",
		"Email",
	}
	for _, check := range checks {
		if !strings.Contains(md, check) {
			t.Errorf("FormatCodexAgentsMD editorial: missing %q\n\nFull output:\n%s", check, md)
		}
	}
}

func TestFormatCodexAgentsMD_VoiceCalibration(t *testing.T) {
	rules := []db.WritingRule{
		{
			ID: "1", WritingType: "general", Category: "voice-calibration",
			RuleText: "Prefer fragments over full sentences in casual writing",
			Severity: "must-fix", SignalCount: 10, Source: "seed",
		},
	}

	md := FormatCodexAgentsMD(rules, nil)

	if !strings.Contains(md, "Prefer fragments over full sentences in casual writing") {
		t.Errorf("FormatCodexAgentsMD: voice calibration rule missing\n\nFull output:\n%s", md)
	}
}

func TestFormatCodexAgentsMD_CorrectiveExamples(t *testing.T) {
	corrPolarity := "corrective"
	corrections := []db.CorrectionRecord{
		{
			OriginalText: "In today's fast-paced world",
			Notes:        []string{"AI slop opener — cut it"},
			Polarity:     &corrPolarity,
		},
	}

	md := FormatCodexAgentsMD(nil, corrections)

	if !strings.Contains(md, "In today's fast-paced world") {
		t.Errorf("FormatCodexAgentsMD: corrective example missing\n\nFull output:\n%s", md)
	}
	if !strings.Contains(md, "AI slop opener") {
		t.Errorf("FormatCodexAgentsMD: correction note missing\n\nFull output:\n%s", md)
	}
}

func TestFormatCodexAgentsMD_PositiveExamplesExcluded(t *testing.T) {
	posPolarity := "positive"
	corrections := []db.CorrectionRecord{
		{
			OriginalText: "This is a great example to emulate",
			Notes:        []string{"natural voice"},
			Polarity:     &posPolarity,
		},
	}

	md := FormatCodexAgentsMD(nil, corrections)

	// Positive examples are writing samples — excluded from prohibition list
	// They can appear in a separate section but should not appear in "Do not write" context
	if strings.Contains(md, "Do not write") && strings.Contains(md, "This is a great example to emulate") {
		t.Error("FormatCodexAgentsMD: positive correction appearing in prohibition context")
	}
}

func TestFormatCodexAgentsMD_AISlopPatterns(t *testing.T) {
	rules := []db.WritingRule{
		{
			ID: "1", WritingType: "general", Category: "ai-slop",
			RuleText:      "Don't start with 'In today's'",
			ExampleBefore: ptr(`(?i)^in today'?s`),
			Severity:      "must-fix", SignalCount: 4, Source: "manual",
		},
	}

	md := FormatCodexAgentsMD(rules, nil)

	if !strings.Contains(md, "Don't start with") {
		t.Errorf("FormatCodexAgentsMD: ai-slop rule missing\n\nFull output:\n%s", md)
	}
}

func TestFormatCodexAgentsMD_ContainsHeader(t *testing.T) {
	md := FormatCodexAgentsMD(nil, nil)

	// Must have the managed-section marker so future re-exports can locate the section
	if !strings.Contains(md, "BEGIN MARGIN WRITING RULES") {
		t.Errorf("FormatCodexAgentsMD: missing BEGIN marker\n\nFull output:\n%s", md)
	}
	if !strings.Contains(md, "END MARGIN WRITING RULES") {
		t.Errorf("FormatCodexAgentsMD: missing END marker\n\nFull output:\n%s", md)
	}
}

func TestMergeCodexAgentsMD_NoExistingMarkers(t *testing.T) {
	existing := "# My Custom Instructions\n\nDo things my way.\n"
	managed := "<!-- BEGIN MARGIN WRITING RULES -->\n# Writing Rules\n<!-- END MARGIN WRITING RULES -->\n"

	result := mergeCodexAgentsMD(existing, managed)

	if !strings.Contains(result, "My Custom Instructions") {
		t.Error("mergeCodexAgentsMD: user content lost when no markers present")
	}
	if !strings.Contains(result, "BEGIN MARGIN WRITING RULES") {
		t.Error("mergeCodexAgentsMD: managed section not appended")
	}
}

func TestMergeCodexAgentsMD_ReplacesExistingMarkers(t *testing.T) {
	existing := `# My Notes

Some user content here.

<!-- BEGIN MARGIN WRITING RULES -->
# Writing Rules

Old rules here.

<!-- END MARGIN WRITING RULES -->

More user content after.
`
	newManaged := "<!-- BEGIN MARGIN WRITING RULES -->\n# Writing Rules\n\nNew rules here.\n<!-- END MARGIN WRITING RULES -->\n"

	result := mergeCodexAgentsMD(existing, newManaged)

	if !strings.Contains(result, "My Notes") {
		t.Error("mergeCodexAgentsMD: user content before section lost")
	}
	if !strings.Contains(result, "More user content after") {
		t.Error("mergeCodexAgentsMD: user content after section lost")
	}
	if strings.Contains(result, "Old rules here") {
		t.Error("mergeCodexAgentsMD: old managed content not replaced")
	}
	if !strings.Contains(result, "New rules here") {
		t.Error("mergeCodexAgentsMD: new managed content not present")
	}
}

func TestMergeCodexAgentsMD_EmptyExisting(t *testing.T) {
	managed := "<!-- BEGIN MARGIN WRITING RULES -->\ncontent\n<!-- END MARGIN WRITING RULES -->\n"
	result := mergeCodexAgentsMD("", managed)

	if result != managed {
		t.Errorf("mergeCodexAgentsMD empty existing: got %q, want %q", result, managed)
	}
}
