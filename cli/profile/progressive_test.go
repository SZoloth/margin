package profile

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/nicholasgasior/margin/cli/db"
)

func progressiveFixture() ([]db.WritingRule, []db.CorrectionRecord) {
	rules := []db.WritingRule{
		{ID: "1", WritingType: "general", Category: "kill-words", RuleText: "Never write 'delve'", Severity: "must-fix", SignalCount: 4},
		{ID: "2", WritingType: "general", Category: "editorial", RuleText: "Prefer short paragraphs", Severity: "should-fix", SignalCount: 2},
		{ID: "3", WritingType: "email", Category: "tone", RuleText: "Ask in the first line", Severity: "must-fix", SignalCount: 3,
			WhenToApply: ptr("Requests"), ExampleBefore: ptr("I hope you're well."), ExampleAfter: ptr("Can you review this by Friday?")},
		{ID: "4", WritingType: "email", Category: "structure", RuleText: "Sign off with first name only", Severity: "nice-to-fix", SignalCount: 1},
		{ID: "5", WritingType: "general", Category: "voice-calibration", RuleText: "Average sentence is 14 words", Severity: "must-fix", SignalCount: 9},
	}
	email := "email"
	corrective := "corrective"
	positive := "positive"
	corrections := []db.CorrectionRecord{
		{OriginalText: "Per my last email", Notes: []string{"passive aggressive"}, Polarity: &corrective, WritingType: &email},
		{OriginalText: "Plain and warm sentence", Notes: []string{"more like this"}, Polarity: &positive},
	}
	return rules, corrections
}

func TestProfileFilesKeepEntrySmallAndRouteByType(t *testing.T) {
	rules, corrections := progressiveFixture()
	files := FormatProfileFiles(rules, corrections)

	entry := files[ProfileEntryFile]
	for _, want := range []string{
		"# Writing Profile",
		"Average sentence is 14 words",
		"## Hard rules",
		"- [ ] **Never write 'delve'**",
		"## Preferences",
		"- **Prefer short paragraphs**",
		"~/.margin/writing-rules/email.md",
		"~/.margin/writing-rules/general.md",
	} {
		if !strings.Contains(entry, want) {
			t.Errorf("entry file missing %q\n\n%s", want, entry)
		}
	}
	for _, leak := range []string{"Ask in the first line", "Per my last email", "Plain and warm sentence"} {
		if strings.Contains(entry, leak) {
			t.Errorf("entry file should leave %q to a type file", leak)
		}
	}

	emailFile := files[filepath.Join(ProfileTypeDir, "email.md")]
	for _, want := range []string{
		"# Email",
		"- [ ] **Ask in the first line**",
		"When: Requests",
		`Before: "I hope you're well."`,
		"- **Sign off with first name only**",
		"**Per my last email** → passive aggressive",
	} {
		if !strings.Contains(emailFile, want) {
			t.Errorf("email file missing %q\n\n%s", want, emailFile)
		}
	}

	generalFile := files[filepath.Join(ProfileTypeDir, "general.md")]
	if !strings.Contains(generalFile, "> Plain and warm sentence") {
		t.Errorf("untyped samples belong in general.md\n\n%s", generalFile)
	}

	for name, body := range files {
		for _, tag := range []string{"[must-fix]", "[should-fix]", "[nice-to-fix]"} {
			if strings.Contains(body, tag) {
				t.Errorf("%s still carries the database tag %s", name, tag)
			}
		}
	}
}

func TestProfileEntryExplainsModesAndScope(t *testing.T) {
	rules, corrections := progressiveFixture()
	entry := FormatProfileFiles(rules, corrections)[ProfileEntryFile]
	for _, want := range []string{
		"When drafting",
		"When reviewing",
		"When editing someone else's text",
		"only to the passages you change",
		"breaking one is always a mistake",
	} {
		if !strings.Contains(entry, want) {
			t.Errorf("entry file missing guidance %q", want)
		}
	}
}

func TestFormatProfileMarkdownIsTheEntryFile(t *testing.T) {
	rules, corrections := progressiveFixture()
	if FormatProfileMarkdown(rules, corrections) != FormatProfileFiles(rules, corrections)[ProfileEntryFile] {
		t.Fatal("FormatProfileMarkdown must return the entry file")
	}
}

func TestExportProfileWritesTypeFilesAndPrunesStaleOnes(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	typeDir := filepath.Join(home, ".margin", "writing-rules")
	if err := os.MkdirAll(typeDir, 0755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(typeDir, "pitch.md"), []byte("stale"), 0644)
	os.WriteFile(filepath.Join(typeDir, "keep.txt"), []byte("not ours"), 0644)

	d := setupCoachingDB(t)
	defer d.Close()
	insertTestRule(t, d, "general-rule", "general", "must-fix", 1, nil, nil)
	insertTestRule(t, d, "email-rule", "email", "should-fix", 1, nil, nil)
	dbPath := filepath.Join(home, "rules.db")
	if _, err := d.Exec("VACUUM INTO ?", dbPath); err != nil {
		t.Fatal(err)
	}

	if err := ExportProfile(dbPath, "markdown"); err != nil {
		t.Fatal(err)
	}

	emailFile, err := os.ReadFile(filepath.Join(typeDir, "email.md"))
	if err != nil || !strings.Contains(string(emailFile), "Test rule: email-rule") {
		t.Fatalf("email.md not written: %v", err)
	}
	if _, err := os.Stat(filepath.Join(typeDir, "pitch.md")); !os.IsNotExist(err) {
		t.Fatal("a type file with no rules left must be removed")
	}
	if _, err := os.Stat(filepath.Join(typeDir, "keep.txt")); err != nil {
		t.Fatal("export must only remove the .md files it owns")
	}
	entry, _ := os.ReadFile(filepath.Join(home, ".margin", "writing-rules.md"))
	if strings.Contains(string(entry), "Test rule: email-rule") {
		t.Fatal("entry file must not carry email rules")
	}
}

func TestTypeFileNameRejectsPathTricks(t *testing.T) {
	for in, want := range map[string]string{
		"email":          "email.md",
		"cover-letter":   "cover-letter.md",
		"../../etc/x":    "etc-x.md",
		"Email (Hiring)": "email-hiring.md",
	} {
		if got := typeFileName(in); got != want {
			t.Errorf("typeFileName(%q) = %q, want %q", in, got, want)
		}
	}
}
