package profile

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/nicholasgasior/margin/cli/db"
)

// GenerateSynthesisPrompt builds the prompt an LLM uses to generalize a batch
// of raw feedback corrections into candidate writing rules. This is the
// "jig" (Puckett) for the synthesis stage: it does no reasoning itself, it
// just assembles the corrections and the output contract. The calling agent
// produces candidate rules as JSON, which are written back (review-gated)
// via `margin rules add-candidate` or the MCP equivalent.
//
// Output contract is organized around the Lago voice-skill buckets: the
// synthesizer must generalize (never emit a verbatim note as a rule), assign
// a fixed-enum category, scope each rule, and — where the pattern is
// mechanically detectable — propose a validated detection_pattern regex.
func GenerateSynthesisPrompt(dbPath string, writingType string, limit int) (string, error) {
	d, err := db.OpenRead(dbPath)
	if err != nil {
		return "", err
	}
	defer d.Close()

	corrections, err := db.GetUnsynthesizedFeedback(d, writingType, limit)
	if err != nil {
		return "", fmt.Errorf("loading unsynthesized feedback: %w", err)
	}

	if len(corrections) == 0 {
		if writingType != "" {
			return "", fmt.Errorf("no unsynthesized feedback corrections found for writing type %s", writingType)
		}
		return "", fmt.Errorf("no unsynthesized feedback corrections found")
	}

	var b strings.Builder

	b.WriteString(`You are synthesizing a writer's raw editorial corrections into durable, enforceable writing rules.

Each correction below is a real moment where the writer flagged something in prose: the flagged text, an optional "should be" edit, and the writer's note explaining what was wrong. Your job is to GENERALIZE these into rules that will apply to all future writing of this kind — never restate a note verbatim as a rule.

The gap between what was drafted and what the writer actually wanted is where their voice lives. Read for the pattern behind each correction, then cluster corrections that express the same underlying preference.

## Output contract

Return ONLY a JSON array of candidate rules. Each rule:

{
  "category": one of ["kill-words","ai-slop","prohibition","voice-calibration","structure","editorial","argument-rigor","tone","concision","sentence-rhythm"],
  "rule_text": the generalized rule, stated as an imperative ("Never...", "Prefer...", "Cut..."). Specific and actionable — "Cut any sentence that announces the insight before stating it", not "write clearly".
  "writing_type": one of ["general","email","prd","blog","cover-letter","resume","slack","pitch","outreach","text"] — use "general" unless the corrections are clearly type-specific,
  "severity": one of ["must-fix","should-fix","nice-to-fix"],
  "detection_pattern": OPTIONAL Python-re regex that mechanically detects this pattern, ONLY when it is reliably detectable (a word list, a fixed construction). Omit for judgment-based rules. A regex that would misfire on normal prose is worse than none.
  "example_before": a short concrete example of the violation (from the corrections if possible),
  "example_after": the corrected version,
  "signal_count": how many of the corrections below support this rule (its strength),
  "source_highlight_ids": array of the highlight_id values of the corrections this rule generalizes from
}

## Rules for good synthesis

- Cluster first. If five corrections all flag hedge-stacking, that is ONE rule with signal_count 5, not five rules.
- Generalize hard. The rule must apply to text the writer has never seen.
- Only propose a detection_pattern when a machine could catch it without judgment. Most voice rules cannot — leave the field out.
- Preserve the writer's actual preferences, including "incorrect" ones. If they always drop the Oxford comma, that is a rule, not an error to fix.
- If a correction is genuinely idiosyncratic (one-off, no generalizable pattern), skip it rather than manufacture a rule.

## The corrections

`)

	for i, c := range corrections {
		fmt.Fprintf(&b, "\n### Correction %d (highlight_id: %s)\n", i+1, c.HighlightID)
		if c.WritingType != nil && *c.WritingType != "" {
			fmt.Fprintf(&b, "writing_type: %s\n", *c.WritingType)
		}
		fmt.Fprintf(&b, "Flagged text: %q\n", truncateUnicode(c.OriginalText, 300))
		if c.PrefixContext != nil || c.SuffixContext != nil {
			prefix, suffix := "", ""
			if c.PrefixContext != nil {
				prefix = truncateUnicode(*c.PrefixContext, 80)
			}
			if c.SuffixContext != nil {
				suffix = truncateUnicode(*c.SuffixContext, 80)
			}
			fmt.Fprintf(&b, "Context: ...%s [FLAGGED] %s...\n", prefix, suffix)
		}
		if c.SuggestedEdit != nil && *c.SuggestedEdit != "" {
			fmt.Fprintf(&b, "Should be: %q\n", truncateUnicode(*c.SuggestedEdit, 300))
		}
		fmt.Fprintf(&b, "Writer's note: %s\n", strings.Join(c.Notes, "; "))
	}

	fmt.Fprintf(&b, "\n\n---\nTotal corrections: %d. Return the JSON array of candidate rules now.\n", len(corrections))

	return b.String(), nil
}

// SynthesisStats summarizes the queue without emitting the full prompt —
// useful for a dashboard or a "what's pending" check.
func SynthesisStats(dbPath string) (map[string]int, error) {
	d, err := db.OpenRead(dbPath)
	if err != nil {
		return nil, err
	}
	defer d.Close()

	all, err := db.GetUnsynthesizedFeedback(d, "", 100000)
	if err != nil {
		return nil, err
	}
	stats := map[string]int{"total": len(all)}
	for _, c := range all {
		t := "general"
		if c.WritingType != nil && *c.WritingType != "" {
			t = *c.WritingType
		}
		stats[t]++
	}
	return stats, nil
}

// marshalCandidateRules is a helper for tests/consumers to round-trip the
// candidate JSON contract without duplicating the field shape.
type CandidateRule struct {
	Category         string   `json:"category"`
	RuleText         string   `json:"rule_text"`
	WritingType      string   `json:"writing_type"`
	Severity         string   `json:"severity"`
	DetectionPattern string   `json:"detection_pattern,omitempty"`
	ExampleBefore    string   `json:"example_before,omitempty"`
	ExampleAfter     string   `json:"example_after,omitempty"`
	SignalCount      int      `json:"signal_count"`
	SourceHighlights []string `json:"source_highlight_ids"`
}

func ParseCandidateRules(jsonText string) ([]CandidateRule, error) {
	var rules []CandidateRule
	if err := json.Unmarshal([]byte(jsonText), &rules); err != nil {
		return nil, fmt.Errorf("parsing candidate rules JSON: %w", err)
	}
	return rules, nil
}
