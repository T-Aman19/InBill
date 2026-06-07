#!/usr/bin/env bash
# Build the Bun server into a standalone binary and place it as the Tauri sidecar.
#
# Run from the REPO ROOT:
#   bash apps/desktop/src-tauri/build-server-sidecar.sh
#
# The binary name must match the Tauri externalBin convention:
#   binaries/inbill-server-<target-triple>
# where <target-triple> is the output of `rustc -vV | grep host`.
set -euo pipefail

# ── Guard: must be run from repo root ────────────────────────────────────────
if [ ! -f "package.json" ] || [ ! -d "apps/server" ]; then
  echo "Error: run this script from the repo root, not from inside src-tauri/"
  exit 1
fi

# ── Detect target triple ──────────────────────────────────────────────────────
TARGET=$(rustc -vV 2>/dev/null | grep "host:" | awk '{print $2}')
if [ -z "$TARGET" ]; then
  echo "Error: rustc not found. Install Rust first: https://rustup.rs"
  exit 1
fi

echo "==> Building sidecar for: $TARGET"

# ── Ensure bun is available ───────────────────────────────────────────────────
BUN="${BUN_PATH:-$(which bun 2>/dev/null || echo "$HOME/.bun/bin/bun")}"
if [ ! -x "$BUN" ]; then
  echo "Error: bun not found. Install from https://bun.sh"
  exit 1
fi

# ── Build the server binary ───────────────────────────────────────────────────
OUT="apps/desktop/src-tauri/binaries/inbill-server-${TARGET}"

echo "==> Compiling server → $OUT"
"$BUN" build apps/server/src/index.ts \
  --compile \
  --target=bun \
  --outfile "$OUT"

chmod +x "$OUT"
echo "==> Done: $OUT ($(du -sh "$OUT" | cut -f1))"
