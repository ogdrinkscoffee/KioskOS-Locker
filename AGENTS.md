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
- **The launcher never hides the navigation bar.** Under lock task that bar is the Home
  button SystemUI offers, so hiding it reproduces the dead-Home failure of
  `LOCK_TASK_FEATURE_NONE`. Only the status bar follows its Admin toggle. A Home press must
  always reach the grid: `KioskLauncherActivity.onNewIntent` cancels the single/browser mode
  auto-launch, which otherwise bounces the first Home press straight back into the pinned app.
  Do not add an in-app "Home" button to the grid; starting the activity that already holds it
  is a no-op.
- **The custom lock screen has one trigger.** `KioskLauncherActivity` calls
  `LockScreenController.onKioskVisible` from `onResume`/`onWindowFocusChanged`, so the start
  is a foreground start; `ACTION_SCREEN_OFF` and the activity's own display-off `onStop` only
  record `lockScreenPending` (and the boot receiver sets it) so a wake the process never saw,
  or one whose process was reclaimed, still locks on the next resume. `ACTION_SCREEN_OFF` is
  registered `RECEIVER_EXPORTED` because Android may refuse system broadcasts to a
  `NOT_EXPORTED` receiver; it is a protected broadcast, so nothing else can send it. Do not
  start it from a broadcast receiver: that is a background activity start Android 10+ may
  drop silently, and the per-device workarounds for it (device-owner exemption, full-screen
  intents, notification grants) were removed as unnecessary.
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
- **The kiosk restores itself.** `recovery/RecoveryPolicy.kt` is the entire decision and is
  unit-tested: only a kiosk with one of its own screens in front whose process then stopped
  refreshing its heartbeat may be restored. A kiosk app, the lock screen, a dark display, the
  admin window and an update install all leave every activity paused, so none of them may be
  interrupted; a kiosk that is off, or whose Home another launcher owns, is never fought for.
  `recovery/KioskWatchdog.kt` keeps one repeating alarm armed from `applyPolicy()`, and
  `recovery/KioskWatchdogReceiver.kt` re-applies policy and starts the launcher. `KioskApplication`
  installs an uncaught-exception handler that records the crash and arms a 3-second retry, then
  lets the process die. Recovery is the one receiver-initiated activity start, on purpose: a
  kiosk with no adb has no other way back, and a device owner is exempt from the restriction.
  `KioskApplication` owns the two signals: an activity-lifecycle count for whether a screen is
  in front, and a 30-second heartbeat loop for whether the process is alive. Both live in
  `kiosk_prefs`, so they outlive the process that wrote them; the heartbeat's first beat is
  delayed on purpose, or a process restarted by the watchdog would erase the evidence.
- **Scheduled kiosk mode is fail-closed.** `schedule/KioskSchedule.kt` is pure and
  unit-tested (windows are day-masked wall-clock ranges, may cross midnight, and are evaluated
  in the device zone so both DST transitions behave). A schedule that is enabled but unreadable,
  or has no windows, counts as *kiosk time*: a typo must not hand a pinned device back as a
  normal phone. Outside a real window `isWithinKioskHours()` is false, and `PolicyGate` releases
  everything while the opt-in stays recorded, so the next window enforces on its own. The
  allowlist becomes two lists, weekday and weekend, picked by the local day; the legacy single
  list is seeded into both when the schedule is first enabled and still drives the kiosk with the
  schedule off. `schedule/ScheduleAlarm.kt` keeps one alarm on the next flip, computed by walking
  real minutes (no offset arithmetic), re-armed from `applyPolicy()` so boot and updates recover
  it, and re-checked on a clock or time-zone change. Only an activity can leave lock task, so
  `enterLockTask` releases it the moment the launcher resumes out of hours.
- The temporary admin window has a configurable length (`adminUnlockMinutes`) and is
  closed by an alarm, not only by returning to Home. `admin/AdminWindowExpiry.kt` schedules
  it from `applyPolicy()` so every grant path and every cold start agree on the stored
  deadline, and `receiver/AdminWindowReceiver.kt` closes the window and re-applies policy
  from the manifest — the admin is in system Settings by then, where the launcher is stopped
  and its timer is not running. The receiver deliberately starts no activity; the launcher
  re-enters lock task on the next Home press. A launcher-side tick remains as a backstop,
  and `KioskLauncherActivity` closes a window that ran out while it was away.

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
