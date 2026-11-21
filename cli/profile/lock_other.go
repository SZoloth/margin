//go:build !unix

package profile

func lockFile(string) (func(), error) { return func() {}, nil }
