#!/bin/bash
# Installs a LaunchAgent that refreshes the Salesforce copy every day at the configured time.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="local.desktop.organizer.salesforce-sync"
SCRIPT="$HOME/Organizer/Organizer.app/Contents/Resources/salesforce_sync.py"
LOG_DIR="$HOME/Library/Logs/Organizer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# Read "7:00 AM" style refreshTime from config.js without Node: match the quoted value.
REFRESH_TIME="$(sed -n 's/.*refreshTime: *"\([^"]*\)".*/\1/p' "$ROOT/Resources/config.js" | head -1)"
REFRESH_TIME="${REFRESH_TIME:-7:00 AM}"
HOUR="$(echo "$REFRESH_TIME" | sed -E 's/^([0-9]+):.*/\1/')"
MINUTE="$(echo "$REFRESH_TIME" | sed -E 's/^[0-9]+:([0-9]+).*/\1/')"
MINUTE="$((10#$MINUTE))"
if echo "$REFRESH_TIME" | grep -qi "PM" && [ "$HOUR" -lt 12 ]; then HOUR=$((HOUR + 12)); fi
if echo "$REFRESH_TIME" | grep -qi "AM" && [ "$HOUR" -eq 12 ]; then HOUR=0; fi

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$SCRIPT</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$HOUR</integer>
    <key>Minute</key>
    <integer>$MINUTE</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/salesforce-sync.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/salesforce-sync.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$HOME/.local/sf/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL to run daily at $REFRESH_TIME ($HOUR:$(printf '%02d' "$MINUTE"))."
