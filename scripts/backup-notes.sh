#!/bin/bash
# Copies the live notes into notes/store.json so they can be committed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ORGANIZER_SUPPORT_DIR:-$HOME/Library/Application Support/DesktopOrganizer}/store.json"
mkdir -p "$ROOT/notes"
if [ ! -f "$SRC" ]; then
  echo "No notes file at $SRC" >&2
  exit 1
fi
cp "$SRC" "$ROOT/notes/store.json"
echo "Copied notes to notes/store.json"
