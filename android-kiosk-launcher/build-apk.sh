#!/usr/bin/env bash
set -euo pipefail

if [ -x "./gradlew" ]; then
  GRADLE=./gradlew
elif command -v gradle >/dev/null 2>&1; then
  gradle wrapper --gradle-version 8.9
  GRADLE=./gradlew
else
  echo "Neither ./gradlew nor system gradle found. Open android-kiosk-launcher in Android Studio or push to GitHub to run .github/workflows/main.yml."
  exit 1
fi

# Release build, signed with the committed kiosk-release.jks so the resulting
# APK installs over earlier KioskOS downloads instead of asking for a reinstall.
$GRADLE assembleRelease

APK=app/build/outputs/apk/release/app-release.apk
cp "$APK" ../public/downloads/KioskOS.apk

# Refresh the version/size the website shows from the APK that was just copied.
(cd .. && node scripts/apk-meta.mjs)

echo "Signed APK built and copied to public/downloads/KioskOS.apk"
