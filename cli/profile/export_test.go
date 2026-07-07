package profile

import (
	"strings"
	"testing"

	"github.com/nicholasgasior/margin/cli/db"
)

func ptr(s string) *string { return &s }

func TestFormatRulesMarkdown(t *testing.T) {
	rules := []db.WritingRule{
		{
			ID: "1", WritingType: "general", Category: "editorial",
			RuleText: "Keep it short", Severity: "must-fix",
			SignalCount: 5, Source: "manual",
		},
		{
			ID: "2", WritingType: "email", Category: "tone",
			RuleText: "Be direct", Severity: "should-fix",
			WhenToApply: ptr("Cold outreach"), Why: ptr("Saves reader time"),
			ExampleBefore: ptr("I was wondering if..."), ExampleAfter: ptr("Can you..."),
			SignalCount: 3, Source: "manual",
		},
	}

	md := FormatRulesMarkdown(rules)

	checks := []string{
		"# Writing Rules",
		"## General",
		"### Editorial",
		"**Rule: Keep it short** [must-fix]",
		"Signal: seen 5 time(s)",
		"## Email",
		"### Tone",
		"**Rule: Be direct** [should-fix]",
		"When to apply: Cold outreach",
		"Why: Saves reader time",
		`Before: "I was wondering if..."`,
		`After: "Can you..."`,
	}
	for _, check := range checks {
		if !strings.Contains(md, check) {
			t.Errorf("FormatRulesMarkdown missing %q", check)
		}
	}
}

func TestFormatProfileMarkdown(t *testing.T) {
	rules := []db.WritingRule{
		{
			ID: "1", WritingType: "general", Category: "voice-calibration",
			RuleText: "Short sentences", Severity: "must-fix",
			SignalCount: 10, Source: "seed",
		},
		{
			ID: "2", WritingType: "general", Category: "editorial",
			RuleText: "No filler", Severity: "should-fix",
			SignalCount: 3, Source: "manual",
		},
	}

	posPolarity := "positive"
	corrPolarity := "corrective"
	corrections := []db.CorrectionRecord{
		{OriginalText: "Good example here", Notes: []string{"natural tone"}, Polarity: &posPolarity},
		{OriginalText: "Bad example here", Notes: []string{"too formal"}, Polarity: &corrPolarity},
		{OriginalText: "Untagged example", Notes: []string{}},
	}

	md := FormatProfileMarkdown(rules, corrections)

	checks := []string{
		"# Writing Profile",
		"## Voice Calibration",
		"**Short sentences**",
		"## Writing Samples",
		"> Good example here",
		"— natural tone",
		"## Corrections",
		"**Bad example here** → too formal",
		"## Unclassified",
		"Untagged example → flagged",
		"# Writing Rules",
		"**Rule: No filler** [should-fix]",
	}
	for _, check := range checks {
		if !strings.Contains(md, check) {
			t.Errorf("FormatProfileMarkdown missing %q\n\nFull output:\n%s", check, md)
		}
	}

	// Voice calibration rules should NOT appear in the rules section
	rulesSection := md[strings.LastIndex(md, "# Writing Rules"):]
	if strings.Contains(rulesSection, "Short sentences") {
		t.Error("voice-calibration rule appeared in Writing Rules section")
	}
}

func TestTruncateUnicode(t *testing.T) {
	tests := []struct {
		input    string
		max      int
		expected string
	}{
		{"hello", 10, "hello"},
		{"hello", 3, "hel…"},
		{"café", 3, "caf…"},
		{"日本語テスト", 3, "日本語…"},
		{"", 5, ""},
	}
	for _, tt := range tests {
		got := truncateUnicode(tt.input, tt.max)
		if got != tt.expected {
			t.Errorf("truncateUnicode(%q, %d) = %q, want %q", tt.input, tt.max, got, tt.expected)
		}
	}
}

func TestGenerateWritingGuardPy(t *testing.T) {
	rules := []db.WritingRule{
		{Category: "kill-words", Severity: "must-fix", RuleText: "leverage"},
		{Category: "ai-slop", Severity: "should-fix", RuleText: "AI-vocabulary tell",
			DetectionPattern: ptr(`(?i)\bdelve\b`), Notes: ptr("slop-family:ai-vocabulary")},
		{Category: "prohibition", Severity: "must-fix", RuleText: "Never negative parallelism",
			DetectionPattern: ptr(`(?i)\bisn'?t [^.!?\n]{2,50}[—–] ?it'?s\b`)},
	}

	py := GenerateWritingGuardPy(rules)

	checks := []string{
		"#!/usr/bin/env python3",
		"KILL_WORDS",
		`"leverage"`,
		"HARD_PATTERNS",
		"SOFT_PATTERNS",
		"ai-vocabulary",
		"PROSE_EXTENSIONS",
		"permissionDecision",
	}
	for _, check := range checks {
		if !strings.Contains(py, check) {
			t.Errorf("GenerateWritingGuardPy missing %q", check)
		}
	}
}

func TestGenerateWritingGuardPyFiltersAndScopes(t *testing.T) {
	rules := []db.WritingRule{
		// example_before must NEVER become an executable pattern (the v1 defect:
		// verbatim past sentences shipped as regexes that matched nothing or
		// misfired on regex metacharacters).
		{Category: "ai-slop", Severity: "must-fix", RuleText: "verbatim sentence rule",
			ExampleBefore: ptr("Same approach I used at Wasabi: isolate what converters do")},
		{Category: "ai-slop", Severity: "must-fix", RuleText: "no em dash", ExampleBefore: ptr("—")},
		// Rules with a curated detection_pattern route by category.
		{Category: "ai-slop", Severity: "should-fix", RuleText: "copula tell",
			DetectionPattern: ptr(`(?i)\bserves as a\b`), Notes: ptr("slop-family:copula-avoidance")},
		{Category: "prohibition", Severity: "must-fix", RuleText: "kind-of-X tell",
			DetectionPattern: ptr(`(?i)\bthe kind of \w+ that\b`)},
	}

	py := GenerateWritingGuardPy(rules)

	// PEP 263 encoding cookie must be on line 2 so interpreters that default
	// source decoding to ASCII (Apple python3 under a C locale) don't choke on
	// the non-ASCII em-dash bytes in the rule data.
	guardLines := strings.SplitN(py, "\n", 3)
	if len(guardLines) < 2 || !strings.Contains(guardLines[1], "coding: utf-8") {
		t.Errorf("generated hook missing utf-8 encoding cookie on line 2; got line 2 = %q", func() string {
			if len(guardLines) >= 2 {
				return guardLines[1]
			}
			return ""
		}())
	}

	// Path scoping must be present so internal docs are advisory-only.
	for _, marker := range []string{"PUBLISHED_PATH_MARKERS", "def is_published", "advisory"} {
		if !strings.Contains(py, marker) {
			t.Errorf("generated hook missing %q — internal/published scoping absent", marker)
		}
	}

	// Cluster scoring must be present.
	for _, marker := range []string{"soft_by_family", ">= 2"} {
		if !strings.Contains(py, marker) {
			t.Errorf("generated hook missing %q — cluster scoring absent", marker)
		}
	}

	// example_before content must not appear anywhere as executable data.
	if strings.Contains(py, "Same approach I used at Wasabi") {
		t.Error("example_before leaked into the generated hook as a pattern")
	}

	// detection_pattern rules route to the right buckets.
	hardStart := strings.Index(py, "HARD_PATTERNS = json.loads(")
	softStart := strings.Index(py, "SOFT_PATTERNS = json.loads(")
	headingStart := strings.Index(py, "HEADING_PATTERNS = json.loads(")
	if hardStart == -1 || softStart == -1 || headingStart == -1 {
		t.Fatal("could not locate pattern blobs in generated hook")
	}
	hardBlob := py[hardStart:softStart]
	softBlob := py[softStart:headingStart]
	if !strings.Contains(hardBlob, "kind of") {
		t.Error("prohibition detection_pattern missing from HARD_PATTERNS")
	}
	if !strings.Contains(softBlob, "serves as a") || !strings.Contains(softBlob, "copula-avoidance") {
		t.Error("soft detection_pattern or family missing from SOFT_PATTERNS")
	}
}

func TestCategoryLabel(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"kill-words", "Kill Words"},
		{"ai-slop", "Ai Slop"},
		{"voice-calibration", "Voice Calibration"},
		{"editorial", "Editorial"},
	}
	for _, tt := range tests {
		got := categoryLabel(tt.input)
		if got != tt.expected {
			t.Errorf("categoryLabel(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
