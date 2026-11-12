package bridge

import (
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
func WaitForExport(timeoutSec int) (string, error) {
	if timeoutSec <= 0 {
		timeoutSec = 300
	}
	if timeoutSec > 600 {
		timeoutSec = 600
	}

	resultCh := make(chan string, 1)
	errCh := make(chan error, 1)

	mux := http.NewServeMux()

	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"status": "waiting"})
	})

	mux.HandleFunc("/export", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		if r.Method != "POST" {
			w.WriteHeader(405)
			json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
			return
		}

		body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
		if err != nil || len(body) > maxBody {
			w.WriteHeader(413)
			json.NewEncoder(w).Encode(map[string]string{"error": "Payload too large"})
			return
		}

		var prompt string
		ct := r.Header.Get("Content-Type")
		if ct == "application/json" || ct == "application/json; charset=utf-8" {
			var parsed struct {
				Prompt string `json:"prompt"`
			}
			if err := json.Unmarshal(body, &parsed); err != nil {
				w.WriteHeader(400)
				json.NewEncoder(w).Encode(map[string]string{"error": "Invalid JSON"})
				return
			}
			prompt = parsed.Prompt
		} else {
			prompt = string(body)
		}

		if len(prompt) == 0 {
			w.WriteHeader(400)
			json.NewEncoder(w).Encode(map[string]string{"error": "Empty body"})
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})

		resultCh <- prompt
	})

	listener, err := net.Listen("tcp", "127.0.0.1:24784")
	if err != nil {
		return "", fmt.Errorf("failed to bind port 24784: %w", err)
	}

	server := &http.Server{Handler: mux}

	// Write port file
	home, _ := os.UserHomeDir()
	portFile := filepath.Join(home, ".margin", "mcp-port")
	os.WriteFile(portFile, []byte("24784"), 0644)
	defer os.Remove(portFile)

	go server.Serve(listener)
	defer server.Close()

	select {
	case prompt := <-resultCh:
		return prompt, nil
	case err := <-errCh:
		return "", err
	case <-time.After(time.Duration(timeoutSec) * time.Second):
		return "", fmt.Errorf("timed out waiting for export after %ds", timeoutSec)
	}
}
