package db

import "testing"

func TestSanitizeFTSQuery(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty", "", ""},
		{"whitespace only", "   ", ""},
		{"simple word", "hello", `"hello"*`},
		{"two words", "hello world", `"hello"* "world"*`},
		{"strips quotes", `"hello" 'world'`, `"hello"* "world"*`},
		{"strips FTS operators", "AND OR NOT NEAR", ""},
		{"case insensitive operators", "and or not near", ""},
		{"mixed operators and words", "hello AND world", `"hello"* "world"*`},
		{"strips parens and braces", "hello(world) {test}", `"helloworld"* "test"*`},
		{"strips colons and carets", "field:value ^boost", `"fieldvalue"* "boost"*`},
		{"preserves hyphens and underscores", "cover-letter my_doc", `"cover-letter"* "my_doc"*`},
		{"strips special chars from words", "hello@world.com", `"helloworldcom"*`},
		{"unicode letters", "café résumé", `"café"* "résumé"*`},
		{"only special chars", "!@#$%", ""},
		{"prefix match format", "test", `"test"*`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SanitizeFTSQuery(tt.input)
			if got != tt.expected {
				t.Errorf("SanitizeFTSQuery(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}
