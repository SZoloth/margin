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
		{Category: "ai-slop", Severity: "should-fix", RuleText: "Don't start with In today's", ExampleBefore: ptr(`(?i)^in today'?s`)},
	}

	py := GenerateWritingGuardPy(rules)

	checks := []string{
		"#!/usr/bin/env python3",
		"KILL_WORDS",
		`"leverage"`,
		"SLOP_PATTERNS",
		"PROSE_EXTENSIONS",
		"permissionDecision",
	}
	for _, check := range checks {
		if !strings.Contains(py, check) {
			t.Errorf("GenerateWritingGuardPy missing %q", check)
		}
	}
}

func TestIsSafeAutoCorrection(t *testing.T) {
	// These are the substrings that caused the guard to fire on every document.
	// A single space, common single words, and bare punctuation must be rejected.
	unsafe := []string{
		" ",
		"  ",
		"doing",
		"landscape",
		"Questions",
		"a mandate",
		"I learned",
		"—",
		"reframed",
		"that short", // 10 runes, still under the 12-rune floor
	}
	for _, s := range unsafe {
		if isSafeAutoCorrection(s) {
			t.Errorf("isSafeAutoCorrection(%q) = true, want false (would over-fire)", s)
		}
	}

	// Distinctive multi-word phrases are specific enough to substring-match safely.
	safe := []string{
		"The most useful thing I did last year had nothing to do with roadmaps.",
		"is the kind of problem I want to be working on.",
		"They stop filtering what they tell you.",
	}
	for _, s := range safe {
		if !isSafeAutoCorrection(s) {
			t.Errorf("isSafeAutoCorrection(%q) = false, want true (distinctive phrase)", s)
		}
	}
}

func TestGenerateWritingGuardPyFiltersAndScopes(t *testing.T) {
	rules := []db.WritingRule{
		// A garbage auto-correction that would match every document.
		{Category: "auto-synthesized", Severity: "must-fix", RuleText: "remove space", ExampleBefore: ptr(" ")},
		{Category: "auto-synthesized", Severity: "must-fix", RuleText: "vague", ExampleBefore: ptr("doing")},
		// A legit, distinctive auto-correction that should survive.
		{Category: "auto-synthesized", Severity: "must-fix", RuleText: "kill hyperbole",
			ExampleBefore: ptr("The most useful thing I did last year had nothing to do with roadmaps.")},
		// A letterless slop "pattern" (bare em dash) that would regex-match everything.
		{Category: "ai-slop", Severity: "must-fix", RuleText: "no em dash", ExampleBefore: ptr("—")},
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

	// The distinctive correction survives; the garbage ones are filtered out.
	if !strings.Contains(py, "The most useful thing I did last year") {
		t.Error("distinctive auto-correction was dropped")
	}
	autoStart := strings.Index(py, "AUTO_CORRECTIONS = json.loads(")
	autoEnd := strings.Index(py, "def get_extension")
	if autoStart == -1 || autoEnd == -1 || autoEnd < autoStart {
		t.Fatal("could not locate AUTO_CORRECTIONS blob in generated hook")
	}
	autoBlob := py[autoStart:autoEnd]
	if strings.Contains(autoBlob, `["doing"`) || strings.Contains(autoBlob, `[" "`) {
		t.Error("garbage auto-correction (\" \" or \"doing\") leaked into AUTO_CORRECTIONS")
	}
	// The letterless em-dash slop pattern must not appear as a slop pattern.
	slopStart := strings.Index(py, "SLOP_PATTERNS = json.loads(")
	slopEnd := strings.Index(py, "HEADING_PATTERNS = json.loads(")
	if slopStart != -1 && slopEnd != -1 && slopEnd > slopStart {
		if strings.Contains(py[slopStart:slopEnd], `"—"`) {
			t.Error("letterless em-dash slop pattern leaked into SLOP_PATTERNS")
		}
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
