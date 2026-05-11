#!/usr/bin/env bash
# Compile the Bun server into a standalone binary and place it as the Tauri sidecar.
# Run from the repo root: bash apps/desktop/src-tauri/build-server-sidecar.sh
set -euo pipefail

# Detect target triple for Tauri sidecar naming convention
TARGET=$(rustc -vV 2>/dev/null | grep "host:" | awk '{print $2}')
if [ -z "$TARGET" ]; then
  echo "Error: rustc not found. Install Rust first."
  exit 1
fi

echo "Building server sidecar for target: $TARGET"

cd apps/server
bun build src/index.ts \
  --compile \
  --outfile "../desktop/src-tauri/binaries/inbill-server-${TARGET}"
echo "Sidecar written to apps/desktop/src-tauri/binaries/inbill-server-${TARGET}"
