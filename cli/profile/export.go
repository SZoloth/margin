package profile

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/nicholasgasior/margin/cli/db"
)

// truncateUnicode truncates to max code points (not bytes).
func truncateUnicode(text string, max int) string {
	count := utf8.RuneCountInString(text)
	if count <= max {
		return text
	}
	runes := []rune(text)
	return string(runes[:max]) + "…"
}

func categoryLabel(cat string) string {
	words := strings.Split(strings.ReplaceAll(cat, "-", " "), " ")
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// ProfileEntryFile is the profile agents read first, relative to ~/.margin.
const ProfileEntryFile = "writing-rules.md"

// ProfileTypeDir holds one file per writing type, relative to ~/.margin.
// The entry file routes to these so an agent loads only the type it is
// writing, instead of every rule Sam has ever made.
const ProfileTypeDir = "writing-rules"

// generalExamplesType collects samples and corrections with no writing type.
const generalExamplesType = "general"

func isHardRule(r db.WritingRule) bool { return r.Severity == "must-fix" }

func typeLabel(wt string) string {
	if label := db.TypeLabels[wt]; label != "" {
		return label
	}
	return wt
}

// typeFileName turns a writing type into a safe file name inside ProfileTypeDir.
func typeFileName(wt string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(wt) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if !dash && b.Len() > 0 {
			b.WriteRune('-')
			dash = true
		}
	}
	name := strings.TrimRight(b.String(), "-")
	if name == "" {
		name = "untitled"
	}
	return name + ".md"
}

// formatRule renders one rule. Hard rules are checklist items; preferences
// are plain bullets. The database's three severities never reach the agent.
func formatRule(rule db.WritingRule) []string {
	marker := "- "
	if isHardRule(rule) {
		marker = "- [ ] "
	}
	lines := []string{fmt.Sprintf("%s**%s** _(%s)_", marker, rule.RuleText, categoryLabel(rule.Category))}
	if rule.WhenToApply != nil {
		lines = append(lines, fmt.Sprintf("  - When: %s", *rule.WhenToApply))
	}
	if rule.Why != nil {
		lines = append(lines, fmt.Sprintf("  - Why: %s", *rule.Why))
	}
	// A heading pattern's example_before is the guard's regex, not prose.
	if rule.ExampleBefore != nil && rule.Category != "heading-patterns" {
		lines = append(lines, fmt.Sprintf(`  - Before: "%s"`, *rule.ExampleBefore))
	}
	if rule.ExampleAfter != nil {
		lines = append(lines, fmt.Sprintf(`  - After: "%s"`, *rule.ExampleAfter))
	}
	if rule.Notes != nil {
		lines = append(lines, fmt.Sprintf("  - Notes: %s", strings.ReplaceAll(*rule.Notes, "\n", "; ")))
	}
	lines = append(lines, fmt.Sprintf("  - Seen %d time(s)", rule.SignalCount))
	return lines
}

// formatStrictnessSections splits rules into Hard rules and Preferences
// under headings of the given level.
func formatStrictnessSections(rules []db.WritingRule, heading string) []string {
	var hard, prefs []db.WritingRule
	for _, r := range rules {
		if isHardRule(r) {
			hard = append(hard, r)
		} else {
			prefs = append(prefs, r)
		}
	}
	var lines []string
	if len(hard) > 0 {
		lines = append(lines, "", heading+" Hard rules", "", "_Breaking one is always a mistake. Check every item before handing work over._", "")
		for _, r := range hard {
			lines = append(lines, formatRule(r)...)
		}
	}
	if len(prefs) > 0 {
		lines = append(lines, "", heading+" Preferences", "", "_Follow these by default. The request, the reader, or the source can override them._", "")
		for _, r := range prefs {
			lines = append(lines, formatRule(r)...)
		}
	}
	return lines
}

// sortedTypes returns writing types with "general" first, then alphabetical.
func sortedTypes[T any](groups map[string][]T) []string {
	keys := make([]string, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i] == "general" {
			return true
		}
		if keys[j] == "general" {
			return false
		}
		return keys[i] < keys[j]
	})
	return keys
}

// FormatRulesMarkdown generates rules-only markdown.
func FormatRulesMarkdown(rules []db.WritingRule) string {
	var lines []string
	lines = append(lines, "# Writing Rules", "")
	lines = append(lines, "_For AI agents: apply rules matching the writing type. General rules always apply._")
	lines = append(lines, formatRulesSection(rules)...)
	lines = append(lines, "")
	return strings.Join(lines, "\n")
}

func formatRulesSection(rules []db.WritingRule) []string {
	groups := make(map[string][]db.WritingRule)
	for _, r := range rules {
		groups[r.WritingType] = append(groups[r.WritingType], r)
	}
	var lines []string
	for _, wt := range sortedTypes(groups) {
		lines = append(lines, "", fmt.Sprintf("## %s", typeLabel(wt)))
		lines = append(lines, formatStrictnessSections(groups[wt], "###")...)
	}
	return lines
}

func formatExamples(corrections []db.CorrectionRecord) []string {
	var positive, corrective, unclassified []db.CorrectionRecord
	for _, c := range corrections {
		switch {
		case c.Polarity != nil && *c.Polarity == "positive":
			positive = append(positive, c)
		case c.Polarity != nil && *c.Polarity == "corrective":
			corrective = append(corrective, c)
		default:
			unclassified = append(unclassified, c)
		}
	}

	var lines []string
	if len(positive) > 0 {
		lines = append(lines, "", "## Writing Samples", "")
		lines = append(lines, "_Patterns to emulate. Do more of this._")
		for _, c := range positive {
			snippet := truncateUnicode(c.OriginalText, 200)
			lines = append(lines, "", fmt.Sprintf("> %s", strings.ReplaceAll(snippet, "\n", "\n> ")))
			if len(c.Notes) > 0 {
				lines = append(lines, fmt.Sprintf("— %s", strings.Join(c.Notes, "; ")))
			}
		}
	}
	if len(corrective) > 0 {
		lines = append(lines, "", "## Corrections", "")
		lines = append(lines, "_Patterns to avoid. Don't do this._")
		for _, c := range corrective {
			snippet := truncateUnicode(c.OriginalText, 200)
			lines = append(lines, "", fmt.Sprintf("- **%s** → %s", snippet, strings.Join(c.Notes, "; ")))
		}
	}
	if len(unclassified) > 0 {
		lines = append(lines, "", "## Unclassified", "")
		lines = append(lines, "_These annotations haven't been tagged as positive or corrective yet._")
		for _, c := range unclassified {
			snippet := truncateUnicode(c.OriginalText, 120)
			note := "flagged"
			if len(c.Notes) > 0 {
				note = strings.Join(c.Notes, "; ")
			}
			lines = append(lines, "", fmt.Sprintf("- %s → %s", snippet, note))
		}
	}
	return lines
}

// profileHowTo tells the agent how to load and apply the profile. Kept
// separate so the entry file reads as instructions first, rules second.
var profileHowTo = []string{
	"## How to use this profile",
	"",
	"1. Read this file before you draft, edit, or review prose. Its rules apply to every kind of writing.",
	"2. Then open the file for the writing type you're working on, listed under Writing types below. Skip the others.",
	"3. Hard rules are a checklist: breaking one is always a mistake. Preferences are defaults: the request, the reader, or the source can override them.",
	"",
	"- **When drafting:** write to the hard rules and preferences, then check the draft against every hard rule before handing it over.",
	"- **When reviewing:** quote each hard-rule break and call it a must-fix. List preference misses separately as suggestions. Don't rewrite unless asked.",
	"- **When editing someone else's text:** apply these rules only to the passages you change. Leave the rest alone, rule breaks included. Don't offer to fix untouched passages unless asked for a review.",
	"",
	"Resolve conflicts using the latest explicit user correction and source facts, then audience and channel guidance, then general style. Preserve direct quotations and approval boundaries.",
	"",
	"Casual texts and DMs may use fragments and omit final periods when supported by relationship evidence. Professional prose uses complete sentences and terminal punctuation. Examples do not override these channel boundaries or establish facts for new writing. Entries under Kill Words may be editorial instructions; interpret their meaning instead of treating an entire instruction as a banned phrase.",
}

// FormatProfileFiles generates the writing profile as an entry file plus one
// file per writing type. Keys are paths relative to ~/.margin.
//
// The entry file holds the how-to, voice calibration, rules for all writing,
// and a table routing to the type files. Type files hold that type's rules
// and its samples and corrections. Samples and corrections with no type go
// to general.md.
func FormatProfileFiles(rules []db.WritingRule, corrections []db.CorrectionRecord) map[string]string {
	var voice, generalRules []db.WritingRule
	typeRules := make(map[string][]db.WritingRule)
	for _, r := range rules {
		switch {
		case r.Category == "voice-calibration":
			voice = append(voice, r)
		case r.WritingType == "general":
			generalRules = append(generalRules, r)
		default:
			typeRules[r.WritingType] = append(typeRules[r.WritingType], r)
		}
	}
	typeExamples := make(map[string][]db.CorrectionRecord)
	for _, c := range corrections {
		wt := generalExamplesType
		if c.WritingType != nil && *c.WritingType != "" {
			wt = *c.WritingType
		}
		typeExamples[wt] = append(typeExamples[wt], c)
	}

	allTypes := make(map[string][]struct{})
	for wt := range typeRules {
		allTypes[wt] = nil
	}
	for wt := range typeExamples {
		allTypes[wt] = nil
	}

	files := make(map[string]string)
	var table []string
	for _, wt := range sortedTypes(allTypes) {
		name := typeFileName(wt)
		path := filepath.Join(ProfileTypeDir, name)
		label := typeLabel(wt)
		if wt == generalExamplesType {
			label = "Examples for any type"
		}

		var lines []string
		lines = append(lines, fmt.Sprintf("# %s", label), "")
		lines = append(lines, "_Generated by Margin. Read ~/.margin/writing-rules.md first; its rules apply here too._")
		lines = append(lines, formatStrictnessSections(typeRules[wt], "##")...)
		lines = append(lines, formatExamples(typeExamples[wt])...)
		lines = append(lines, "")
		files[path] = strings.Join(lines, "\n")

		hard, prefs := 0, 0
		for _, r := range typeRules[wt] {
			if isHardRule(r) {
				hard++
			} else {
				prefs++
			}
		}
		table = append(table, fmt.Sprintf("| %s | `~/.margin/%s/%s` | %d | %d | %d |",
			label, ProfileTypeDir, name, hard, prefs, len(typeExamples[wt])))
	}

	var lines []string
	lines = append(lines, "# Writing Profile", "")
	lines = append(lines, "_Generated by Margin from Sam's corrections. Voice calibration and rules for all writing are here; rules for each writing type are in their own files._")
	lines = append(lines, fmt.Sprintf("_Generated at %s. If this is old, exports are failing; check margin logs._", time.Now().UTC().Format(time.RFC3339)))
	lines = append(lines, "")
	lines = append(lines, profileHowTo...)

	if len(voice) > 0 {
		lines = append(lines, "", "---", "", "## Voice Calibration", "")
		lines = append(lines, "_Statistical voice fingerprint. These are constraints, not suggestions._")
		for _, rule := range voice {
			lines = append(lines, "", fmt.Sprintf("- **%s**", rule.RuleText))
			if rule.WhenToApply != nil {
				lines = append(lines, fmt.Sprintf("  - When: %s", *rule.WhenToApply))
			}
			if rule.Why != nil {
				lines = append(lines, fmt.Sprintf("  - Why: %s", *rule.Why))
			}
		}
	}

	if len(generalRules) > 0 {
		lines = append(lines, "", "---", "", "# Rules for all writing")
		lines = append(lines, formatStrictnessSections(generalRules, "##")...)
	}

	if len(table) > 0 {
		lines = append(lines, "", "---", "", "## Writing types", "")
		lines = append(lines, "_Open only the file for the type you're writing. For a narrower type, such as Email (hiring), also open the broader one (Email)._", "")
		lines = append(lines, "| Type | File | Hard rules | Preferences | Examples |")
		lines = append(lines, "|---|---|---|---|---|")
		lines = append(lines, table...)
	}

	lines = append(lines, "")
	files[ProfileEntryFile] = strings.Join(lines, "\n")
	return files
}

// FormatProfileMarkdown generates the entry file of the writing profile.
// See FormatProfileFiles for the per-type files it routes to.
func FormatProfileMarkdown(rules []db.WritingRule, corrections []db.CorrectionRecord) string {
	return FormatProfileFiles(rules, corrections)[ProfileEntryFile]
}

// writeProfileFiles writes the entry file and type files under marginDir,
// then removes type files left over from writing types that no longer
// have rules or examples. Only .md files in ProfileTypeDir are removed.
func writeProfileFiles(marginDir string, rules []db.WritingRule, corrections []db.CorrectionRecord) error {
	files := FormatProfileFiles(rules, corrections)
	typeDir := filepath.Join(marginDir, ProfileTypeDir)
	if err := os.MkdirAll(typeDir, 0755); err != nil {
		return fmt.Errorf("failed to create %s: %w", typeDir, err)
	}
	// Type files first, so the entry file never routes to a file not yet written.
	for rel, body := range files {
		if rel == ProfileEntryFile {
			continue
		}
		path := filepath.Join(marginDir, rel)
		if err := os.WriteFile(path, []byte(body), 0644); err != nil {
			return fmt.Errorf("failed to write %s: %w", path, err)
		}
	}
	entryPath := filepath.Join(marginDir, ProfileEntryFile)
	if err := os.WriteFile(entryPath, []byte(files[ProfileEntryFile]), 0644); err != nil {
		return fmt.Errorf("failed to write %s: %w", entryPath, err)
	}
	existing, err := os.ReadDir(typeDir)
	if err != nil {
		return nil
	}
	for _, e := range existing {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		if _, keep := files[filepath.Join(ProfileTypeDir, e.Name())]; !keep {
			_ = os.Remove(filepath.Join(typeDir, e.Name()))
		}
	}
	return nil
}

// guardFamily extracts the soft-pattern family tag from a rule's notes
// ("slop-family:copula-avoidance"), falling back to the rule's category.
func guardFamily(r db.WritingRule) string {
	if r.Notes != nil {
		for _, line := range strings.Split(*r.Notes, "\n") {
			if strings.HasPrefix(line, "slop-family:") {
				return strings.TrimSpace(strings.TrimPrefix(line, "slop-family:"))
			}
		}
	}
	return r.Category
}

// GenerateWritingGuardPy generates the Python hook script.
// This is the canonical generator — Rust and MCP delegate to the CLI.
//
// v2 contract: a rule contributes a mechanical pattern ONLY via its
// detection_pattern column (a curated regex). example_before is
// illustrative — the v1 behavior of executing it as a regex produced
// verbatim past sentences as "patterns" that never matched future prose.
//
// Enforcement model:
//   - HARD (single hit asks on published docs): kill words, prohibition
//     rules with a detection_pattern, heading patterns, em-dash budget.
//   - SOFT (cluster-scored): other detection_pattern rules, grouped into
//     families; a published doc asks only when >= 2 distinct families
//     co-occur. A single family is advisory. Isolated tells are normal
//     in human prose — co-occurrence is the AI signal.
func GenerateWritingGuardPy(rules []db.WritingRule) string {
	var killWords []string
	var hardPatterns [][2]string
	var softPatterns [][3]string
	var headingPatterns [][2]string

	for _, r := range rules {
		// Unreviewed synthesis candidates never reach the mechanical guard.
		if r.IsUnreviewedCandidate() {
			continue
		}
		if r.Severity == "must-fix" && r.Category == "kill-words" {
			killWords = append(killWords, r.RuleText)
		}
		if r.Category == "heading-patterns" && r.Severity == "must-fix" && r.ExampleBefore != nil {
			headingPatterns = append(headingPatterns, [2]string{*r.ExampleBefore, r.RuleText})
		}
		if r.DetectionPattern != nil && *r.DetectionPattern != "" {
			if r.Category == "prohibition" {
				hardPatterns = append(hardPatterns, [2]string{*r.DetectionPattern, r.RuleText})
			} else {
				softPatterns = append(softPatterns, [3]string{*r.DetectionPattern, r.RuleText, guardFamily(r)})
			}
		}
	}

	killWordsJSON, _ := json.Marshal(killWords)
	hardPatternsJSON, _ := json.Marshal(hardPatterns)
	softPatternsJSON, _ := json.Marshal(softPatterns)
	headingPatternsJSON, _ := json.Marshal(headingPatterns)

	for _, blob := range [][]byte{killWordsJSON, hardPatternsJSON, softPatternsJSON, headingPatternsJSON} {
		if strings.Contains(string(blob), `"""`) {
			return `#!/usr/bin/env python3
# ERROR: A writing rule contains a triple-quote sequence that cannot be safely
# embedded. Remove the offending rule text and re-export.
import sys; print('writing_guard: triple-quote injection blocked — skipping guard', file=sys.stderr); sys.exit(1)
`
		}
	}

	return fmt.Sprintf(`#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Writing guard hook — AUTO-GENERATED by Margin's export_writing_rules command.
Do not edit manually. Changes will be overwritten.

The encoding cookie above is required: the rule data below embeds non-ASCII
bytes (em dashes are kill-word targets), and some interpreters — notably Apple's
system python3 under a C/empty locale — default source decoding to ASCII and
would raise a SyntaxError without it.

Kill words and slop patterns are loaded from JSON data blobs for safety.
Source of truth: ~/.margin/margin.db (writing_rules table)
"""
import json, sys, re

# Only check prose file extensions
PROSE_EXTENSIONS = {".md", ".mdx", ".txt", ".html", ".htm"}

# Paths where writing is externally published — full enforcement (blocks the write).
# Anything NOT under one of these markers is treated as an internal doc: violations
# are surfaced as advisory-only (printed, never blocking). The guard matters most for
# what ships to other people; internal drafts, plans, and notes should not be gated.
PUBLISHED_PATH_MARKERS = ["/Projects/personal-site/", "/personal-site/", "/substack/", "/published/"]

def is_published(path):
    p = (path or "").replace("\\", "/")
    return any(marker in p for marker in PUBLISHED_PATH_MARKERS)

# Kill words — loaded from JSON for codegen safety.
KILL_WORDS = json.loads(r"""%s""")

# Hard patterns — [regex, explanation]. A single hit is a violation
# (prohibition-backed rules with curated detection patterns).
HARD_PATTERNS = json.loads(r"""%s""")

# Soft patterns — [regex, explanation, family]. Cluster-scored: a published
# doc is flagged only when >= 2 distinct families co-occur. Isolated tells
# are normal in human prose; co-occurrence is the AI signal.
SOFT_PATTERNS = json.loads(r"""%s""")

# Heading patterns — [regex, explanation] applied per heading line
HEADING_PATTERNS = json.loads(r"""%s""")

def compiled(patterns):
    """Compile pattern rows, skipping any invalid regex (fail-open per pattern)."""
    out = []
    for row in patterns:
        try:
            out.append((re.compile(row[0]), *row[1:]))
        except re.error:
            continue
    return out

def get_extension(path):
    if not path:
        return ""
    dot = path.rfind(".")
    return path[dot:].lower() if dot != -1 else ""

def main():
    try:
        data = json.load(sys.stdin)
        tool = data.get("tool_name", "")
        inp = data.get("tool_input") or {}

        # Determine file path and text to check
        path = ""
        text = ""
        if tool == "Write":
            path = inp.get("file_path", "")
            text = inp.get("content", "")
        elif tool == "Edit":
            path = inp.get("file_path", "")
            text = inp.get("new_string", "")

        if not text or get_extension(path) not in PROSE_EXTENSIONS:
            sys.exit(0)

        hard = []            # single hit = violation
        soft_by_family = {}  # family -> [explanations]; blocks only on co-occurrence

        # Kill words — hard
        lower = text.lower()
        for word in KILL_WORDS:
            if word in lower:
                hard.append(f'Kill word: "{word}"')

        # Prohibition-backed patterns — hard
        for rx, explanation in compiled(HARD_PATTERNS):
            if rx.search(text):
                hard.append(explanation)

        # Heading patterns — hard. Section headings only (## and deeper):
        # the H1 is the document's title, which these rules don't govern.
        if HEADING_PATTERNS:
            compiled_headings = compiled(HEADING_PATTERNS)
            for line in text.splitlines():
                stripped = line.strip()
                if not stripped.startswith('##'):
                    continue
                heading_text = stripped.lstrip('#').strip()
                if not heading_text:
                    continue
                for rx, explanation in compiled_headings:
                    if rx.search(heading_text):
                        hard.append(f'{explanation}: "{stripped}"')
                        break

        # Soft patterns — cluster-scored by family
        for rx, explanation, family in compiled(SOFT_PATTERNS):
            m = rx.search(text)
            if m:
                soft_by_family.setdefault(family, []).append(
                    f'{explanation} (matched: "{m.group(0)[:60]}")')

        published = is_published(path)

        # Em dash budget applies only to published docs (limit 1-2 per document).
        if published:
            em = text.count("—")
            if em > 2:
                hard.append(f'Em dash overuse: {em} em dashes; limit to 1-2 per published document.')

        soft_families = sorted(soft_by_family)
        cluster = len(soft_families) >= 2
        blocking = hard + ([v for f in soft_families for v in soft_by_family[f]] if cluster else [])
        advisory_only = [] if cluster else [v for f in soft_families for v in soft_by_family[f]]

        if blocking or advisory_only:
            if not published or not blocking:
                # Internal doc, or a single soft family on a published doc:
                # advisory only, never block the write.
                note = "WRITING GUARD (advisory — not blocking):\n"
                shown = (blocking + advisory_only)[:8]
                for v in shown:
                    note += f"  - {v}\n"
                remaining = len(blocking) + len(advisory_only) - len(shown)
                if remaining > 0:
                    note += f"  ... and {remaining} more\n"
                print(note, file=sys.stderr)
                sys.exit(0)

            msg = "WRITING GUARD: Writing rule violations detected:\n"
            for v in blocking:
                msg += f"  - {v}\n"
            if cluster:
                msg += f"AI-tell cluster: {len(soft_families)} pattern families co-occur ({', '.join(soft_families)}).\n"
            msg += "Fix violations. See ~/.margin/writing-rules.md for rules."

            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": msg
                }
            }))

    except Exception as e:
        # Fail-open: never block writes due to hook errors
        print(f"Writing guard encountered an error (fail-open): {e}", file=sys.stderr)

    sys.exit(0)

if __name__ == "__main__":
    main()
`, string(killWordsJSON), string(hardPatternsJSON), string(softPatternsJSON), string(headingPatternsJSON))
}

// AgentIntegrationEnabled reports whether exports may write Claude Code's guard
// and Codex's AGENTS.md. It mirrors the app's Writing guard setting
// (agent_integration_enabled in src-tauri/src/commands/writing_rules.rs):
// ~/.margin/agent-integration holds "on" or "off"; without it, a guard written
// by an earlier Margin means the user already opted in.
func AgentIntegrationEnabled(home string) bool {
	setting, err := os.ReadFile(filepath.Join(home, ".margin", "agent-integration"))
	if err == nil {
		return strings.TrimSpace(string(setting)) == "on"
	}
	_, err = os.Stat(filepath.Join(home, ".claude", "hooks", "writing_guard.py"))
	return err == nil
}

// ExportProfile writes the unified writing profile and agent-specific artifacts.
// With the default target, agent artifacts are written only when
// AgentIntegrationEnabled; otherwise it behaves like target="markdown".
//
// Every target writes the profile: ~/.margin/writing-rules.md (entry file)
// and ~/.margin/writing-rules/<type>.md.
//
// target="" (default): writes the profile and
// ~/.claude/hooks/writing_guard.py. Also updates ~/.codex/AGENTS.md if
// ~/.codex exists (opt-in by directory presence). Errors updating Codex are
// non-fatal — they don't break the Claude pipeline if Codex isn't set up.
//
// target="markdown": writes only ~/.margin/writing-rules.md.
//
// target="codex": writes ~/.margin/writing-rules.md and ~/.codex/AGENTS.md.
// Skips writing_guard.py — Codex uses prompt-level instructions instead of a hook.
func ExportProfile(dbPath string, target string) error {
	d, err := db.OpenRead(dbPath)
	if err != nil {
		return err
	}
	defer d.Close()

	allRules, err := db.GetWritingRules(d, nil)
	if err != nil {
		return err
	}

	// Unreviewed synthesis candidates are excluded from every export artifact
	// (profile markdown + guard) until Sam accepts them.
	rules := make([]db.WritingRule, 0, len(allRules))
	for _, r := range allRules {
		if r.IsUnreviewedCandidate() {
			continue
		}
		rules = append(rules, r)
	}

	corrections, err := db.GetAllCorrectionsForProfile(d)
	if err != nil {
		return err
	}

	home, _ := os.UserHomeDir()
	if target == "" && !AgentIntegrationEnabled(home) {
		target = "markdown"
	}

	// Always write the profile — the universal, LLM-agnostic artifact:
	// writing-rules.md plus one file per writing type in writing-rules/.
	if err := writeProfileFiles(filepath.Join(home, ".margin"), rules, corrections); err != nil {
		return err
	}

	if target == "markdown" {
		// Markdown target: the profile only. The app uses this until the user
		// opts in to changing Claude Code and Codex configuration.
		return nil
	}

	if target == "codex" {
		// Codex target: update AGENTS.md instead of writing the Claude hook.
		return ExportCodex(dbPath)
	}

	// Default (Claude) target: write writing_guard.py.
	guardPy := GenerateWritingGuardPy(rules)
	hooksDir := filepath.Join(home, ".claude", "hooks")
	os.MkdirAll(hooksDir, 0755)
	guardPath := filepath.Join(hooksDir, "writing_guard.py")
	if err := os.WriteFile(guardPath, []byte(guardPy), 0755); err != nil {
		return fmt.Errorf("failed to write %s: %w", guardPath, err)
	}

	// Also update ~/.codex/AGENTS.md if Codex CLI is installed (opt-in by directory presence).
	// Errors are non-fatal — don't break the Claude pipeline if Codex isn't set up.
	if _, statErr := os.Stat(CodexDir()); statErr == nil {
		_ = writeCodexAgentsMD(FormatCodexAgentsMD(rules, corrections))
	}

	return nil
}
