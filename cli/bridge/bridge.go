package bridge

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const maxBody = 1024 * 1024 // 1MB

// WaitForExport starts an HTTP server on localhost:24784, waits for one POST /export, returns the prompt.
// Senders must present the per-session token from ~/.margin/mcp-port.
func WaitForExport(timeoutSec int) (string, error) {
	if timeoutSec <= 0 {
		timeoutSec = 300
	}
	if timeoutSec > 600 {
		timeoutSec = 600
	}

	token, err := newToken()
	if err != nil {
		return "", fmt.Errorf("failed to generate bridge token: %w", err)
	}

	resultCh := make(chan string, 1)

	listener, err := net.Listen("tcp", "127.0.0.1:24784")
	if err != nil {
		return "", fmt.Errorf("failed to bind port 24784: %w", err)
	}

	server := &http.Server{Handler: newHandler(token, resultCh)}

	home, _ := os.UserHomeDir()
	portFile := filepath.Join(home, ".margin", "mcp-port")
	if err := writePortFile(portFile, 24784, token); err != nil {
		listener.Close()
		return "", fmt.Errorf("failed to write %s: %w", portFile, err)
	}
	defer removePortFileIfOwned(portFile, token)

	go server.Serve(listener)
	defer server.Close()

	select {
	case prompt := <-resultCh:
		return prompt, nil
	case <-time.After(time.Duration(timeoutSec) * time.Second):
		return "", fmt.Errorf("timed out waiting for export after %ds", timeoutSec)
	}
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// writePortFile records where and how to reach the bridge. The token is the
// only thing keeping other senders out, so the file is owner-only. WriteFile's
// mode applies only on create, so a leftover file is tightened first.
func writePortFile(path string, port int, token string) error {
	data, err := json.Marshal(map[string]any{"port": port, "token": token})
	if err != nil {
		return err
	}
	if err := os.Chmod(path, 0o600); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// removePortFileIfOwned leaves the file alone when another bridge (the MCP
// server) has since written its own token there.
func removePortFileIfOwned(path, token string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var current struct {
		Token string `json:"token"`
	}
	if json.Unmarshal(raw, &current) == nil && current.Token == token {
		os.Remove(path)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// newHandler serves /status and /export. Legitimate senders (Margin's Rust
// backend) never send Origin; browsers always do on cross-origin requests,
// so any Origin is a web page and is refused. No CORS headers are sent.
func newHandler(token string, resultCh chan<- string) http.Handler {
	want := []byte("Bearer " + token)
	mux := http.NewServeMux()

	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"status": "waiting"})
	})

	mux.HandleFunc("/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"})
			return
		}

		body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
		if err != nil || len(body) > maxBody {
			writeJSON(w, 413, map[string]string{"error": "Payload too large"})
			return
		}

		var prompt string
		ct := r.Header.Get("Content-Type")
		if ct == "application/json" || ct == "application/json; charset=utf-8" {
			var parsed struct {
				Prompt string `json:"prompt"`
			}
			if err := json.Unmarshal(body, &parsed); err != nil {
				writeJSON(w, 400, map[string]string{"error": "Invalid JSON"})
				return
			}
			prompt = parsed.Prompt
		} else {
			prompt = string(body)
		}

		if len(prompt) == 0 {
			writeJSON(w, 400, map[string]string{"error": "Empty body"})
			return
		}

		select {
		case resultCh <- prompt:
			writeJSON(w, 200, map[string]bool{"ok": true})
		default:
			// WaitForExport takes one export; refuse extras instead of blocking.
			writeJSON(w, 409, map[string]string{"error": "Export already received"})
		}
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") != "" {
			writeJSON(w, 403, map[string]string{"error": "Forbidden"})
			return
		}
		got := []byte(r.Header.Get("Authorization"))
		if subtle.ConstantTimeCompare(got, want) != 1 {
			writeJSON(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}
		mux.ServeHTTP(w, r)
	})
}
