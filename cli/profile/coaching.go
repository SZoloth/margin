package profile

import (
	"fmt"
	"strings"

	"github.com/nicholasgasior/margin/cli/db"
)

const prohibitionBlocks = `<prohibition id="NEG_PARALLELISM" severity="BLOCK">
Never contrast what something "isn't" with what it "is."
Match variants: "isn't X — it's Y", "isn't X. It's Y", "not about X — it's about Y", "wasn't X — was Y", "don't X — Y", "more X, not Y", "X works. It fails Y"
Instead: state what it IS directly. Drop the contrast.
Bad: "The challenge isn't technical — it's organizational"
Good: "The challenge is organizational"
</prohibition>

<prohibition id="EM_DASH_LIMIT" severity="BLOCK">
Maximum 2 em dashes (—) per document. Zero is fine. Three or more is a violation.
Instead: use periods, commas, or restructure the sentence.
</prohibition>

<prohibition id="TERMINAL_PUNCTUATION" severity="BLOCK">
Every paragraph of prose must end with a period, question mark, or exclamation point. No trailing off without punctuation.
This applies to email bodies, message bodies, and all prose — not headers or signatures.
</prohibition>

<prohibition id="AI_SLOP" severity="BLOCK">
Never use "is the kind of X that" — this is a recognized AI writing tell.
Bad: "This is the kind of problem I want to work on"
Good: "I want to work on this problem"
Also avoid: hyperbolic claims like "the most [adj] thing", "thing nobody mentions", "the real X is"
</prohibition>

<prohibition id="COLON_LIMIT" severity="ADVISORY">
Maximum 1 colon in prose per document. Use sparingly.
</prohibition>`

var registerDefaults = map[string]string{
	"general":      "professional",
	"email":        "professional",
	"prd":          "explaining",
	"blog":         "casual",
	"cover-letter": "professional",
	"resume":       "professional",
	"slack":        "casual",
	"pitch":        "professional",
	"outreach":     "professional",
	"text":         "casual",
}

func formatCoachingCorrections(corrections []db.CorrectionRecord) string {
	if len(corrections) == 0 {
		return ""
	}

	var parts []string
	for i, c := range corrections {
		notes := strings.Join(c.Notes, "; ")

		var contextParts []string
		if c.PrefixContext != nil {
			contextParts = append(contextParts, "..."+*c.PrefixContext+" ")
		}
		contextParts = append(contextParts, "["+c.OriginalText+"]")
		if c.SuffixContext != nil {
			contextParts = append(contextParts, " "+*c.SuffixContext+"...")
		}
		context := strings.Join(contextParts, "")

		parts = append(parts, fmt.Sprintf(`%d. Flagged: "%s"
   Context: %s
   Why: %s`, i+1, c.OriginalText, context, notes))
	}
	return strings.Join(parts, "\n\n")
}

func formatCoachingRules(rules []db.WritingRule) string {
	if len(rules) == 0 {
		return ""
	}

	var lines []string
	for _, r := range rules {
		line := fmt.Sprintf("- [%s] %s", r.Severity, r.RuleText)
		if r.ExampleBefore != nil {
			line += fmt.Sprintf("\n  Bad: \"%s\"", *r.ExampleBefore)
		}
		if r.ExampleAfter != nil {
			line += fmt.Sprintf("\n  Good: \"%s\"", *r.ExampleAfter)
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func typeConstraint(writingType string) string {
	switch writingType {
	case "email", "outreach", "slack":
		constraint := "Keep it SHORT."
		if writingType == "email" {
			constraint += " Emails: 3-5 sentences max."
		}
		if writingType == "outreach" {
			constraint += " Outreach: 2-3 sentences max."
		}
		if writingType == "slack" {
			constraint += " Slack: 1-2 sentences."
		}
		return constraint
	case "resume":
		return "One bullet point only. Under 30 words."
	case "text":
		return "Keep it SHORT. Texts: 1-3 sentences max."
	default:
		return ""
	}
}

func GenerateCoachingPrompt(dbPath string, writingType string, register string) (string, error) {
	if register == "" {
		if def, ok := registerDefaults[writingType]; ok {
			register = def
		} else {
			register = "professional"
		}
	}

	d, err := db.OpenRead(dbPath)
	if err != nil {
		return "", err
	}
	defer d.Close()

	corrections, err := db.GetCorrectionsWithNotes(d, 30)
	if err != nil {
		return "", fmt.Errorf("loading corrections: %w", err)
	}

	rules, err := db.GetHighSignalRules(d, 30)
	if err != nil {
		return "", fmt.Errorf("loading rules: %w", err)
	}

	var sections []string

	sections = append(sections, `You are writing in a specific editorial voice. Three sources of guidance plus hard prohibitions:

1. CORRECTIONS — real examples of text that was flagged in previous writing, with context and reasoning. These are your strongest signal for what to avoid.
2. STRUCTURAL RULES — high-signal patterns that have been reinforced by multiple corrections. Follow these strictly.
3. PROHIBITIONS — the patterns below must never appear in any form.`)

	sections = append(sections, fmt.Sprintf("<prohibitions>\n%s\n</prohibitions>", prohibitionBlocks))

	if len(corrections) > 0 {
		sections = append(sections, fmt.Sprintf("<corrections>\n%s\n</corrections>", formatCoachingCorrections(corrections)))
	}

	if len(rules) > 0 {
		sections = append(sections, fmt.Sprintf(`<structural-rules>
These are high-confidence structural rules. Follow them strictly:
%s
</structural-rules>`, formatCoachingRules(rules)))
	}

	sections = append(sections, fmt.Sprintf("Writing type: %s", writingType))
	sections = append(sections, fmt.Sprintf("Register: %s", register))

	if tc := typeConstraint(writingType); tc != "" {
		sections = append(sections, tc)
	}

	sections = append(sections, "Output ONLY the prose — no commentary, critique, word counts, or meta-discussion. No bracketed coaching instructions like [One sentence about why...] or [Show the thinking here]. Short placeholder names like [Name] or [Company] are fine.")

	return strings.Join(sections, "\n\n"), nil
}
