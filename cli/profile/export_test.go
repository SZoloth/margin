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
