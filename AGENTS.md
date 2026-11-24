# Project notes

Ironclad OS: an Android kiosk launcher (`android-kiosk-launcher/`) plus a marketing /
docs site (Vite + React) that also serves the APK.

## Android policy decisions worth remembering

- **Lock task features are derived from toggles** in `admin/LockTaskFeatures.kt`. Never
  go back to `LOCK_TASK_FEATURE_NONE`: Android documents it as disabling the system info
  area, notification shade, Home button, Recents, power menu *and* keyguard, which
  overrides every Admin toggle. `LOCK_TASK_FEATURE_HOME` is always kept on; inside lock
  task it only returns to the default launcher, which is this app.
- **The keyguard cannot be disabled while a lock password exists.** Android returns
  `false` from `setKeyguardDisabled`. The toggle is respected but the device's own lock
  screen still wins; diagnostics report it as not applied rather than pretending.
- Uninstall blocking is per package (`setUninstallBlocked`), pushed on a worker. The
  app never blocks removal of its own package.
- The temporary admin window has a configurable length (`adminUnlockMinutes`) and is
  closed by a launcher-side timer, not only by returning to Home.

## In-app updates

- `update/UpdateManifest.kt` parses the feed. `sha256`, `sizeBytes` and an `https://`
  `apkUrl` are mandatory; anything else is rejected as "no update".
- `scripts/apk-meta.mjs` writes both `src/generated/apkMeta.ts` and
  `public/downloads/latest.json`. `--check` fails if either disagrees with the shipped
  APK, and CI runs it.
- The feed origin comes from `UPDATE_FEED_BASE_URL` (default
  `https://ironclad-os.freecode.page`); the app's fallback lives in the
  `update_default_feed` string resource.

## Android unit tests

- Anything touching `org.json` **or** `Build.VERSION.SDK_INT` must run under
  Robolectric (`@RunWith(RobolectricTestRunner::class)`, `@Config(sdk = [35])`).
  In a plain JVM test `SDK_INT` is 0 and `org.json` is an unimplemented stub, so such
  tests silently pass or fail for the wrong reason.

## Building

- There is no committed Gradle wrapper jar. CI uses `gradle/actions/setup-gradle` with
  the version in `gradle/wrapper/gradle-wrapper.properties` (8.9). Locally, either use
  Android Studio or run `android-kiosk-launcher/build-apk.sh` with Gradle on `PATH`.
- Release signing uses the committed `kiosk-release.jks` on purpose, so updates install
  over the previous build.
