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

/**
 * Every DevicePolicyManager call is wrapped: the app runs as a normal launcher in
 * preview mode and only enforces policy when it is the device owner.
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

        runCatching { dpm.setStatusBarDisabled(admin, prefs.statusBarLocked) }
        runCatching { dpm.setKeyguardDisabled(admin, prefs.keyguardDisabled) }
        runCatching { dpm.setCameraDisabled(admin, prefs.cameraDisabled) }
        runCatching { dpm.setScreenCaptureDisabled(admin, prefs.screenCaptureDisabled) }
        runCatching { dpm.setLockTaskPackages(admin, lockTaskPackages()) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            runCatching { dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE) }
        }

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

        prefs.logPolicy("Policy applied")
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

    private fun lockTaskPackages(): Array<String> {
        if (prefs.isPanicLocked()) {
            return arrayOf(appContext.packageName)
        }
        val packages = prefs.allowedPackages().toMutableSet()
        packages.add(appContext.packageName)
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
        val shouldStart = LockTaskPolicy.shouldStart(
            isDeviceOwner = isDeviceOwner,
            temporaryAdminUnlockActive = prefs.isAdminTemporarilyUnlocked(),
            inLockTaskMode = alreadyLocked
        )
        if (!shouldStart) return alreadyLocked

        // The package list is re-applied here so a freshly provisioned owner can lock
        // immediately, before the next applyPolicy() pass runs.
        runCatching { dpm.setLockTaskPackages(admin, lockTaskPackages()) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            runCatching { dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE) }
        }

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
    }
}
