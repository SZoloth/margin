package eidetic

import (
	"bufio"
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/SZoloth/margin/cli/db"
)

const (
	// DefaultBatchSize stays safely under ee v0.19's constrained writeSpool.batchCap (32).
	DefaultBatchSize = 20
	MaxContentLen    = 2000
	MaxTagLen        = 48
)

var nonTagChars = regexp.MustCompile(`[^a-z0-9_-]+`)

// RememberRecord is one JSONL line accepted by `ee remember --batch --stdin`.
type RememberRecord struct {
	Content            string   `json:"content"`
	Level              string   `json:"level"`
	Kind               string   `json:"kind"`
	Tags               []string `json:"tags"`
	Source             string   `json:"source"`
	IdempotencyKey     string   `json:"idempotencyKey"`
	AllowSecretMention bool     `json:"allowSecretMention"`
}

// SyncOptions controls how Margin records are synced into an ee workspace.
type SyncOptions struct {
	DBPath         string
	Workspace      string
	MaxRules       int
	MaxHighlights  int
	MaxCorrections int
	BatchSize      int
	EEBin          string
}

// SyncResult summarizes a completed sync run.
type SyncResult struct {
	Workspace         string `json:"workspace"`
	RulesPrepared     int    `json:"rulesPrepared"`
	HighlightsPrepared int   `json:"highlightsPrepared"`
	CorrectionsPrepared int  `json:"correctionsPrepared"`
	Stored            int    `json:"stored"`
	Failed            int    `json:"failed"`
	MemoriesIndexed   int    `json:"memoriesIndexed"`
}

// PackResult is the structured summary returned by `margin eidetic pack`.
type PackResult struct {
	Workspace  string `json:"workspace"`
	Query      string `json:"query"`
	Hash       string `json:"hash"`
	ItemsCount int    `json:"itemsCount"`
	Conflicts  any    `json:"conflicts"`
	Degraded   any    `json:"degraded"`
	Text       string `json:"text"`
}

// ExportPackResult summarizes a distributable Judgment Pack export.
type ExportPackResult struct {
	Workspace             string `json:"workspace"`
	ExportDir             string `json:"exportDir"`
	DistributablePath     string `json:"distributablePath"`
	ManifestHash          string `json:"manifestHash"`
	RecordsHash           string `json:"recordsHash"`
	TrustDowngradedCount  int    `json:"trustDowngradedCount"`
}

// DefaultWorkspace returns ~/.margin/eidetic or MARGIN_EIDETIC_WORKSPACE.
func DefaultWorkspace() string {
	if env := os.Getenv("MARGIN_EIDETIC_WORKSPACE"); env != "" {
		return env
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".margin", "eidetic")
}

// ResolveEEBinary locates the `ee` binary on PATH or in ~/.local/bin/ee.
func ResolveEEBinary(override string) (string, error) {
	if override != "" {
		if _, err := os.Stat(override); err != nil {
			return "", fmt.Errorf("ee binary not found at %s: %w", override, err)
		}
		return override, nil
	}
	if p, err := exec.LookPath("ee"); err == nil {
		return p, nil
	}
	home, _ := os.UserHomeDir()
	local := filepath.Join(home, ".local", "bin", "ee")
	if _, err := os.Stat(local); err == nil {
		return local, nil
	}
	return "", errors.New("eidetic-engine (`ee`) binary not found on PATH or ~/.local/bin/ee; install from https://eidetic-engine.org/")
}

// SlugTag normalizes an arbitrary Margin category or label to ee's accepted tag grammar.
func SlugTag(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = nonTagChars.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > MaxTagLen {
		s = strings.TrimRight(s[:MaxTagLen], "-")
	}
	return s
}

// CleanTags slugifies and deduplicates a list of tags.
func CleanTags(raw []string) []string {
	seen := make(map[string]struct{}, len(raw))
	out := make([]string, 0, len(raw))
	for _, r := range raw {
		s := SlugTag(r)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

// ExtractRecords reads active writing rules, annotated highlights, and recent corrections
// from a Margin SQLite database without mutating it.
func ExtractRecords(conn *sql.DB, maxRules, maxHighlights, maxCorrections int) (records []RememberRecord, rulesCount, hlCount, corrCount int, err error) {
	if maxRules <= 0 {
		maxRules = 200
	}
	if maxHighlights <= 0 {
		maxHighlights = 100
	}
	if maxCorrections <= 0 {
		maxCorrections = 100
	}

	// 1. Active writing rules -> procedural
	rRows, err := conn.Query(`
		SELECT id, writing_type, category, rule_text,
		       COALESCE(when_to_apply, ''), COALESCE(why, ''),
		       severity, COALESCE(example_before, ''), COALESCE(example_after, ''),
		       COALESCE(polarity, '')
		FROM writing_rules
		WHERE archived_at IS NULL
		ORDER BY signal_count DESC, updated_at DESC
		LIMIT ?`, maxRules)
	if err != nil {
		return nil, 0, 0, 0, fmt.Errorf("query writing_rules: %w", err)
	}
	defer rRows.Close()

	for rRows.Next() {
		var id, wType, cat, ruleText, whenApply, why, sev, exBefore, exAfter, polarity string
		if err := rRows.Scan(&id, &wType, &cat, &ruleText, &whenApply, &why, &sev, &exBefore, &exAfter, &polarity); err != nil {
			return nil, 0, 0, 0, err
		}
		parts := []string{fmt.Sprintf("[%s/%s] (%s) %s", wType, cat, sev, strings.TrimSpace(ruleText))}
		if strings.TrimSpace(whenApply) != "" {
			parts = append(parts, "When: "+strings.TrimSpace(whenApply))
		}
		if strings.TrimSpace(why) != "" {
			parts = append(parts, "Why: "+strings.TrimSpace(why))
		}
		if strings.TrimSpace(exBefore) != "" && strings.TrimSpace(exAfter) != "" {
			parts = append(parts, fmt.Sprintf("Before: %s -> After: %s", strings.TrimSpace(exBefore), strings.TrimSpace(exAfter)))
		}
		kind := "rule"
		if polarity == "corrective" {
			kind = "anti-pattern"
		}
		records = append(records, RememberRecord{
			Content:            truncate(strings.Join(parts, " | "), MaxContentLen),
			Level:              "procedural",
			Kind:               kind,
			Tags:               CleanTags([]string{"margin", "writing-rule", wType, cat, sev, polarity}),
			Source:             fmt.Sprintf("manual://margin/writing-rule/%s", id),
			IdempotencyKey:     fmt.Sprintf("margin-rule-%s", id),
			AllowSecretMention: true,
		})
		rulesCount++
	}
	if err := rRows.Err(); err != nil {
		return nil, 0, 0, 0, err
	}

	// 2. Highlights + attached margin_notes -> semantic facts
	notesByHL := make(map[string][]string)
	nRows, err := conn.Query(`SELECT highlight_id, COALESCE(intent, 'note'), content FROM margin_notes`)
	if err == nil {
		defer nRows.Close()
		for nRows.Next() {
			var hid, intent, content string
			if err := nRows.Scan(&hid, &intent, &content); err == nil {
				notesByHL[hid] = append(notesByHL[hid], fmt.Sprintf("(%s) %s", intent, strings.TrimSpace(content)))
			}
		}
	}

	docTitles := make(map[string]string)
	dRows, err := conn.Query(`SELECT id, COALESCE(NULLIF(title, ''), source, id) FROM documents`)
	if err == nil {
		defer dRows.Close()
		for dRows.Next() {
			var id, title string
			if err := dRows.Scan(&id, &title); err == nil {
				docTitles[id] = title
			}
		}
	}

	hRows, err := conn.Query(`
		SELECT id, document_id, COALESCE(color, 'yellow'), text_content, COALESCE(anchor_heading_path, '')
		FROM highlights
		WHERE length(trim(text_content)) >= 20
		ORDER BY updated_at DESC
		LIMIT ?`, maxHighlights)
	if err == nil {
		defer hRows.Close()
		for hRows.Next() {
			var id, docID, color, text, heading string
			if err := hRows.Scan(&id, &docID, &color, &text, &heading); err != nil {
				return nil, 0, 0, 0, err
			}
			title := docTitles[docID]
			if title == "" {
				title = docID
			}
			var b strings.Builder
			fmt.Fprintf(&b, "Highlight from '%s'", title)
			if heading != "" {
				fmt.Fprintf(&b, " [%s]", heading)
			}
			fmt.Fprintf(&b, ": %s", strings.TrimSpace(text))
			tags := []string{"margin", "highlight", color}
			if attached := notesByHL[id]; len(attached) > 0 {
				fmt.Fprintf(&b, " | Note: %s", strings.Join(attached, " | Note: "))
				tags = append(tags, "annotated")
			}
			records = append(records, RememberRecord{
				Content:            truncate(b.String(), MaxContentLen),
				Level:              "semantic",
				Kind:               "fact",
				Tags:               CleanTags(tags),
				Source:             fmt.Sprintf("manual://margin/highlight/%s", id),
				IdempotencyKey:     fmt.Sprintf("margin-hl-%s", id),
				AllowSecretMention: true,
			})
			hlCount++
		}
	}

	// 3. Recent corrections -> episodic failures / facts
	cRows, err := conn.Query(`
		SELECT id, document_id, COALESCE(document_title, ''), original_text,
		       COALESCE(notes_json, '[]'), COALESCE(writing_type, ''),
		       COALESCE(polarity, ''), COALESCE(feedback_type, ''),
		       COALESCE(suggested_edit, ''), COALESCE(rationale, '')
		FROM corrections
		WHERE length(trim(original_text)) >= 12
		ORDER BY updated_at DESC
		LIMIT ?`, maxCorrections)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var id, docID, docTitle, orig, notesJSON, wType, polarity, fbType, suggested, rationale string
			if err := cRows.Scan(&id, &docID, &docTitle, &orig, &notesJSON, &wType, &polarity, &fbType, &suggested, &rationale); err != nil {
				return nil, 0, 0, 0, err
			}
			if docTitle == "" {
				docTitle = docID
			}
			parts := []string{fmt.Sprintf("Correction in '%s': %q", docTitle, strings.TrimSpace(orig))}
			var parsedNotes []string
			if err := json.Unmarshal([]byte(notesJSON), &parsedNotes); err == nil && len(parsedNotes) > 0 {
				parts = append(parts, "Feedback: "+strings.Join(parsedNotes, "; "))
			}
			if strings.TrimSpace(suggested) != "" {
				parts = append(parts, "Suggested: "+strings.TrimSpace(suggested))
			}
			if strings.TrimSpace(rationale) != "" {
				parts = append(parts, "Rationale: "+strings.TrimSpace(rationale))
			}
			kind := "fact"
			if polarity == "corrective" {
				kind = "failure"
			}
			records = append(records, RememberRecord{
				Content:            truncate(strings.Join(parts, " | "), MaxContentLen),
				Level:              "episodic",
				Kind:               kind,
				Tags:               CleanTags([]string{"margin", "correction", wType, polarity, fbType}),
				Source:             fmt.Sprintf("manual://margin/correction/%s", id),
				IdempotencyKey:     fmt.Sprintf("margin-corr-%s", id),
				AllowSecretMention: true,
			})
			corrCount++
		}
	}

	return records, rulesCount, hlCount, corrCount, nil
}

// ChunkRecords splits records into batches of size <= batchSize.
func ChunkRecords(records []RememberRecord, batchSize int) [][]RememberRecord {
	if batchSize <= 0 {
		batchSize = DefaultBatchSize
	}
	var chunks [][]RememberRecord
	for i := 0; i < len(records); i += batchSize {
		end := i + batchSize
		if end > len(records) {
			end = len(records)
		}
		chunks = append(chunks, records[i:end])
	}
	return chunks
}

func runEE(eeBin, workspace string, stdin []byte, args ...string) ([]byte, error) {
	fullArgs := append(args, "--workspace", workspace, "--json")
	cmd := exec.Command(eeBin, fullArgs...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		if len(msg) > 600 {
			msg = msg[:600]
		}
		return nil, fmt.Errorf("ee %s failed: %w (%s)", strings.Join(args, " "), err, msg)
	}
	return stdout.Bytes(), nil
}

// EnsureWorkspace initializes the ee workspace and sets Margin isolation + graph feature flags.
func EnsureWorkspace(eeBin, workspace string) error {
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(workspace, ".ee", "ee.db")); os.IsNotExist(err) {
		if _, err := runEE(eeBin, workspace, nil, "init"); err != nil {
			return err
		}
	}
	flags := [][2]string{
		{"memory.participate", "false"},
		{"graph.feature.structural_health.enabled", "true"},
		{"graph.feature.pack_dna.enabled", "true"},
		{"graph.feature.skyline.enabled", "true"},
		{"graph.feature.proximity.enabled", "true"},
		{"graph.feature.causal_explain.enabled", "true"},
	}
	for _, kv := range flags {
		if _, err := runEE(eeBin, workspace, nil, "config", "set", kv[0], kv[1]); err != nil {
			return err
		}
	}
	return nil
}

// Sync imports Margin rules, highlights, and corrections into an ee workspace and rebuilds the index.
func Sync(opts SyncOptions) (*SyncResult, error) {
	eeBin, err := ResolveEEBinary(opts.EEBin)
	if err != nil {
		return nil, err
	}
	ws := opts.Workspace
	if ws == "" {
		ws = DefaultWorkspace()
	}
	if err := EnsureWorkspace(eeBin, ws); err != nil {
		return nil, err
	}

	conn, err := db.OpenRead(opts.DBPath)
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	records, rCount, hCount, cCount, err := ExtractRecords(conn, opts.MaxRules, opts.MaxHighlights, opts.MaxCorrections)
	if err != nil {
		return nil, err
	}

	batchSize := opts.BatchSize
	if batchSize <= 0 || batchSize > 25 {
		batchSize = DefaultBatchSize
	}

	res := &SyncResult{
		Workspace:           ws,
		RulesPrepared:       rCount,
		HighlightsPrepared:  hCount,
		CorrectionsPrepared: cCount,
	}

	for _, chunk := range ChunkRecords(records, batchSize) {
		var buf bytes.Buffer
		enc := json.NewEncoder(&buf)
		for _, rec := range chunk {
			if err := enc.Encode(rec); err != nil {
				return nil, err
			}
		}
		out, err := runEE(eeBin, ws, buf.Bytes(), "remember", "--batch", "--stdin")
		if err != nil {
			return nil, err
		}
		var resp struct {
			Data struct {
				Results []struct {
					MemoryID string `json:"memoryId"`
					Status   string `json:"status"`
				} `json:"results"`
			} `json:"data"`
		}
		if err := json.Unmarshal(out, &resp); err == nil && len(resp.Data.Results) > 0 {
			for _, item := range resp.Data.Results {
				if item.MemoryID != "" {
					res.Stored++
				} else {
					res.Failed++
				}
			}
		} else {
			res.Stored += len(chunk)
		}
	}

	idxOut, err := runEE(eeBin, ws, nil, "index", "rebuild")
	if err != nil {
		return nil, err
	}
	var idxResp struct {
		Data struct {
			MemoriesIndexed int `json:"memories_indexed"`
		} `json:"data"`
	}
	if err := json.Unmarshal(idxOut, &idxResp); err == nil {
		res.MemoriesIndexed = idxResp.Data.MemoriesIndexed
	}

	return res, nil
}

// Pack compiles a deterministic, budget-capped Thinking Pack from the Margin ee workspace.
func Pack(eeBinOverride, workspace, query string, maxTokens int) (*PackResult, error) {
	eeBin, err := ResolveEEBinary(eeBinOverride)
	if err != nil {
		return nil, err
	}
	if workspace == "" {
		workspace = DefaultWorkspace()
	}
	if maxTokens <= 0 {
		maxTokens = 2000
	}
	out, err := runEE(eeBin, workspace, nil, "pack", query, "--max-tokens", fmt.Sprintf("%d", maxTokens), "--explain")
	if err != nil {
		return nil, err
	}
	var resp struct {
		Data struct {
			Conflicts any `json:"conflicts"`
			Degraded  any `json:"degraded"`
			Pack      struct {
				Hash  string `json:"hash"`
				Text  string `json:"text"`
				Items []any  `json:"items"`
			} `json:"pack"`
		} `json:"data"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, fmt.Errorf("parse ee pack response: %w", err)
	}
	return &PackResult{
		Workspace:  workspace,
		Query:      query,
		Hash:       resp.Data.Pack.Hash,
		ItemsCount: len(resp.Data.Pack.Items),
		Conflicts:  resp.Data.Conflicts,
		Degraded:   resp.Data.Degraded,
		Text:       resp.Data.Pack.Text,
	}, nil
}

// RecordOutcome logs a helpful or harmful outcome event against a memory ID in ee.
func RecordOutcome(eeBinOverride, workspace, memoryID, signal, sourceID, reason string) (json.RawMessage, error) {
	if signal != "helpful" && signal != "harmful" {
		return nil, fmt.Errorf("signal must be 'helpful' or 'harmful', got %q", signal)
	}
	eeBin, err := ResolveEEBinary(eeBinOverride)
	if err != nil {
		return nil, err
	}
	if workspace == "" {
		workspace = DefaultWorkspace()
	}
	if sourceID == "" {
		sourceID = "margin-user"
	}
	line, err := json.Marshal(map[string]string{
		"target":   memoryID,
		"signal":   signal,
		"sourceId": sourceID,
		"reason":   reason,
	})
	if err != nil {
		return nil, err
	}
	line = append(line, '\n')
	out, err := runEE(eeBin, workspace, line, "outcome", "--batch", "--stdin")
	if err != nil {
		return nil, err
	}
	return json.RawMessage(out), nil
}

// DowngradeForeignTrust rewrites `human_explicit` -> `agent_validated` in an exported ee JSONL
// archive so external subscribers can import it without violating ee's cryptographic trust ceiling.
func DowngradeForeignTrust(srcPath, dstPath string) (int, error) {
	in, err := os.Open(srcPath)
	if err != nil {
		return 0, err
	}
	defer in.Close()

	out, err := os.Create(dstPath)
	if err != nil {
		return 0, err
	}
	defer out.Close()

	scanner := bufio.NewScanner(in)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	writer := bufio.NewWriter(out)
	downgraded := 0

	for scanner.Scan() {
		raw := scanner.Bytes()
		if len(bytes.TrimSpace(raw)) == 0 {
			continue
		}
		var obj map[string]any
		if err := json.Unmarshal(raw, &obj); err != nil {
			return downgraded, err
		}
		changed := false
		for _, k := range []string{"trust_class", "trustClass"} {
			if v, ok := obj[k].(string); ok && v == "human_explicit" {
				obj[k] = "agent_validated"
				changed = true
			}
		}
		if data, ok := obj["data"].(map[string]any); ok {
			for _, k := range []string{"trust_class", "trustClass"} {
				if v, ok := data[k].(string); ok && v == "human_explicit" {
					data[k] = "agent_validated"
					changed = true
				}
			}
		}
		if changed {
			downgraded++
		}
		enc, err := json.Marshal(obj)
		if err != nil {
			return downgraded, err
		}
		if _, err := writer.Write(enc); err != nil {
			return downgraded, err
		}
		if err := writer.WriteByte('\n'); err != nil {
			return downgraded, err
		}
	}
	if err := scanner.Err(); err != nil {
		return downgraded, err
	}
	if err := writer.Flush(); err != nil {
		return downgraded, err
	}
	return downgraded, nil
}

// ExportJudgmentPack exports the workspace as a redacted archive and writes a subscriber-ready
// `dist-judgment-pack.jsonl` downgraded to `agent_validated` trust.
func ExportJudgmentPack(eeBinOverride, workspace, outputDir, label string) (*ExportPackResult, error) {
	eeBin, err := ResolveEEBinary(eeBinOverride)
	if err != nil {
		return nil, err
	}
	if workspace == "" {
		workspace = DefaultWorkspace()
	}
	if label == "" {
		label = "Margin Writing Judgment Pack"
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, err
	}
	out, err := runEE(eeBin, workspace, nil, "export", "--output-dir", outputDir, "--label", label)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Data struct {
			OutputPath   string `json:"outputPath"`
			RecordsPath  string `json:"recordsPath"`
			ManifestHash string `json:"manifestHash"`
			RecordsHash  string `json:"recordsHash"`
		} `json:"data"`
	}
	if err := json.Unmarshal(out, &resp); err != nil {
		return nil, fmt.Errorf("parse ee export response: %w", err)
	}
	distPath := filepath.Join(outputDir, "dist-judgment-pack.jsonl")
	downgraded, err := DowngradeForeignTrust(resp.Data.RecordsPath, distPath)
	if err != nil {
		return nil, fmt.Errorf("downgrade foreign trust: %w", err)
	}
	return &ExportPackResult{
		Workspace:            workspace,
		ExportDir:            resp.Data.OutputPath,
		DistributablePath:    distPath,
		ManifestHash:         resp.Data.ManifestHash,
		RecordsHash:          resp.Data.RecordsHash,
		TrustDowngradedCount: downgraded,
	}, nil
}
