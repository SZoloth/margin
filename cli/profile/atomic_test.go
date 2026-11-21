package profile

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestConcurrentCodexExportsKeepUserContent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(filepath.Join(home, ".codex"), 0o755); err != nil {
		t.Fatal(err)
	}
	user := "# My own Codex notes\n\n" + strings.Repeat("Keep this line.\n", 4000)
	if err := os.WriteFile(CodexAgentsMDPath(), []byte(user), 0o644); err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 40)
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- withExportLock(func() error {
				return writeCodexAgentsMD(FormatCodexAgentsMD(nil, nil))
			})
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}

	got, err := os.ReadFile(CodexAgentsMDPath())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(got), user) {
		t.Fatalf("user-authored AGENTS.md content was lost (len %d, want prefix of len %d)", len(got), len(user))
	}
	if strings.Count(string(got), beginMarker) != 1 {
		t.Fatalf("want exactly one managed section, got %d", strings.Count(string(got), beginMarker))
	}
}

func TestWriteFileAtomicReplacesWithoutLeftovers(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "out.md")
	if err := writeFileAtomic(path, []byte("one"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomic(path, []byte("two"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(path)
	if string(got) != "two" {
		t.Fatalf("got %q", got)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("temp files left behind: %v", entries)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o644 {
		t.Fatalf("mode %v", info.Mode().Perm())
	}
}
