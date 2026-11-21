package profile

import "regexp"

const maxPatternLength = 500

var backreference = regexp.MustCompile(`\\[1-9]|\\k<`)

// isSafePattern reports whether a rule's regex is safe to run in a
// backtracking engine. The guard hook runs patterns with Python's re on every
// prose write, so one runaway pattern would hang Claude's writes. It rejects
// patterns that are too long, use backreferences, or put a quantifier on a
// group that already holds one, such as (a+)+ or (?:a*)*. Mirrors isSafePattern
// in src/components/editor/extensions/rule-scan.ts.
func isSafePattern(pattern string) bool {
	if len(pattern) > maxPatternLength || backreference.MatchString(pattern) {
		return false
	}
	var groups []bool // per open group: holds a quantifier?
	mark := func() {
		if len(groups) > 0 {
			groups[len(groups)-1] = true
		}
	}
	inClass := false
	for i := 0; i < len(pattern); i++ {
		c := pattern[i]
		switch {
		case c == '\\':
			i++
		case inClass:
			if c == ']' {
				inClass = false
			}
		case c == '[':
			inClass = true
		case c == '(':
			groups = append(groups, false)
		case c == ')':
			inside := false
			if n := len(groups); n > 0 {
				inside = groups[n-1]
				groups = groups[:n-1]
			}
			quantified := i+1 < len(pattern) && (pattern[i+1] == '*' || pattern[i+1] == '+' || pattern[i+1] == '{')
			if inside && quantified {
				return false
			}
			if inside || quantified {
				mark()
			}
		case c == '*' || c == '+' || c == '{':
			mark()
		}
	}
	return true
}
