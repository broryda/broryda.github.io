#!/usr/bin/env bash
set -euo pipefail

# iOS release archive/export script (run on macOS only).
# Usage:
#   bash ./scripts/build_ios_release.sh

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS (Darwin)."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$ROOT_DIR/ios"
ARCHIVE_PATH="$IOS_DIR/build/SahwalReact.xcarchive"
EXPORT_DIR="$IOS_DIR/build/export"
EXPORT_OPTIONS_PLIST="$IOS_DIR/ExportOptions.plist"

cd "$ROOT_DIR"

echo "[1/4] Install JS dependencies"
npm install

echo "[2/4] Install CocoaPods dependencies"
cd "$IOS_DIR"
bundle exec pod install

echo "[3/4] Build archive"
xcodebuild \
  -workspace SahwalReact.xcworkspace \
  -scheme SahwalReact \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  clean archive

if [[ ! -f "$EXPORT_OPTIONS_PLIST" ]]; then
  echo "Missing ExportOptions.plist at: $EXPORT_OPTIONS_PLIST"
  echo "Create this file for your signing/distribution method, then re-run."
  exit 1
fi

echo "[4/4] Export IPA"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST"

echo "Done. Check IPA output in: $EXPORT_DIR"
