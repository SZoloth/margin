package db

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

type WritingRule struct {
	ID            string  `json:"id"`
	WritingType   string  `json:"writingType"`
	Category      string  `json:"category"`
	RuleText      string  `json:"ruleText"`
	WhenToApply   *string `json:"whenToApply"`
	Why           *string `json:"why"`
	Severity      string  `json:"severity"`
	ExampleBefore *string `json:"exampleBefore"`
	ExampleAfter  *string `json:"exampleAfter"`
	Source        string  `json:"source"`
	SignalCount   int     `json:"signalCount"`
	Notes         *string `json:"notes"`
	CreatedAt     int64   `json:"createdAt"`
	UpdatedAt     int64   `json:"updatedAt"`
}

var (
	ValidSeverities  = []string{"must-fix", "should-fix", "nice-to-fix"}
	ValidWritingTypes = []string{
		"general", "email", "prd", "blog", "cover-letter",
		"resume", "slack", "pitch", "outreach",
	}
	TypeLabels = map[string]string{
		"general":      "General",
		"email":        "Email",
		"prd":          "PRD",
		"blog":         "Blog / essay",
		"cover-letter": "Cover letter",
		"resume":       "Resume",
		"slack":        "Slack",
		"pitch":        "Pitch",
		"outreach":     "Outreach",
	}
)

func isValidSeverity(s string) bool {
	for _, v := range ValidSeverities {
		if v == s {
			return true
		}
	}
	return false
}

func isValidWritingType(s string) bool {
	for _, v := range ValidWritingTypes {
		if v == s {
			return true
		}
	}
	return false
}

func GetWritingRules(d *sql.DB, writingType *string) ([]WritingRule, error) {
	var rows *sql.Rows
	var err error

	if writingType != nil {
		rows, err = d.Query(
			`SELECT id, writing_type, category, rule_text, when_to_apply,
			        why, severity, example_before, example_after, source,
			        signal_count, notes, created_at, updated_at
			 FROM writing_rules WHERE writing_type = ?
			 ORDER BY signal_count DESC, created_at DESC`, *writingType)
	} else {
		rows, err = d.Query(
			`SELECT id, writing_type, category, rule_text, when_to_apply,
			        why, severity, example_before, example_after, source,
			        signal_count, notes, created_at, updated_at
			 FROM writing_rules
			 ORDER BY writing_type, signal_count DESC, created_at DESC`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []WritingRule
	for rows.Next() {
		var r WritingRule
		if err := rows.Scan(&r.ID, &r.WritingType, &r.Category, &r.RuleText,
			&r.WhenToApply, &r.Why, &r.Severity, &r.ExampleBefore, &r.ExampleAfter,
			&r.Source, &r.SignalCount, &r.Notes, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	if rules == nil {
		rules = []WritingRule{}
	}
	return rules, nil
}

type CreateRuleParams struct {
	WritingType   string
	Category      string
	RuleText      string
	Severity      string
	WhenToApply   *string
	Why           *string
	ExampleBefore *string
	ExampleAfter  *string
	Notes         *string
	Source        string
	SignalCount   int
}

func CreateWritingRule(d *sql.DB, p CreateRuleParams) (*WritingRule, error) {
	if !isValidSeverity(p.Severity) {
		return nil, fmt.Errorf("Invalid severity %q. Allowed: %s", p.Severity, strings.Join(ValidSeverities, ", "))
	}
	if !isValidWritingType(p.WritingType) {
		return nil, fmt.Errorf("Invalid writing_type %q. Allowed: %s", p.WritingType, strings.Join(ValidWritingTypes, ", "))
	}
	if p.Source == "" {
		p.Source = "manual"
	}
	if p.SignalCount < 1 {
		p.SignalCount = 1
	}

	id := uuid.New().String()
	now := NowMillis()

	_, err := d.Exec(
		`INSERT INTO writing_rules
		   (id, writing_type, category, rule_text, when_to_apply, why, severity,
		    example_before, example_after, source, signal_count, notes, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, p.WritingType, p.Category, p.RuleText, p.WhenToApply, p.Why, p.Severity,
		p.ExampleBefore, p.ExampleAfter, p.Source, p.SignalCount, p.Notes, now, now)
	if err != nil {
		return nil, err
	}

	return &WritingRule{
		ID: id, WritingType: p.WritingType, Category: p.Category, RuleText: p.RuleText,
		WhenToApply: p.WhenToApply, Why: p.Why, Severity: p.Severity,
		ExampleBefore: p.ExampleBefore, ExampleAfter: p.ExampleAfter,
		Source: p.Source, SignalCount: p.SignalCount, Notes: p.Notes,
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

type UpdateRuleParams struct {
	ID            string
	RuleText      *string
	Severity      *string
	WhenToApply   *string
	Why           *string
	ExampleBefore *string
	ExampleAfter  *string
	Notes         *string
	WritingType   *string
	SignalCount   *int // Fixes MCP gap
}

func UpdateWritingRule(d *sql.DB, p UpdateRuleParams) (*WritingRule, error) {
	var existingID string
	err := d.QueryRow("SELECT id FROM writing_rules WHERE id = ?", p.ID).Scan(&existingID)
	if err != nil {
		return nil, fmt.Errorf("Writing rule not found: %s", p.ID)
	}

	if p.Severity != nil && !isValidSeverity(*p.Severity) {
		return nil, fmt.Errorf("Invalid severity %q. Allowed: %s", *p.Severity, strings.Join(ValidSeverities, ", "))
	}
	if p.WritingType != nil && !isValidWritingType(*p.WritingType) {
		return nil, fmt.Errorf("Invalid writing_type %q. Allowed: %s", *p.WritingType, strings.Join(ValidWritingTypes, ", "))
	}

	var sets []string
	var vals []any

	if p.RuleText != nil {
		sets = append(sets, "rule_text = ?")
		vals = append(vals, *p.RuleText)
	}
	if p.Severity != nil {
		sets = append(sets, "severity = ?")
		vals = append(vals, *p.Severity)
	}
	if p.WhenToApply != nil {
		sets = append(sets, "when_to_apply = ?")
		vals = append(vals, *p.WhenToApply)
	}
	if p.Why != nil {
		sets = append(sets, "why = ?")
		vals = append(vals, *p.Why)
	}
	if p.ExampleBefore != nil {
		sets = append(sets, "example_before = ?")
		vals = append(vals, *p.ExampleBefore)
	}
	if p.ExampleAfter != nil {
		sets = append(sets, "example_after = ?")
		vals = append(vals, *p.ExampleAfter)
	}
	if p.Notes != nil {
		sets = append(sets, "notes = ?")
		vals = append(vals, *p.Notes)
	}
	if p.WritingType != nil {
		sets = append(sets, "writing_type = ?")
		vals = append(vals, *p.WritingType)
	}
	if p.SignalCount != nil {
		sets = append(sets, "signal_count = ?")
		vals = append(vals, *p.SignalCount)
	}

	if len(sets) == 0 {
		return nil, fmt.Errorf("No fields to update")
	}

	now := NowMillis()
	sets = append(sets, "updated_at = ?")
	vals = append(vals, now)
	vals = append(vals, p.ID)

	_, err = d.Exec("UPDATE writing_rules SET "+strings.Join(sets, ", ")+" WHERE id = ?", vals...)
	if err != nil {
		return nil, err
	}

	// Re-read
	var r WritingRule
	err = d.QueryRow(
		`SELECT id, writing_type, category, rule_text, when_to_apply,
		        why, severity, example_before, example_after, source,
		        signal_count, notes, created_at, updated_at
		 FROM writing_rules WHERE id = ?`, p.ID).Scan(
		&r.ID, &r.WritingType, &r.Category, &r.RuleText,
		&r.WhenToApply, &r.Why, &r.Severity, &r.ExampleBefore, &r.ExampleAfter,
		&r.Source, &r.SignalCount, &r.Notes, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func DeleteWritingRule(d *sql.DB, ruleID string) error {
	result, err := d.Exec("DELETE FROM writing_rules WHERE id = ?", ruleID)
	if err != nil {
		return err
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return fmt.Errorf("Writing rule not found: %s", ruleID)
	}
	return nil
}
