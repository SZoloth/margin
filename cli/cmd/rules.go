package cmd

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/nicholasgasior/margin/cli/db"
	"github.com/nicholasgasior/margin/cli/output"
	"github.com/nicholasgasior/margin/cli/profile"
	"github.com/spf13/cobra"
)

var rulesCmd = &cobra.Command{
	Use:   "rules",
	Short: "Writing rule operations",
}

var rulesListCmd = &cobra.Command{
	Use:   "list",
	Short: "List writing rules",
	Run: func(cmd *cobra.Command, args []string) {
		wType, _ := cmd.Flags().GetString("type")
		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		var wtPtr *string
		if wType != "" {
			wtPtr = &wType
		}
		rules, err := db.GetWritingRules(d, wtPtr)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(rules, pretty)
	},
}

var rulesMarkdownCmd = &cobra.Command{
	Use:   "markdown",
	Short: "Get writing rules as markdown",
	Run: func(cmd *cobra.Command, args []string) {
		wType, _ := cmd.Flags().GetString("type")
		d, err := db.OpenRead(resolveDBPath())
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		var wtPtr *string
		if wType != "" {
			wtPtr = &wType
		}
		rules, err := db.GetWritingRules(d, wtPtr)
		if err != nil {
			output.ErrorE(err)
		}
		fmt.Print(profile.FormatRulesMarkdown(rules))
	},
}

var rulesCreateCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a writing rule",
	Run: func(cmd *cobra.Command, args []string) {
		text, _ := cmd.Flags().GetString("text")
		wType, _ := cmd.Flags().GetString("type")
		category, _ := cmd.Flags().GetString("category")
		severity, _ := cmd.Flags().GetString("severity")
		when, _ := cmd.Flags().GetString("when")
		why, _ := cmd.Flags().GetString("why")
		before, _ := cmd.Flags().GetString("before")
		after, _ := cmd.Flags().GetString("after")
		notes, _ := cmd.Flags().GetString("notes")
		source, _ := cmd.Flags().GetString("source")
		sigCount, _ := cmd.Flags().GetInt("signal-count")

		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		p := db.CreateRuleParams{
			WritingType: wType,
			Category:    category,
			RuleText:    text,
			Severity:    severity,
			Source:       source,
			SignalCount:  sigCount,
		}
		if when != "" {
			p.WhenToApply = &when
		}
		if why != "" {
			p.Why = &why
		}
		if before != "" {
			p.ExampleBefore = &before
		}
		if after != "" {
			p.ExampleAfter = &after
		}
		if notes != "" {
			p.Notes = &notes
		}

		rule, err := db.CreateWritingRule(d, p)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(rule, pretty)
		profile.ExportProfile(dbPath, "")
	},
}

var rulesUpdateCmd = &cobra.Command{
	Use:   "update <id>",
	Short: "Update a writing rule",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		p := db.UpdateRuleParams{ID: args[0]}
		if cmd.Flags().Changed("text") {
			v, _ := cmd.Flags().GetString("text")
			p.RuleText = &v
		}
		if cmd.Flags().Changed("severity") {
			v, _ := cmd.Flags().GetString("severity")
			p.Severity = &v
		}
		if cmd.Flags().Changed("type") {
			v, _ := cmd.Flags().GetString("type")
			p.WritingType = &v
		}
		if cmd.Flags().Changed("when") {
			v, _ := cmd.Flags().GetString("when")
			p.WhenToApply = &v
		}
		if cmd.Flags().Changed("why") {
			v, _ := cmd.Flags().GetString("why")
			p.Why = &v
		}
		if cmd.Flags().Changed("before") {
			v, _ := cmd.Flags().GetString("before")
			p.ExampleBefore = &v
		}
		if cmd.Flags().Changed("after") {
			v, _ := cmd.Flags().GetString("after")
			p.ExampleAfter = &v
		}
		if cmd.Flags().Changed("notes") {
			v, _ := cmd.Flags().GetString("notes")
			p.Notes = &v
		}
		if cmd.Flags().Changed("signal-count") {
			v, _ := cmd.Flags().GetInt("signal-count")
			p.SignalCount = &v
		}

		rule, err := db.UpdateWritingRule(d, p)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(rule, pretty)
		profile.ExportProfile(dbPath, "")
	},
}

var rulesDeleteCmd = &cobra.Command{
	Use:   "delete <id>",
	Short: "Delete a writing rule",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		if err := db.DeleteWritingRule(d, args[0]); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
		profile.ExportProfile(dbPath, "")
	},
}

var rulesAddCandidatesCmd = &cobra.Command{
	Use:   "add-candidates <json-file>",
	Short: "Insert synthesized candidate rules (review-gated) from a JSON file",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		raw, err := os.ReadFile(args[0])
		if err != nil {
			output.ErrorE(err)
		}
		parsed, err := profile.ParseCandidateRules(string(raw))
		if err != nil {
			output.ErrorE(err)
		}

		var candidates []db.CandidateRuleInput
		var dropped []string
		for _, c := range parsed {
			// A detection_pattern is kept only if it (a) compiles and (b) is
			// specific enough to not misfire on every document. A letterless
			// or ultra-short pattern (e.g. a bare "—") is the exact regression
			// guard v2 removed — drop it but keep the rule as a judgment rule.
			var pattern *string
			if c.DetectionPattern != "" {
				if _, rerr := regexp.Compile(c.DetectionPattern); rerr == nil && patternIsSpecific(c.DetectionPattern) {
					p := c.DetectionPattern
					pattern = &p
				} else {
					dropped = append(dropped, c.RuleText)
				}
			}
			candidates = append(candidates, db.CandidateRuleInput{
				Category:         c.Category,
				RuleText:         c.RuleText,
				WritingType:      c.WritingType,
				Severity:         c.Severity,
				DetectionPattern: pattern,
				ExampleBefore:    strPtrOrNil(c.ExampleBefore),
				ExampleAfter:     strPtrOrNil(c.ExampleAfter),
				SignalCount:      c.SignalCount,
				SourceHighlights: c.SourceHighlights,
			})
		}

		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()

		inserted, err := db.InsertCandidateRules(d, candidates)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]any{
			"inserted":         inserted,
			"submitted":        len(candidates),
			"patterns_dropped": len(dropped),
		}, pretty)
	},
}

var rulesCandidatesCmd = &cobra.Command{
	Use:   "candidates",
	Short: "List synthesis candidate rules awaiting review",
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		includeReviewed, _ := cmd.Flags().GetBool("all")
		d, err := db.OpenRead(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()
		rules, err := db.GetCandidateRules(d, includeReviewed)
		if err != nil {
			output.ErrorE(err)
		}
		output.JSON(rules, pretty)
	},
}

var rulesAcceptCmd = &cobra.Command{
	Use:   "accept <id>",
	Short: "Accept a synthesis candidate into the active corpus",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()
		if err := db.AcceptCandidateRule(d, args[0]); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
		profile.ExportProfile(dbPath, "")
	},
}

var rulesRejectCmd = &cobra.Command{
	Use:   "reject <id>",
	Short: "Reject (delete) an unreviewed synthesis candidate",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		dbPath := resolveDBPath()
		d, err := db.OpenWrite(dbPath)
		if err != nil {
			output.ErrorE(err)
		}
		defer d.Close()
		if err := db.RejectCandidateRule(d, args[0]); err != nil {
			output.ErrorE(err)
		}
		output.JSON(map[string]bool{"success": true}, pretty)
	},
}

func strPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// patternIsSpecific rejects detection patterns that would misfire broadly:
// they must contain at least one letter and, once regex metacharacters are
// stripped, at least 3 literal characters. A bare "—" or "." fails both.
func patternIsSpecific(p string) bool {
	hasLetter := false
	for _, r := range p {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			hasLetter = true
			break
		}
	}
	if !hasLetter {
		return false
	}
	literal := regexp.MustCompile(`[\\^$.*+?()\[\]{}|—–]`).ReplaceAllString(p, "")
	return len(strings.TrimSpace(literal)) >= 3
}

func init() {
	rulesListCmd.Flags().String("type", "", "filter by writing type")
	rulesMarkdownCmd.Flags().String("type", "", "filter by writing type")
	rulesCandidatesCmd.Flags().Bool("all", false, "include already-reviewed candidates")

	rulesCreateCmd.Flags().String("text", "", "rule text")
	rulesCreateCmd.Flags().String("type", "", "writing type")
	rulesCreateCmd.Flags().String("category", "", "category")
	rulesCreateCmd.Flags().String("severity", "should-fix", "severity")
	rulesCreateCmd.Flags().String("when", "", "when to apply")
	rulesCreateCmd.Flags().String("why", "", "why this rule exists")
	rulesCreateCmd.Flags().String("before", "", "example before")
	rulesCreateCmd.Flags().String("after", "", "example after")
	rulesCreateCmd.Flags().String("notes", "", "notes")
	rulesCreateCmd.Flags().String("source", "manual", "source")
	rulesCreateCmd.Flags().Int("signal-count", 1, "signal count")
	rulesCreateCmd.MarkFlagRequired("text")
	rulesCreateCmd.MarkFlagRequired("type")
	rulesCreateCmd.MarkFlagRequired("category")

	rulesUpdateCmd.Flags().String("text", "", "rule text")
	rulesUpdateCmd.Flags().String("severity", "", "severity")
	rulesUpdateCmd.Flags().String("type", "", "writing type")
	rulesUpdateCmd.Flags().String("when", "", "when to apply")
	rulesUpdateCmd.Flags().String("why", "", "why")
	rulesUpdateCmd.Flags().String("before", "", "example before")
	rulesUpdateCmd.Flags().String("after", "", "example after")
	rulesUpdateCmd.Flags().String("notes", "", "notes")
	rulesUpdateCmd.Flags().Int("signal-count", 0, "signal count")

	rulesCmd.AddCommand(rulesListCmd, rulesMarkdownCmd, rulesCreateCmd, rulesUpdateCmd, rulesDeleteCmd,
		rulesAddCandidatesCmd, rulesCandidatesCmd, rulesAcceptCmd, rulesRejectCmd)
	rootCmd.AddCommand(rulesCmd)
}
