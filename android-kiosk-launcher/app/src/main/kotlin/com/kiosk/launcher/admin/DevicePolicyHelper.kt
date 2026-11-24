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

    fun applyPolicy() {
        if (!isDeviceOwner) return

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
        applyUninstallPolicy()

        prefs.logPolicy("Policy applied")
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
     * package list. The result is read from preferences at execution time, never stale.
     */
    private fun applyUninstallPolicy() {
        val block = prefs.disallowAppsControl && !prefs.isAdminTemporarilyUnlocked()
        worker.execute {
            val installed = runCatching {
                appContext.packageManager.getInstalledPackages(0)
            }.getOrDefault(emptyList())

            installed.forEach { info ->
                // Never block this app's own removal: it is a device owner and removing it
                // would strand the device. Blocking it also has no effect on updates.
                if (info.packageName == appContext.packageName) return@forEach
                runCatching { dpm.setUninstallBlocked(admin, info.packageName, block) }
            }
        }
    }

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

    /** True when Android currently resolves Home to this app. */
    val isDefaultLauncher: Boolean
        get() = runCatching {
            val resolved = appContext.packageManager.resolveActivity(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),
                PackageManager.MATCH_DEFAULT_ONLY
            )
            resolved?.activityInfo?.packageName == appContext.packageName
        }.getOrDefault(false)

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

    fun setAsHomeLauncher() {
        pinAsHomeLauncher()
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
