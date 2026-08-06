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
	// DetectionPattern is the ONLY way a rule contributes to the mechanical
	// guard hook: a Python-re regex, validated at export. example_before is
	// illustrative and never executable.
	DetectionPattern *string `json:"detectionPattern"`
	// ReviewedAt gates synthesis candidates: a rule with
	// source='synthesis-candidate' and reviewed_at IS NULL is unreviewed and
	// must be excluded from every export path (coaching + guard) until Sam
	// accepts it.
	ReviewedAt *int64 `json:"reviewedAt"`
}

// IsUnreviewedCandidate reports whether this rule is a synthesis candidate
// awaiting Sam's review — such rules never flow into coaching or the guard.
func (r WritingRule) IsUnreviewedCandidate() bool {
	return r.Source == "synthesis-candidate" && r.ReviewedAt == nil
}

// unreviewedCandidateFilter is the SQL predicate excluding unreviewed
// synthesis candidates from export selections.
const unreviewedCandidateFilter = `NOT (source = 'synthesis-candidate' AND reviewed_at IS NULL)`

var (
	ValidSeverities  = []string{"must-fix", "should-fix", "nice-to-fix"}
	ValidWritingTypes = []string{
		"general", "email", "prd", "blog", "cover-letter",
		"resume", "slack", "pitch", "outreach", "text",
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
		"text":         "Text message",
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
			        signal_count, notes, created_at, updated_at, detection_pattern, reviewed_at
			 FROM writing_rules WHERE writing_type = ?
			 ORDER BY signal_count DESC, created_at DESC`, *writingType)
	} else {
		rows, err = d.Query(
			`SELECT id, writing_type, category, rule_text, when_to_apply,
			        why, severity, example_before, example_after, source,
			        signal_count, notes, created_at, updated_at, detection_pattern, reviewed_at
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
			&r.Source, &r.SignalCount, &r.Notes, &r.CreatedAt, &r.UpdatedAt, &r.DetectionPattern, &r.ReviewedAt); err != nil {
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

// GetHighSignalRules returns the strongest rules for coaching context.
// writingType scopes results to that type plus general rules; pass "" for
// no scoping. Prohibition rules are excluded — they render in their own
// section of the coaching prompt.
func GetHighSignalRules(d *sql.DB, limit int, writingType string) ([]WritingRule, error) {
	if limit < 1 {
		limit = 30
	}

	rows, err := d.Query(
		`SELECT id, writing_type, category, rule_text, when_to_apply,
		        why, severity, example_before, example_after, source,
		        signal_count, notes, created_at, updated_at
		 FROM writing_rules
		 WHERE (signal_count >= 2 OR severity = 'must-fix')
		   AND category != 'prohibition'
		   AND ` + unreviewedCandidateFilter + `
		   AND (?1 = '' OR writing_type = 'general' OR writing_type = ?1)
		 ORDER BY signal_count DESC
		 LIMIT ?2`, writingType, limit)
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

// GetProhibitionRules returns seeded prohibition rules (category='prohibition')
// for the coaching prompt's <prohibitions> section, hardest first.
func GetProhibitionRules(d *sql.DB) ([]WritingRule, error) {
	rows, err := d.Query(
		`SELECT id, writing_type, category, rule_text, when_to_apply,
		        why, severity, example_before, example_after, source,
		        signal_count, notes, created_at, updated_at
		 FROM writing_rules
		 WHERE category = 'prohibition'
		   AND ` + unreviewedCandidateFilter + `
		 ORDER BY CASE severity WHEN 'must-fix' THEN 0 ELSE 1 END, created_at`)
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

// CandidateRuleInput is one synthesized rule awaiting review. It maps the
// synthesis JSON contract onto the writing_rules columns.
type CandidateRuleInput struct {
	Category         string
	RuleText         string
	WritingType      string
	Severity         string
	DetectionPattern *string
	ExampleBefore    *string
	ExampleAfter     *string
	SignalCount      int
	SourceHighlights []string // stored in notes as "synthesized-from:<ids>"
}

// InsertCandidateRules writes synthesized rules as REVIEW-GATED candidates:
// source='synthesis-candidate', reviewed_at=NULL. They are excluded from
// every export path until AcceptCandidateRule sets reviewed_at. Detection
// patterns are validated by the caller; an invalid one should be dropped
// before calling. Returns the count inserted. Idempotent-ish via the
// UNIQUE(writing_type, category, rule_text) constraint: dupes are skipped.
func InsertCandidateRules(d *sql.DB, candidates []CandidateRuleInput) (int, error) {
	tx, err := d.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	now := NowMillis()
	inserted := 0
	for _, c := range candidates {
		if !isValidSeverity(c.Severity) {
			c.Severity = "should-fix"
		}
		if !isValidWritingType(c.WritingType) {
			c.WritingType = "general"
		}
		sc := c.SignalCount
		if sc < 1 {
			sc = 1
		}
		var notes *string
		if len(c.SourceHighlights) > 0 {
			n := "synthesized-from:" + strings.Join(c.SourceHighlights, ",")
			notes = &n
		}
		res, err := tx.Exec(
			`INSERT OR IGNORE INTO writing_rules
			   (id, writing_type, category, rule_text, severity, detection_pattern,
			    example_before, example_after, notes, source, signal_count,
			    created_at, updated_at, reviewed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthesis-candidate', ?, ?, ?, NULL)`,
			uuid.New().String(), c.WritingType, c.Category, c.RuleText, c.Severity,
			c.DetectionPattern, c.ExampleBefore, c.ExampleAfter, notes, sc, now, now)
		if err != nil {
			return inserted, err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			inserted++
		}
	}
	if err := tx.Commit(); err != nil {
		return inserted, err
	}
	return inserted, nil
}

// GetCandidateRules returns synthesis candidates awaiting review (or all
// candidates if includeReviewed), newest first.
func GetCandidateRules(d *sql.DB, includeReviewed bool) ([]WritingRule, error) {
	q := `SELECT id, writing_type, category, rule_text, when_to_apply,
	             why, severity, example_before, example_after, source,
	             signal_count, notes, created_at, updated_at, detection_pattern, reviewed_at
	      FROM writing_rules
	      WHERE source = 'synthesis-candidate'`
	if !includeReviewed {
		q += ` AND reviewed_at IS NULL`
	}
	q += ` ORDER BY signal_count DESC, created_at DESC`

	rows, err := d.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []WritingRule
	for rows.Next() {
		var r WritingRule
		if err := rows.Scan(&r.ID, &r.WritingType, &r.Category, &r.RuleText,
			&r.WhenToApply, &r.Why, &r.Severity, &r.ExampleBefore, &r.ExampleAfter,
			&r.Source, &r.SignalCount, &r.Notes, &r.CreatedAt, &r.UpdatedAt,
			&r.DetectionPattern, &r.ReviewedAt); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	if rules == nil {
		rules = []WritingRule{}
	}
	return rules, nil
}

// AcceptCandidateRule promotes a candidate into the active corpus: sets
// reviewed_at, re-sources it to 'synthesis', and marks the source
// corrections (from the "synthesized-from:<ids>" note) as synthesized so
// they leave the synthesis queue. Rejected-candidate corrections stay
// queued for a future pass.
func AcceptCandidateRule(d *sql.DB, ruleID string) error {
	now := NowMillis()

	// Read the rule's source-highlight provenance before promoting it.
	var notes sql.NullString
	err := d.QueryRow(
		`SELECT notes FROM writing_rules WHERE id = ? AND source = 'synthesis-candidate'`, ruleID).Scan(&notes)
	if err == sql.ErrNoRows {
		return fmt.Errorf("candidate rule not found: %s", ruleID)
	}
	if err != nil {
		return err
	}

	res, err := d.Exec(
		`UPDATE writing_rules SET reviewed_at = ?, source = 'synthesis', updated_at = ?
		 WHERE id = ? AND source = 'synthesis-candidate'`, now, now, ruleID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("candidate rule not found: %s", ruleID)
	}

	// Mark the source corrections synthesized so they leave the queue.
	if notes.Valid && strings.HasPrefix(notes.String, "synthesized-from:") {
		ids := strings.Split(strings.TrimPrefix(notes.String, "synthesized-from:"), ",")
		for _, id := range ids {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			_, _ = d.Exec(
				`UPDATE corrections SET synthesized_at = ? WHERE highlight_id = ? AND synthesized_at IS NULL`,
				now, id)
		}
	}
	return nil
}

// RejectCandidateRule deletes a candidate outright.
func RejectCandidateRule(d *sql.DB, ruleID string) error {
	res, err := d.Exec(
		`DELETE FROM writing_rules WHERE id = ? AND source = 'synthesis-candidate' AND reviewed_at IS NULL`, ruleID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("unreviewed candidate rule not found: %s", ruleID)
	}
	return nil
}
