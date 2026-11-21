package profile

import (
	"strings"
	"testing"

	"github.com/SZoloth/margin/cli/db"
)

func TestGuardSkipsBacktrackingPatterns(t *testing.T) {
	rules := []db.WritingRule{
		{Category: "prohibition", Severity: "must-fix", RuleText: "nested",
			DetectionPattern: ptr(`(a+)+$`)},
		{Category: "ai-slop", Severity: "should-fix", RuleText: "starred",
			DetectionPattern: ptr(`(?:x*)*y`)},
		{Category: "heading-patterns", Severity: "must-fix", RuleText: "heading",
			ExampleBefore: ptr(`^(\w+\s?)+:$`)},
		{Category: "prohibition", Severity: "must-fix", RuleText: "kept",
			DetectionPattern: ptr(`(?i)\bisn'?t [^.!?\n]{2,50}[—–] ?it'?s\b`)},
	}
	py := GenerateWritingGuardPy(rules)
	for _, bad := range []string{`(a+)+$`, `(?:x*)*y`, `(\\w+\\s?)+:`} {
		if strings.Contains(py, bad) {
			t.Errorf("guard still contains backtracking pattern %q", bad)
		}
	}
	if !strings.Contains(py, `[^.!?\\n]{2,50}`) {
		t.Errorf("guard dropped a safe pattern")
	}
}

func TestIsSafePattern(t *testing.T) {
	cases := map[string]bool{
		`(a+)+$`:                 false,
		`(?:a*)*b`:               false,
		`((ab)+c)*`:              false,
		`(\w)\1`:                 false,
		`\bvery\b`:               true,
		`(?i)\bdelve\b`:          true,
		`[(+)]+`:                 true,
		`(foo|bar)+`:             true,
		`a{3}!`:                  true,
		strings.Repeat("a", 501): false,
	}
	for p, want := range cases {
		if got := isSafePattern(p); got != want {
			t.Errorf("isSafePattern(%q) = %v, want %v", p, got, want)
		}
	}
}
