# NodePulse Agent Makefile
# Cross-compilation for multiple Linux architectures

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')
LDFLAGS := -s -w -X main.Version=$(VERSION)

BINARY_NAME := nodepulse-agent
DIST_DIR := dist

.PHONY: all clean build-all build-amd64 build-arm64 build-armv7 build-armv6

all: build-all

clean:
	rm -rf $(DIST_DIR)

# Build for all platforms
build-all: clean build-amd64 build-arm64 build-armv7 build-armv6
	@echo "Build complete. Binaries in $(DIST_DIR)/"
	@ls -lh $(DIST_DIR)/

# Linux AMD64 (Standard servers, x86_64)
build-amd64:
	@mkdir -p $(DIST_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
		-ldflags="$(LDFLAGS)" \
		-o $(DIST_DIR)/$(BINARY_NAME)-linux-amd64 \
		./cmd/nodepulse-agent
	@echo "Built: $(DIST_DIR)/$(BINARY_NAME)-linux-amd64"

# Linux ARM64 (Pi 4, modern ARM servers)
build-arm64:
	@mkdir -p $(DIST_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build \
		-ldflags="$(LDFLAGS)" \
		-o $(DIST_DIR)/$(BINARY_NAME)-linux-arm64 \
		./cmd/nodepulse-agent
	@echo "Built: $(DIST_DIR)/$(BINARY_NAME)-linux-arm64"

# Linux ARMv7 (Pi 3, Pi 2 v1.2)
build-armv7:
	@mkdir -p $(DIST_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build \
		-ldflags="$(LDFLAGS)" \
		-o $(DIST_DIR)/$(BINARY_NAME)-linux-armv7 \
		./cmd/nodepulse-agent
	@echo "Built: $(DIST_DIR)/$(BINARY_NAME)-linux-armv7"

# Linux ARMv6 (Pi 2B, Pi 1, Pi Zero) - CRITICAL for older Pis!
build-armv6:
	@mkdir -p $(DIST_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=6 go build \
		-ldflags="$(LDFLAGS)" \
		-o $(DIST_DIR)/$(BINARY_NAME)-linux-armv6 \
		./cmd/nodepulse-agent
	@echo "Built: $(DIST_DIR)/$(BINARY_NAME)-linux-armv6"

# Development build (native platform)
build-dev:
	go build -ldflags="$(LDFLAGS)" -o $(BINARY_NAME) ./cmd/nodepulse-agent

# Run tests
test:
	go test -v ./...

# Format code
fmt:
	go fmt ./...

# Check for issues
vet:
	go vet ./...

# Show version
version:
	@echo $(VERSION)
