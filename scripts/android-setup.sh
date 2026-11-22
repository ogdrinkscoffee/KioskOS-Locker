#!/usr/bin/env bash
# Installs a self-contained JDK 17 + Android SDK + Gradle 8.9 under $HOME/tools.
# No root required. Safe to re-run.
set -euo pipefail

TOOLS="$HOME/tools"
SDK="$HOME/android-sdk"
mkdir -p "$TOOLS" "$SDK"

log() { echo "[setup] $*"; }

# 1. JDK 17 (Temurin)
if [ ! -x "$TOOLS/jdk/bin/java" ]; then
  log "downloading JDK 17"
  curl -fsSL -o /tmp/jdk.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p "$TOOLS/jdk"
  tar -xzf /tmp/jdk.tar.gz -C "$TOOLS/jdk" --strip-components=1
  rm -f /tmp/jdk.tar.gz
fi
export JAVA_HOME="$TOOLS/jdk"
export PATH="$JAVA_HOME/bin:$PATH"
log "java $(java -version 2>&1 | head -1)"

# 2. Android cmdline-tools
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  log "downloading cmdline-tools"
  curl -fsSL -o /tmp/cmdline.zip \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  mkdir -p "$SDK/cmdline-tools"
  unzip -q -o /tmp/cmdline.zip -d "$SDK/cmdline-tools"
  mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest" 2>/dev/null || true
  rm -f /tmp/cmdline.zip
fi
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"

log "accepting licenses"
yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true

# `yes` gets SIGPIPE when sdkmanager exits; pipefail would abort the script, so
# the pipeline runs with pipefail disabled.
log "installing platform-tools, platform 35, build-tools 35.0.0"
set +o pipefail
(yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" \
  "platform-tools" "platforms;android-35" "build-tools;35.0.0" 2>&1 | tail -3) || true
set -o pipefail

# 3. Gradle 8.9 (AGP 8.7.2 requires >= 8.9)
if [ ! -x "$TOOLS/gradle-8.9/bin/gradle" ]; then
  log "downloading Gradle 8.9"
  curl -fsSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-8.9-bin.zip"
  unzip -q -o /tmp/gradle.zip -d "$TOOLS"
  rm -f /tmp/gradle.zip
fi

log "gradle $("$TOOLS/gradle-8.9/bin/gradle" --version 2>/dev/null | grep '^Gradle' || echo ok)"
log "DONE"
