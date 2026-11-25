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
- Kiosk enforcement needs both the opt-in and Home ownership. `admin/PolicyGate.kt` is the
  single rule `applyPolicy()` follows: enforce only while the recorded state is on **and**
  Android resolves Home to this app; release every restriction, uninstall block, lock-task
  package and suspended browser as soon as the state is turned off or another launcher owns
  Home; leave the device untouched when Home does not resolve. Release must undo everything
  enforce sets except lock task features, which are re-derived from the toggles and must
  never be reset to `LOCK_TASK_FEATURE_NONE`. The Home pin is opt-in ("Default launcher" in Admin), and lock task also needs
  the app to be the default launcher, so a device-owner install cannot trap a phone that
  never opted in.
- Kiosk intent is an explicit persisted state (`kiosk_enabled`), not a side effect of
  Home ownership. `KioskActivation.resolve` runs once on installs that predate the flag:
  a recorded choice wins, then 1.3.1's `home_launcher_declined`, then the fact that Home
  already resolves to this app. Only an install that never owned Home is released, so an
  upgrade cannot quietly un-kiosk a device that was already running as a kiosk. Admin
  shows the state next to the Default launcher switch, and turning it off releases policy
  immediately instead of waiting for Home to change.
- Uninstall blocking is per package (`setUninstallBlocked`), pushed on a worker. The
  app never blocks removal of its own package. Blocked packages are recorded in
  `uninstall_blocked_packages` so turning the toggle off releases them. The full sweep of
  every installed package runs once (`uninstall_release_swept`) to clear leftovers from
  builds that kept no record; later release passes only touch the recorded packages, so
  cold starts with the kiosk off do no package walk.
- Admin's "Remove device ownership" releases the policy and the recorded uninstall blocks
  synchronously, clears the Home pin and lock task packages, then calls
  `clearDeviceOwnerApp` and removes the admin, so the app can be uninstalled without adb
  or a factory reset. That call is deprecated but is the only in-app handover; a refusal
  is reported as a failure rather than treated as success.
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
