package output

import (
	"encoding/json"
	"fmt"
	"os"
)

// JSON marshals v to stdout. If pretty is true, indents with two spaces.
func JSON(v any, pretty bool) {
	var data []byte
	var err error
	if pretty {
		data, err = json.MarshalIndent(v, "", "  ")
	} else {
		data, err = json.Marshal(v)
	}
	if err != nil {
		Error(err.Error())
		return
	}
	fmt.Println(string(data))
}

// Error writes an error JSON to stderr and exits with code 1.
func Error(msg string) {
	data, _ := json.Marshal(map[string]string{"error": msg})
	fmt.Fprintln(os.Stderr, string(data))
	os.Exit(1)
}

// ErrorE is a convenience for Error from an error value.
func ErrorE(err error) {
	Error(err.Error())
}
