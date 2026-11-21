#!/usr/bin/env bash
set -euo pipefail

if [ -x "./gradlew" ]; then
  ./gradlew assembleDebug
elif command -v gradle >/dev/null 2>&1; then
  gradle wrapper --gradle-version 8.9
  ./gradlew assembleDebug
else
  echo "Neither ./gradlew nor system gradle found. Open android-kiosk-launcher in Android Studio or push to GitHub to run .github/workflows/build-apk.yml."
  exit 1
fi

echo "APK built at: app/build/outputs/apk/debug/app-debug.apk"
