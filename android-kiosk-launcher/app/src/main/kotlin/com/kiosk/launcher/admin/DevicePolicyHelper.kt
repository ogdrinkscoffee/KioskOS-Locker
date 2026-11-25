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
import android.content.pm.PackageManager
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.KioskLauncherActivity
import java.util.concurrent.Executors

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

    val isDeviceOwner: Boolean
        get() = runCatching { dpm.isDeviceOwnerApp(appContext.packageName) }.getOrDefault(false)

    val isAdminActive: Boolean
        get() = runCatching { dpm.isAdminActive(admin) }.getOrDefault(false)

    /** Outcome of [relinquishDeviceOwner]. */
    enum class OwnershipRelease { NOT_OWNER, RELEASED, FAILED }

    fun applyPolicy() {
        if (!isDeviceOwner) return

        // The explicit kiosk state is the opt-in; Home ownership only decides whether it can
        // take effect. [PolicyGate] owns the rule, including releasing as soon as the kiosk
        // is switched off instead of waiting for Home to change.
        when (
            PolicyGate.decide(
                kioskEnabled = prefs.kioskEnabled,
                isDefaultLauncher = isDefaultLauncher,
                anotherLauncherOwnsHome = anotherLauncherOwnsHome
            )
        ) {
            PolicyGate.Action.ENFORCE -> enforcePolicy()
            PolicyGate.Action.RELEASE -> releasePolicy()
            // Home did not resolve, so leave the device alone rather than guess.
            PolicyGate.Action.LEAVE -> Unit
        }
    }

    private fun enforcePolicy() {
        // The status bar toggle must win over lock task. LOCK_TASK_FEATURE_NONE used to
        // hide the shade no matter what was switched off here.
        runCatching { dpm.setStatusBarDisabled(admin, prefs.statusBarLocked) }

        // Re-enabling needs no extra permission; disabling returns false when the device
        // has a lock password, which the diagnostics surface as "not applied".
        runCatching { dpm.setKeyguardDisabled(admin, prefs.keyguardDisabled) }
        runCatching { dpm.setCameraDisabled(admin, prefs.cameraDisabled) }
        runCatching { dpm.setScreenCaptureDisabled(admin, prefs.screenCaptureDisabled) }
        runCatching { dpm.setLockTaskPackages(admin, lockTaskPackages()) }
        applyLockTaskFeatures()

        restrictions().forEach { (key, enabled) ->
            runCatching {
                if (enabled) dpm.addUserRestriction(admin, key)
                else dpm.clearUserRestriction(admin, key)
            }
        }

        runCatching {
            val suspended = prefs.blockUnsupportedBrowsers && !prefs.isAdminTemporarilyUnlocked()
            dpm.setPackagesSuspended(admin, UNSUPPORTED_BROWSERS, suspended)
        }

        runCatching {
            dpm.setGlobalSetting(
                admin,
                Settings.Global.STAY_ON_WHILE_PLUGGED_IN,
                if (prefs.stayAwake) "7" else "0"
            )
        }

        // DISALLOW_APPS_CONTROL alone only hides the buttons in Settings on some builds;
        // blocking every installed package explicitly is what actually refuses an uninstall.
        applyUninstallPolicy(block = prefs.disallowAppsControl && !prefs.isAdminTemporarilyUnlocked())

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
        restrictions().keys.forEach { key ->
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
        val features = LockTaskFeatures.compute(
            statusBarLocked = prefs.statusBarLocked,
            keyguardDisabled = prefs.keyguardDisabled,
            blockActivityStartInTask = true
        )
        runCatching { dpm.setLockTaskFeatures(admin, features) }
    }

    /**
     * Blocking runs per package, so it is pushed to a worker: both calls walk the whole
     * package list. The packages this app blocked are recorded, so switching the toggle
     * off releases them even when an earlier pass was cut short or the app was reinstalled.
     */
    private fun applyUninstallPolicy(block: Boolean) {
        if (block) {
            worker.execute {
                val installed = installedPackages() ?: return@execute
                val blocked = prefs.uninstallBlockedPackages().toMutableSet()
                UninstallBlocks.targets(installed, appContext.packageName).forEach { packageName ->
                    if (setUninstallBlocked(packageName, true)) blocked += packageName
                }
                prefs.setUninstallBlockedPackages(blocked)
            }
            return
        }

        // Releasing touches the recorded packages only. A build that did not record its
        // blocks must not leave an app permanently un-uninstallable, so the first release
        // also sweeps every installed package once; after that a kiosk that is off does no
        // package walk on cold starts.
        val recorded = prefs.uninstallBlockedPackages()
        val sweep = !prefs.uninstallReleaseSwept
        if (!UninstallBlocks.releaseNeeded(recorded, prefs.uninstallReleaseSwept)) return

        worker.execute {
            // A failed scan keeps the sweep pending so the next release retries it. Passing
            // null once the sweep is done is what keeps a cold start off the package list.
            val installed = if (sweep) installedPackages() ?: return@execute else null
            val installedNames = installed?.toSet().orEmpty()
            val failed = mutableSetOf<String>()
            UninstallBlocks.releaseTargets(recorded, installed, appContext.packageName)
                .forEach { packageName ->
                    if (!setUninstallBlocked(packageName, false) && packageName in installedNames) {
                        failed += packageName
                    }
                }
            prefs.setUninstallBlockedPackages(failed)
            if (sweep) prefs.uninstallReleaseSwept = true
        }
    }

    /**
     * Synchronous uninstall-block release for device handover. Runs before ownership is
     * cleared; after that [setUninstallBlocked] fails and the blocks would be stranded.
     */
    private fun releaseUninstallBlocksNow() {
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

    private fun restrictions(): Map<String, Boolean> {
        val unlocked = prefs.isAdminTemporarilyUnlocked()
        return mapOf(
            UserManager.DISALLOW_SAFE_BOOT to prefs.disallowSafeBoot,
            UserManager.DISALLOW_FACTORY_RESET to prefs.disallowFactoryReset,
            UserManager.DISALLOW_ADD_USER to prefs.disallowAddUser,
            UserManager.DISALLOW_APPS_CONTROL to (prefs.disallowAppsControl && !unlocked),
            UserManager.DISALLOW_CONFIG_DATE_TIME to prefs.dateTimeLocked,
            UserManager.DISALLOW_USB_FILE_TRANSFER to prefs.usbLocked,
            UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA to prefs.usbLocked
        )
    }

    /**
     * Lock task packages. The installer is included while a kiosk update is in progress so
     * the system install prompt is not bounced back to the launcher.
     */
    private fun lockTaskPackages(): Array<String> {
        if (prefs.isPanicLocked()) {
            return arrayOf(appContext.packageName)
        }
        val packages = prefs.allowedPackages().toMutableSet()
        packages.add(appContext.packageName)
        if (prefs.isInstallingUpdate()) {
            packages.addAll(INSTALLER_PACKAGES)
        }
        return packages.toTypedArray()
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
        val shouldStart = LockTaskPolicy.shouldStartDuringUpdate(
            isDeviceOwner = isDeviceOwner,
            isDefaultLauncher = isDefaultLauncher,
            temporaryAdminUnlockActive = prefs.isAdminTemporarilyUnlocked(),
            inLockTaskMode = alreadyLocked,
            installingUpdate = prefs.isInstallingUpdate()
        )
        if (!shouldStart) return alreadyLocked

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

        /** Installers that must be reachable while an in-app update is being installed. */
        val INSTALLER_PACKAGES = arrayOf(
            "com.android.packageinstaller",
            "com.google.android.packageinstaller",
            "com.android.permissioncontroller"
        )

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
