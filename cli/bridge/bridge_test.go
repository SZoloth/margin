package bridge

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const testToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func doRequest(t *testing.T, h http.Handler, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func authed(extra map[string]string) map[string]string {
	h := map[string]string{"Authorization": "Bearer " + testToken}
	for k, v := range extra {
		h[k] = v
	}
	return h
}

func TestExportWithTokenDelivers(t *testing.T) {
	ch := make(chan string, 1)
	rec := doRequest(t, newHandler(testToken, ch), "POST", "/export", "notes", authed(nil))
	if rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := <-ch; got != "notes" {
		t.Fatalf("prompt = %q", got)
	}
}

func TestExportWithoutTokenRejected(t *testing.T) {
	ch := make(chan string, 1)
	rec := doRequest(t, newHandler(testToken, ch), "POST", "/export", "forged", nil)
	if rec.Code != 401 {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if len(ch) != 0 {
		t.Fatal("forged export was delivered")
	}
}

func TestExportWrongTokenRejected(t *testing.T) {
	ch := make(chan string, 1)
	rec := doRequest(t, newHandler(testToken, ch), "POST", "/export", "forged",
		map[string]string{"Authorization": "Bearer nope"})
	if rec.Code != 401 {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestExportFromBrowserOriginRejected(t *testing.T) {
	ch := make(chan string, 1)
	rec := doRequest(t, newHandler(testToken, ch), "POST", "/export", "forged",
		authed(map[string]string{"Origin": "https://evil.example"}))
	if rec.Code != 403 {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	if len(ch) != 0 {
		t.Fatal("forged export was delivered")
	}
}

func TestStatusRequiresToken(t *testing.T) {
	h := newHandler(testToken, make(chan string, 1))
	if rec := doRequest(t, h, "GET", "/status", "", nil); rec.Code != 401 {
		t.Fatalf("unauthenticated status = %d, want 401", rec.Code)
	}
	if rec := doRequest(t, h, "GET", "/status", "", authed(nil)); rec.Code != 200 {
		t.Fatalf("authenticated status = %d, want 200", rec.Code)
	}
}

func TestNoCORSHeaders(t *testing.T) {
	h := newHandler(testToken, make(chan string, 1))
	for _, path := range []string{"/status", "/export"} {
		rec := doRequest(t, h, "OPTIONS", path, "", nil)
		if v := rec.Header().Get("Access-Control-Allow-Origin"); v != "" {
			t.Fatalf("%s sent Access-Control-Allow-Origin: %q", path, v)
		}
	}
}

func TestWritePortFileOwnerOnly(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mcp-port")
	// A leftover world-readable file must be tightened, not reused.
	if err := os.WriteFile(path, []byte("24784"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := writePortFile(path, 24784, testToken); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("mode = %o, want 600", perm)
	}
	raw, _ := os.ReadFile(path)
	var got struct {
		Port  int    `json:"port"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("port file is not JSON: %q", raw)
	}
	if got.Port != 24784 || got.Token != testToken {
		t.Fatalf("port file = %+v", got)
	}
}

func TestNewTokenIsRandomHex(t *testing.T) {
	a, err := newToken()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := newToken()
	if len(a) != 64 || a == b {
		t.Fatalf("tokens %q %q", a, b)
	}
}

func TestRemovePortFileLeavesOtherOwner(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mcp-port")
	if err := writePortFile(path, 24784, "other-token"); err != nil {
		t.Fatal(err)
	}
	removePortFileIfOwned(path, testToken)
	if _, err := os.Stat(path); err != nil {
		t.Fatal("removed a port file owned by another bridge")
	}
	if err := writePortFile(path, 24784, testToken); err != nil {
		t.Fatal(err)
	}
	removePortFileIfOwned(path, testToken)
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("own port file was not removed")
	}
}
