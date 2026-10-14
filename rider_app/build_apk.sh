#!/usr/bin/env bash
# Build a rider_app APK with the build number auto-incremented.
#
# Usage:
#   ./build_apk.sh            # debug APK (fast, no signing needed — good for testing)
#   ./build_apk.sh release    # release APK (smaller/faster app, still debug-signed
#                              # since no release keystore is configured yet)
#
# Every run bumps pubspec.yaml's build number (the part after '+', e.g. 1.0.0+3 →
# 1.0.0+4) and copies the built APK into releases/ named with that version, so old
# builds never get overwritten and you can always tell which one is newest.
set -euo pipefail
cd "$(dirname "$0")"

MODE="${1:-debug}"
if [[ "$MODE" != "debug" && "$MODE" != "release" ]]; then
  echo "Usage: ./build_apk.sh [debug|release]" >&2
  exit 1
fi

CURRENT=$(grep '^version:' pubspec.yaml | sed 's/version: //')
VERSION_NAME="${CURRENT%+*}"
BUILD_NUMBER="${CURRENT#*+}"
NEXT_BUILD=$((BUILD_NUMBER + 1))
NEW_VERSION="${VERSION_NAME}+${NEXT_BUILD}"

echo "Bumping version: ${CURRENT} -> ${NEW_VERSION}"
sed -i '' "s/^version: .*/version: ${NEW_VERSION}/" pubspec.yaml

echo "Building ${MODE} APK..."
flutter build apk --${MODE}

mkdir -p releases
SRC="build/app/outputs/flutter-apk/app-${MODE}.apk"
DEST="releases/rider_app-${NEW_VERSION}-${MODE}.apk"
cp "$SRC" "$DEST"

echo ""
echo "Done."
echo "Version: ${NEW_VERSION}"
echo "APK:     $(pwd)/${DEST}"
