#!/bin/bash
# Copies notes/store.json back to the folder Mission Control reads.
# An existing notes file is kept beside it, named store.before-restore-<time>.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/notes/store.json"
DEST_DIR="${ORGANIZER_SUPPORT_DIR:-$HOME/Library/Application Support/DesktopOrganizer}"
DEST="$DEST_DIR/store.json"
if [ ! -f "$SRC" ]; then
  echo "No backup at notes/store.json" >&2
  exit 1
fi
mkdir -p "$DEST_DIR"
if [ -f "$DEST" ]; then
  cp "$DEST" "$DEST_DIR/store.before-restore-$(date +%s).json"
fi
cp "$SRC" "$DEST"
echo "Restored notes to $DEST"
