#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/Organizer.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -swift-version 5 -O -o "$APP/Contents/MacOS/Organizer" \
  "$ROOT/Sources/main.swift" \
  -framework AppKit -framework WebKit -lsqlite3
cp "$ROOT/Resources/"* "$APP/Contents/Resources/"
cp "$ROOT/Info.plist" "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP"
echo "Built $APP"
