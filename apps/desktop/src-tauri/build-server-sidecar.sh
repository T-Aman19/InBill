#!/usr/bin/env bash
# Thin wrapper kept for muscle memory — the real logic now lives in the
# cross-platform Bun script (works on macOS, Linux, and Windows without bash):
#
#   bun run apps/desktop/scripts/prepare-build.ts --sidecar-only
#
# Extra arguments are passed through, e.g.:
#   bash apps/desktop/src-tauri/build-server-sidecar.sh --target x86_64-pc-windows-msvc
#   bash apps/desktop/src-tauri/build-server-sidecar.sh --target all
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUN="${BUN_PATH:-$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")}"
if [ ! -x "$BUN" ]; then
  echo "Error: bun not found. Install from https://bun.sh"
  exit 1
fi

exec "$BUN" run "$SCRIPT_DIR/../scripts/prepare-build.ts" --sidecar-only "$@"
