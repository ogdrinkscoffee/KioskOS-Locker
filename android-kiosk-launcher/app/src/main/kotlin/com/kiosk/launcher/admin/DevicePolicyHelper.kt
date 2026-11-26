package com.kiosk.launcher.admin

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.app.role.RoleManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import com.kiosk.launcher.R
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.recovery.KioskWatchdog
import com.kiosk.launcher.recovery.RecoveryPolicy
import com.kiosk.launcher.schedule.ScheduleAlarm
import com.kiosk.launcher.ui.KioskLauncherActivity
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

/**
 * Every DevicePolicyManager call is wrapped: the app runs as a normal launcher in
 * preview mode and only enforces policy when it is the device owner.
 *
 * Policy is idempotent and safe to call repeatedly; [applyPolicy] is the single place
 * that turns preferences into device state, so leaving a screen, expiring the admin
 * window and booting all converge on the same calls.
 */
class DevicePolicyHelper(context: Context) {

    private val appContext: Context = context.applicationContext
    private val dpm: DevicePolicyManager =
        appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val admin = ComponentName(appContext, KioskDeviceAdminReceiver::class.java)
    private val prefs = KioskPreferences(appContext)
    private val systemResolver = SystemFeatureResolver(appContext)

    val isDeviceOwner: Boolean
        get() = runCatching { dpm.isDeviceOwnerApp(appContext.packageName) }.getOrDefault(false)

    val isAdminActive: Boolean
        get() = runCatching { dpm.isAdminActive(admin) }.getOrDefault(false)

    /** Outcome of [relinquishDeviceOwner]. */
    enum class OwnershipRelease { NOT_OWNER, RELEASED, FAILED }

    fun applyPolicy() {
        // Keeps the window's alarm in step with its deadline, including on a cold start long
        // after it was granted. Done before the owner check: the deadline is recorded state,
        // not policy, so a preview install still closes its own window.
        AdminWindowExpiry.sync(appContext, prefs)
        // One place arms or disarms the crash watchdog: enabling the kiosk arms it, switching it
        // off disarms it, and a cold start or boot re-arms it.
        KioskWatchdog.sync(
            appContext,
            watch = RecoveryPolicy.shouldWatch(prefs.kioskEnabled, isDefaultLauncher)
        )
        // Arms the boundary alarm on the next schedule flip, and cancels it when the schedule is
        // off. Doing it here is what covers boot and an update, which lose every alarm.
        ScheduleAlarm.sync(appContext)
        if (!isDeviceOwner) return
        systemResolver.invalidateCache()

        // The explicit kiosk state is the opt-in; Home ownership only decides whether it can
        // take effect. [PolicyGate] owns the rule, including releasing as soon as the kiosk
        // is switched off instead of waiting for Home to change.
        when (
            PolicyGate.decide(
                kioskEnabled = prefs.kioskEnabled,
                isDefaultLauncher = isDefaultLauncher,
                anotherLauncherOwnsHome = anotherLauncherOwnsHome,
                scheduleKioskActive = prefs.isWithinKioskHours()
            )
        ) {
            PolicyGate.Action.ENFORCE -> enforcePolicy()
            PolicyGate.Action.RELEASE -> releasePolicy()
            // Home did not resolve, so leave the device alone rather than guess.
            PolicyGate.Action.LEAVE -> Unit
        }
    }

    private fun enforcePolicy() {
        val state = restrictionState()

        // The status bar toggle must win over lock task. LOCK_TASK_FEATURE_NONE used to
        // hide the shade no matter what was switched off here.
        runCatching { dpm.setStatusBarDisabled(admin, state.statusBarDisabled) }

        // Re-enabling needs no extra permission; disabling returns false when the device
        // has a lock password, which the diagnostics surface as "not applied".
        runCatching { dpm.setKeyguardDisabled(admin, state.keyguardDisabled) }
        runCatching { dpm.setCameraDisabled(admin, state.cameraDisabled) }
        runCatching { dpm.setScreenCaptureDisabled(admin, state.screenCaptureDisabled) }
        runCatching { dpm.setLockTaskPackages(admin, lockTaskPackages()) }
        applyLockTaskFeatures()

        state.userRestrictions.forEach { (key, enabled) ->
            runCatching {
                if (enabled) dpm.addUserRestriction(admin, key)
                else dpm.clearUserRestriction(admin, key)
            }
        }

        runCatching {
            dpm.setPackagesSuspended(admin, UNSUPPORTED_BROWSERS, state.suspendUnsupportedBrowsers)
        }

        runCatching {
            dpm.setGlobalSetting(
                admin,
                Settings.Global.STAY_ON_WHILE_PLUGGED_IN,
                state.stayAwakeSetting
            )
        }

        // DISALLOW_APPS_CONTROL alone only hides the buttons in Settings on some builds;
        // blocking every installed package explicitly is what actually refuses an uninstall.
        applyUninstallPolicy(block = state.blockPackageUninstalls)

        prefs.logPolicy("Policy applied")
    }

    /**
     * Undoes everything [enforcePolicy] can set, so switching the kiosk off (or picking
     * another Home app) hands the device back instead of leaving restrictions behind.
     * Every call is idempotent and only runs while this app is the device owner.
     */
    private fun releasePolicy() {
        clearEnforcedState()
        applyUninstallPolicy(block = false)
    }

    /** Undoes the fast policy calls; shared by turning the kiosk off and handing back ownership. */
    private fun clearEnforcedState() {
        runCatching { dpm.setStatusBarDisabled(admin, false) }
        runCatching { dpm.setKeyguardDisabled(admin, false) }
        runCatching { dpm.setCameraDisabled(admin, false) }
        runCatching { dpm.setScreenCaptureDisabled(admin, false) }
        KioskRestrictions.allClearedRestrictionKeys().forEach { key ->
            runCatching { dpm.clearUserRestriction(admin, key) }
        }
        runCatching { dpm.setPackagesSuspended(admin, UNSUPPORTED_BROWSERS, false) }
        // Release is the mirror of enforce for lock task too: no package may start it. The
        // features themselves are re-derived from the toggles on the next enforce pass and
        // are never set to LOCK_TASK_FEATURE_NONE, which would override every Admin toggle.
        runCatching { dpm.setLockTaskPackages(admin, arrayOf<String>()) }
        runCatching {
            dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "0")
        }
    }

    /**
     * Takes this app out of device ownership so the phone can be uninstalled like any other
     * app, without adb or a factory reset. Everything the kiosk set is released while the
     * owner rights still exist, because the restriction and uninstall calls stop working
     * the moment ownership is cleared.
     *
     * [DevicePolicyManager.clearDeviceOwnerApp] is deprecated but is still the only way for
     * the owner app itself to hand the device back. Some manufacturers refuse it; the
     * result then reports [OwnershipRelease.FAILED] instead of pretending it worked.
     */
    @Suppress("DEPRECATION")
    fun relinquishDeviceOwner(): OwnershipRelease {
        if (!isDeviceOwner) {
            if (isAdminActive) runCatching { dpm.removeActiveAdmin(admin) }
            return OwnershipRelease.NOT_OWNER
        }

        clearEnforcedState()
        // Clearing ownership is only best-effort about leftovers, so the recorded uninstall
        // blocks are released synchronously first; otherwise apps stay un-uninstallable on
        // the freed phone. The full one-time sweep also runs here instead of in the worker.
        releaseUninstallBlocksNow()
        runCatching { dpm.clearPackagePersistentPreferredActivities(admin, appContext.packageName) }

        val cleared = runCatching { dpm.clearDeviceOwnerApp(appContext.packageName) }.isSuccess
        if (isAdminActive) runCatching { dpm.removeActiveAdmin(admin) }

        prefs.kioskEnabled = false
        val released = cleared && !isDeviceOwner
        prefs.logPolicy(
            appContext.getString(
                if (released) R.string.log_release_owner else R.string.log_release_owner_failed
            )
        )
        return if (released) OwnershipRelease.RELEASED else OwnershipRelease.FAILED
    }

    /** Feature flags for lock task, derived from the same toggles as the rest of the policy. */
    fun applyLockTaskFeatures() {
        if (!isDeviceOwner || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        val unlocked = prefs.isAdminTemporarilyUnlocked()
        val features = LockTaskFeatures.compute(
            statusBarLocked = prefs.statusBarLocked && !unlocked,
            keyguardDisabled = prefs.keyguardDisabled,
            blockActivityStartInTask = prefs.isPanicLocked()
        )
        runCatching { dpm.setLockTaskFeatures(admin, features) }
    }

    /**
     * Explicitly clears app-control & uninstall restrictions even if PolicyGate would leave
     * the device untouched (for example while Home is transiently unresolved).
     */
    fun forceReleaseAppControl() {
        if (!isDeviceOwner) return
        runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_APPS_CONTROL) }
        prefs.uninstallReleaseSwept = false
        applyUninstallPolicy(block = false, forceSweep = true)
        refreshLockTaskPackages()
    }

    /**
     * Keeps lock task allowlist and uninstall blocks consistent when apps are installed,
     * updated, or removed while the kiosk is active.
     */
    fun onPackagesChanged(changedPackage: String? = null) {
        if (!isDeviceOwner) return
        systemResolver.invalidateCache()
        if (prefs.kioskEnabled != true || !isDefaultLauncher) return

        val unlocked = prefs.isAdminTemporarilyUnlocked()
        if ((!prefs.disallowAppsControl || unlocked) &&
            !changedPackage.isNullOrBlank() &&
            changedPackage != appContext.packageName
        ) {
            worker.execute {
                if (runCatching { dpm.isUninstallBlocked(admin, changedPackage) }.getOrDefault(false)) {
                    setUninstallBlocked(changedPackage, false)
                }
                val recorded = prefs.uninstallBlockedPackages()
                if (changedPackage in recorded) {
                    prefs.setUninstallBlockedPackages(recorded - changedPackage)
                }
            }
        } else if (prefs.disallowAppsControl && !unlocked &&
            !changedPackage.isNullOrBlank() &&
            changedPackage != appContext.packageName &&
            changedPackage !in protectedFromUninstallLockPackages()
        ) {
            worker.execute {
                if (setUninstallBlocked(changedPackage, true)) {
                    prefs.setUninstallBlockedPackages(prefs.uninstallBlockedPackages() + changedPackage)
                }
            }
        }

        if (prefs.allowAllApps || !prefs.disallowAppsControl || unlocked) {
            refreshLockTaskPackages()
        }
    }

    /**
     * Blocking runs per package, so it is pushed to a worker: both calls walk the whole
     * package list. A monotonic [uninstallPassId] aborts superseded blocking passes and
     * reading persisted state inside the worker prevents a fast toggle-off from reading
     * empty preferences before a queued block pass finishes writing.
     */
    private fun applyUninstallPolicy(block: Boolean, forceSweep: Boolean = false) {
        val passId = uninstallPassId.incrementAndGet()
        if (block) {
            worker.execute {
                if (uninstallPassId.get() != passId) return@execute
                val removable = removablePackages() ?: return@execute
                val protectedPackages = protectedFromUninstallLockPackages()
                val blocked = prefs.uninstallBlockedPackages().toMutableSet()

                // Never leave essential calling/Google/system helpers uninstall-blocked.
                blocked.filter { it == appContext.packageName || it in protectedPackages }
                    .forEach { protectedPkg ->
                        if (setUninstallBlocked(protectedPkg, false)) blocked -= protectedPkg
                    }

                for (packageName in UninstallBlocks.blockTargets(removable, appContext.packageName, protectedPackages)) {
                    if (uninstallPassId.get() != passId) {
                        prefs.setUninstallBlockedPackages(blocked)
                        return@execute
                    }
                    if (setUninstallBlocked(packageName, true)) blocked += packageName
                }
                prefs.setUninstallBlockedPackages(blocked)
            }
            return
        }

        worker.execute {
            val recorded = prefs.uninstallBlockedPackages()
            val sweep = forceSweep || !prefs.uninstallReleaseSwept
            if (!forceSweep && !UninstallBlocks.releaseNeeded(recorded, !sweep)) return@execute

            val installedAll = installedPackages()
            val installedForSweep = if (sweep) installedAll else null
            val installedNames = installedAll?.toSet()
            val failed = mutableSetOf<String>()
            UninstallBlocks.releaseTargets(recorded, installedForSweep, appContext.packageName)
                .forEach { packageName ->
                    val shouldUnblock = packageName in recorded ||
                        runCatching { dpm.isUninstallBlocked(admin, packageName) }.getOrDefault(true)
                    if (!shouldUnblock) return@forEach
                    val released = setUninstallBlocked(packageName, false)
                    if (!released && (installedNames == null || packageName in installedNames)) {
                        failed += packageName
                    }
                }
            prefs.setUninstallBlockedPackages(failed)
            if (sweep && installedAll != null) prefs.uninstallReleaseSwept = true
        }
    }

    /**
     * Synchronous uninstall-block release for device handover. Runs before ownership is
     * cleared; after that [setUninstallBlocked] fails and the blocks would be stranded.
     */
    private fun releaseUninstallBlocksNow() {
        uninstallPassId.incrementAndGet()
        val recorded = prefs.uninstallBlockedPackages()
        if (!UninstallBlocks.releaseNeeded(recorded, prefs.uninstallReleaseSwept)) return
        // A failed scan no longer fakes a sweep: recorded blocks are still released, the
        // pending sweep is retried, and failures stay recorded so ownership that survives a
        // refused handover can release them later instead of losing the list.
        val installed = if (prefs.uninstallReleaseSwept) null else installedPackages()
        val installedNames = installed?.toSet()
        val failed = mutableSetOf<String>()
        UninstallBlocks.releaseTargets(recorded, installed, appContext.packageName)
            .forEach { packageName ->
                val released = setUninstallBlocked(packageName, false)
                if (!released && (installedNames == null || packageName in installedNames)) {
                    failed += packageName
                }
            }
        prefs.setUninstallBlockedPackages(failed)
        if (installed != null) prefs.uninstallReleaseSwept = true
    }

    private fun installedPackages(): List<String>? = runCatching {
        appContext.packageManager.getInstalledPackages(0).map { it.packageName }
    }.getOrNull()

    private fun removablePackages(): List<String>? = runCatching {
        appContext.packageManager.getInstalledPackages(0)
            .filter { info ->
                val ai = info.applicationInfo ?: return@filter false
                (ai.flags and ApplicationInfo.FLAG_SYSTEM) == 0 ||
                    (ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
            }
            .map { it.packageName }
    }.getOrNull()

    private fun setUninstallBlocked(packageName: String, blocked: Boolean): Boolean =
        runCatching { dpm.setUninstallBlocked(admin, packageName, blocked) }.isSuccess

    fun wipeClipboard() {
        val clipboard = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                clipboard.clearPrimaryClip()
            } else {
                clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
            }
        }
    }

    private fun restrictionState(): KioskRestrictions.EnforcedState = KioskRestrictions.computeEnforced(
        KioskRestrictions.Config(
            disallowSafeBoot = prefs.disallowSafeBoot,
            disallowFactoryReset = prefs.disallowFactoryReset,
            disallowAddUser = prefs.disallowAddUser,
            disallowAppsControl = prefs.disallowAppsControl,
            dateTimeLocked = prefs.dateTimeLocked,
            usbLocked = prefs.usbLocked,
            statusBarLocked = prefs.statusBarLocked,
            keyguardDisabled = prefs.keyguardDisabled,
            cameraDisabled = prefs.cameraDisabled,
            screenCaptureDisabled = prefs.screenCaptureDisabled,
            blockUnsupportedBrowsers = prefs.blockUnsupportedBrowsers,
            stayAwake = prefs.stayAwake,
            temporaryAdminUnlockActive = prefs.isAdminTemporarilyUnlocked()
        )
    )

    /**
     * Resolves phone, in-call UI, and emergency calling packages dynamically alongside static
     * OEM fallbacks so incoming/outgoing calls never fail on any Android device.
     */
    fun callingPackages(): Set<String> = systemResolver.callingPackages()

    /**
     * Resolves core Google Services, runtime permission controller, pickers, WebView, and system
     * dialog packages so standard system features keep operating inside Lock Task Mode.
     */
    fun essentialSystemPackages(): Set<String> = systemResolver.essentialSystemPackages()

    /**
     * Resolves APK/package installers and uninstall UIs for the current device/OEM.
     */
    fun installerPackages(): Set<String> = systemResolver.installerPackages()

    /** Packages that must never be flagged via [setUninstallBlocked] even when app control is locked. */
    fun protectedFromUninstallLockPackages(): Set<String> =
        systemResolver.protectedFromUninstallLockPackages()

    /**
     * Lock task packages. Includes:
     * - all launchable apps when [KioskPreferences.allowAllApps] is enabled, or only allowlisted apps
     * - essential calling/telecom, Google Services, permission controller, WebView & file picker
     * - package installer & Play Store whenever app control is unlocked or updating
     */
    private fun lockTaskPackages(): Array<String> {
        val launchable = if (!prefs.isPanicLocked() && prefs.allowAllApps) {
            runCatching { InstalledAppsRepository(appContext).launchable().map { it.packageName } }
                .getOrDefault(emptyList())
        } else {
            emptyList()
        }
        return KioskLockTaskPackages.compute(
            ownPackage = appContext.packageName,
            panicLocked = prefs.isPanicLocked(),
            allowAllApps = prefs.allowAllApps,
            allowedPackages = prefs.allowedPackagesNow(),
            launchablePackages = launchable,
            callingPackages = callingPackages(),
            essentialSystemPackages = essentialSystemPackages(),
            installerPackages = installerPackages(),
            storePackages = listOf(PLAY_STORE_PACKAGE),
            unsupportedBrowsers = UNSUPPORTED_BROWSERS.toSet(),
            disallowAppsControl = prefs.disallowAppsControl,
            installingUpdate = prefs.isInstallingUpdate(),
            adminTemporarilyUnlocked = prefs.isAdminTemporarilyUnlocked(),
            blockUnsupportedBrowsers = prefs.blockUnsupportedBrowsers,
            sdkInt = Build.VERSION.SDK_INT
        )
    }

    /** Package Android resolves Home to right now, or null when it does not resolve. */
    private val homePackage: String?
        get() = runCatching {
            appContext.packageManager.resolveActivity(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),
                PackageManager.MATCH_DEFAULT_ONLY
            )?.activityInfo?.packageName
        }.getOrNull()

    /** True when Android currently resolves Home to this app. */
    val isDefaultLauncher: Boolean
        get() = homePackage == appContext.packageName

    /** True when a different app owns Home, so no kiosk policy may be enforced. */
    private val anotherLauncherOwnsHome: Boolean
        get() = homePackage?.let { it != appContext.packageName } == true

    /**
     * Pins Ironclad OS as Home. Only a device owner can do this silently; returns false
     * otherwise (or when Android refuses), so callers can fall back to the system UI.
     */
    fun pinAsHomeLauncher(): Boolean {
        if (!isDeviceOwner) return false
        return runCatching {
            val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
            dpm.addPersistentPreferredActivity(
                admin,
                filter,
                ComponentName(appContext, KioskLauncherActivity::class.java)
            )
        }.isSuccess
    }

    /** Drops the device-owner Home pin. Returns false when not the owner. */
    fun clearHomeLauncher(): Boolean {
        if (!isDeviceOwner) return false
        return runCatching {
            dpm.clearPackagePersistentPreferredActivities(admin, appContext.packageName)
        }.isSuccess
    }

    /**
     * System UI that asks the user to make this app the Home app. Non-owner installs
     * cannot change Home silently, so the toggle hands over to this screen.
     */
    fun homePickerIntent(): Intent {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roles = appContext.getSystemService(RoleManager::class.java)
            if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME)) {
                return roles.createRequestRoleIntent(RoleManager.ROLE_HOME)
            }
        }
        return Intent(Settings.ACTION_HOME_SETTINGS)
    }

    /**
     * Enters lock task mode so Home, Recents and the notification shade cannot leave
     * the kiosk. Only a device owner may do this, and never while an admin holds the
     * temporary unlock window — that window is the path to system settings.
     *
     * Returns true when lock task is held afterwards.
     */
    fun enterLockTask(activity: Activity): Boolean {
        val alreadyLocked = isInLockTaskMode()
        val withinKioskHours = prefs.isWithinKioskHours()

        // Only an activity can leave lock task, so a device that is out of its kiosk hours is
        // released the moment the launcher resumes instead of staying pinned as a normal phone.
        if (alreadyLocked && !withinKioskHours) {
            runCatching { activity.stopLockTask() }
            if (isDeviceOwner) runCatching { dpm.setLockTaskPackages(admin, lockTaskPackages()) }
            return false
        }

        val shouldStart = LockTaskPolicy.shouldStartDuringUpdate(
            isDeviceOwner = isDeviceOwner,
            isDefaultLauncher = isDefaultLauncher,
            temporaryAdminUnlockActive = prefs.isAdminTemporarilyUnlocked(),
            scheduleKioskActive = withinKioskHours,
            inLockTaskMode = alreadyLocked,
            installingUpdate = prefs.isInstallingUpdate()
        )
        if (!shouldStart) {
            if (isDeviceOwner && isDefaultLauncher && alreadyLocked &&
                !prefs.isAdminTemporarilyUnlocked() && !prefs.isInstallingUpdate()
            ) {
                runCatching { dpm.setLockTaskPackages(admin, lockTaskPackages()) }
                applyLockTaskFeatures()
            }
            return alreadyLocked
        }

        // The package list is re-applied here so a freshly provisioned owner can lock
        // immediately, before the next applyPolicy() pass runs.
        runCatching { dpm.setLockTaskPackages(admin, lockTaskPackages()) }
        applyLockTaskFeatures()

        val started = runCatching { activity.startLockTask() }.isSuccess
        if (started) prefs.logPolicy("Lock task mode entered")
        return started
    }

    fun stopKiosk(activity: Activity) {
        runCatching { activity.stopLockTask() }
    }

    fun isInLockTaskMode(): Boolean = runCatching {
        val manager = appContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        manager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }.getOrDefault(false)

    /** Applies the new package list before the installer UI opens. */
    fun refreshLockTaskPackages() {
        if (!isDeviceOwner) return
        runCatching { dpm.setLockTaskPackages(admin, lockTaskPackages()) }
    }

    companion object {
        const val PROVISION_COMMAND =
            "adb shell dpm set-device-owner com.kiosk.launcher/.admin.KioskDeviceAdminReceiver"

        const val PLAY_STORE_PACKAGE = "com.android.vending"

        val CALLING_PACKAGES = arrayOf(
            "com.android.server.telecom",
            "com.android.phone",
            "com.android.incallui",
            "com.samsung.android.incallui",
            "com.google.android.dialer",
            "com.android.dialer",
            "com.samsung.android.dialer",
            "com.oneplus.dialer",
            "com.oplus.dialer",
            "com.coloros.dialer",
            "com.asus.dialer",
            "com.android.emergency",
            "com.google.android.ims",
            "com.android.stk",
            "com.android.cellbroadcastreceiver",
            "com.google.android.cellbroadcastreceiver"
        )

        val ESSENTIAL_SYSTEM_PACKAGES = arrayOf(
            "com.google.android.gms",
            "com.google.android.gsf",
            "com.google.android.gsf.login",
            "com.google.android.ext.services",
            "com.google.android.onetimeinitializer",
            "com.google.android.partnersetup",
            "com.google.android.syncadapters.contacts",
            "com.google.android.syncadapters.calendar",
            "com.google.android.tts",
            "com.android.permissioncontroller",
            "com.google.android.permissioncontroller",
            "com.samsung.android.permissioncontroller",
            "com.android.webview",
            "com.google.android.webview",
            "com.android.documentsui",
            "com.google.android.documentsui",
            "com.android.providers.downloads",
            "com.android.providers.downloads.ui",
            "com.android.providers.media",
            "com.android.providers.media.module",
            "com.google.android.providers.media.module",
            "com.android.credentialmanager",
            "com.google.android.credentialmanager",
            "com.android.intentresolver",
            "com.google.android.intentresolver",
            "com.android.wifi.dialog",
            "com.google.android.wifi.dialog",
            "com.android.networkstack.permissionconfig",
            "com.google.android.networkstack.permissionconfig",
            "com.android.captiveportallogin",
            "com.google.android.captiveportallogin",
            "com.android.vpndialogs",
            "com.android.bluetooth",
            "com.google.android.bluetooth",
            "com.android.nfc",
            "com.android.keychain",
            "com.android.printspooler",
            "com.android.bips"
        )

        val UNSUPPORTED_BROWSERS = arrayOf(
            "org.mozilla.firefox",
            "com.opera.browser",
            "com.opera.mini.native",
            "com.brave.browser",
            "com.duckduckgo.mobile.android",
            "com.UCMobile.intl",
            "org.torproject.torbrowser",
            "com.kiwibrowser.browser"
        )

        /** Installers that must be reachable while installing/uninstalling apps or updating the kiosk. */
        val INSTALLER_PACKAGES = arrayOf(
            "com.android.packageinstaller",
            "com.google.android.packageinstaller",
            "com.samsung.android.packageinstaller",
            "com.miui.packageinstaller",
            "com.oplus.packageinstaller",
            "com.coloros.packageinstaller",
            "com.heytap.packageinstaller",
            "com.vivo.packageinstaller",
            "com.huawei.packageinstaller",
            "com.android.permissioncontroller",
            "com.google.android.permissioncontroller"
        )

        private val uninstallPassId = AtomicLong(0L)

        private val worker = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "kiosk-dpm").apply { isDaemon = true }
        }
    }
}

/**
 * Plans the package list an uninstall-block pass touches.
 *
 * This app never blocks removal of its own package: it is a device owner, so removing it
 * would strand the device. Kept free of Android types so the planning is testable.
 */
object UninstallBlocks {

    /** Installed packages whose removal the kiosk may block. */
    fun targets(installed: Collection<String>, ownPackage: String): List<String> =
        installed.filter { it != ownPackage }.distinct()

    /**
     * Installed packages whose removal may be blocked, excluding [ownPackage] and any
     * critical system/calling/Google packages so updates and core services keep working.
     */
    fun blockTargets(
        installed: Collection<String>,
        ownPackage: String,
        protectedPackages: Set<String>
    ): List<String> =
        installed.filter { it != ownPackage && it !in protectedPackages }.distinct()

    /**
     * Packages a release pass must clear. Normally only the packages recorded as blocked,
     * which also covers an app removed since it was recorded. [installedForSweep] is passed
     * only while the one-time sweep for blocks left by builds that kept no record is still
     * pending; afterwards null means the installed package list is never even read.
     */
    fun releaseTargets(
        recorded: Set<String>,
        installedForSweep: Collection<String>?,
        ownPackage: String
    ): List<String> {
        val swept = installedForSweep?.let { targets(it, ownPackage) }.orEmpty()
        return (recorded + swept).filter { it != ownPackage }.distinct()
    }

    /**
     * A release pass has work when something was recorded or the one-time sweep for blocks
     * left by older builds is still pending. Both false means the kiosk is off and leaves
     * the package list alone.
     */
    fun releaseNeeded(recorded: Set<String>, legacySweepDone: Boolean): Boolean =
        recorded.isNotEmpty() || !legacySweepDone
}
