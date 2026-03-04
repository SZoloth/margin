VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

.PHONY: build clean install

build:
	go build -ldflags "-X github.com/nicholasgasior/margin/cli/cmd.Version=$(VERSION)" -o margin .

clean:
	rm -f margin

install: build
	install -d $(HOME)/.local/bin
	install -m 755 margin $(HOME)/.local/bin/margin
