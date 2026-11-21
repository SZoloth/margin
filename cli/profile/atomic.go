package profile

import (
	"fmt"
	"os"
	"path/filepath"
)

// writeFileAtomic writes data to a temp file beside path, then renames it
// over path, so a reader (or a second export) never sees a half-written file.
func writeFileAtomic(path string, data []byte, perm os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	cleanup := func(e error) error {
		tmp.Close()
		os.Remove(tmpName)
		return e
	}
	if _, err := tmp.Write(data); err != nil {
		return cleanup(err)
	}
	if err := tmp.Chmod(perm); err != nil {
		return cleanup(err)
	}
	if err := tmp.Sync(); err != nil {
		return cleanup(err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}

// withExportLock runs fn while holding ~/.margin/.export.lock. Every app or
// MCP change starts its own export process; the lock makes them take turns,
// so each one reads the database and merges AGENTS.md after the last finished.
func withExportLock(fn func() error) error {
	home, _ := os.UserHomeDir()
	dir := filepath.Join(home, ".margin")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create %s: %w", dir, err)
	}
	unlock, err := lockFile(filepath.Join(dir, ".export.lock"))
	if err != nil {
		return fmt.Errorf("failed to lock profile export: %w", err)
	}
	defer unlock()
	return fn()
}
