package profile

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/nicholasgasior/margin/cli/db"
)

func TestExportCodexWritesProfileAndPreservesUserInstructions(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.Mkdir(filepath.Join(home, ".codex"), 0755); err != nil {
		t.Fatal(err)
	}
	agentsPath := filepath.Join(home, ".codex", "AGENTS.md")
	if err := os.WriteFile(agentsPath, []byte("# User approval gates\nKeep me.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	d := setupCoachingDB(t)
	defer d.Close()
	insertTestRule(t, d, "approved", "general", "must-fix", 1, nil, nil)
	insertTestRule(t, d, "unreviewed", "general", "must-fix", 1, nil, nil)
	if _, err := d.Exec("UPDATE writing_rules SET source = 'synthesis-candidate' WHERE id = 'unreviewed'"); err != nil {
		t.Fatal(err)
	}
	dbPath := filepath.Join(home, "rules.db")
	if _, err := d.Exec("VACUUM INTO ?", dbPath); err != nil {
		t.Fatal(err)
	}
	if err := ExportCodex(dbPath); err != nil {
		t.Fatal(err)
	}
	profile, err := os.ReadFile(filepath.Join(home, ".margin", "writing-rules.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(profile), "Test rule: approved") {
		t.Fatal("full profile lost approved rule")
	}
	if strings.Contains(string(profile), "Test rule: unreviewed") {
		t.Fatal("unreviewed candidate must not be exported")
	}
	agents, err := os.ReadFile(agentsPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(agents), "Keep me.") || strings.Contains(string(agents), "Test rule: approved") {
		t.Fatal("global export must preserve user content and defer rule bodies")
	}
	if err := ExportCodex(dbPath); err != nil {
		t.Fatal(err)
	}
	again, err := os.ReadFile(agentsPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(again) != string(agents) {
		t.Fatal("re-export must be idempotent")
	}
	for _, target := range []string{"codex", ""} {
		if err := ExportProfile(dbPath, target); err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(agentsPath)
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != string(agents) {
			t.Fatalf("profile target %q must use the same compact router", target)
		}
		full, err := os.ReadFile(filepath.Join(home, ".margin", "writing-rules.md"))
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(full), "Test rule: unreviewed") {
			t.Fatalf("profile target %q leaked candidate", target)
		}
	}
}

func TestCodexGlobalPromptIsBoundedAndRoutesWriting(t *testing.T) {
	rules := []db.WritingRule{{RuleText: strings.Repeat("private editorial example ", 5000)}}
	md := FormatCodexAgentsMD(rules, nil)
	if len(md) > 2400 || strings.Contains(md, "private editorial example") {
		t.Fatal("global instructions must not embed the growing writing profile")
	}
	for _, required := range []string{"~/.margin/writing-rules.md", "casual", "professional", "approval", "facts", beginMarker, endMarker} {
		if !strings.Contains(md, required) {
			t.Errorf("missing routing/invariant %q", required)
		}
	}
}

func TestProfilePreservesInstructionInsteadOfQuotingItAsAWord(t *testing.T) {
	rule := "Never use 'genuinely' as filler; preserve direct quotations."
	md := FormatProfileMarkdown([]db.WritingRule{{Category: "kill-words", RuleText: rule, WritingType: "general", Severity: "must-fix"}}, nil)
	if !strings.Contains(md, rule) || strings.Contains(md, "Do not use the word \"Never use") {
		t.Fatal("profile must preserve the instruction, not wrap it as a banned word")
	}
}
