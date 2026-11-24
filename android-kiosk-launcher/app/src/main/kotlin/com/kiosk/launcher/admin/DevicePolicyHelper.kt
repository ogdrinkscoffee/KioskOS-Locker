package com.kiosk.launcher.admin

import android.app.Activity
import android.app.ActivityManager
import android.app.ActivityOptions
import android.app.admin.DevicePolicyManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.UserManager
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.KioskLauncherActivity
import com.kiosk.launcher.update.UpdateResultReceiver
import org.json.JSONArray

/**
 * Central Device Owner policy controller implementing enterprise kiosk controls
 * AND native anti-porn/browser enforcement (Family Private DNS-over-TLS, Chrome Managed
 * SafeSearch + No Incognito + URLBlocklist, DISALLOW_CONFIG_VPN, and unmonitored browser suspension).
 */
object DevicePolicyHelper {

    val BLOCKED_SETTINGS_AND_INSTALLER_PACKAGES = arrayOf(
        "com.android.settings",
        "com.android.packageinstaller",
        "com.google.android.packageinstaller",
        "com.samsung.android.packageinstaller",
        "com.miui.packageinstaller",
        "com.oplus.packageinstaller",
        "com.coloros.packageinstaller",
        "com.android.permissioncontroller",
        "com.google.android.permissioncontroller",
        "com.android.vending"
    )

    val UNSUPPORTED_BROWSER_PACKAGES = arrayOf(
        "org.mozilla.firefox",
        "com.opera.browser",
        "com.opera.mini.native",
        "com.brave.browser",
        "com.duckduckgo.mobile.android",
        "com.UCMobile.intl",
        "org.torproject.torbrowser",
        "com.kiwibrowser.browser"
    )

    val MANAGED_CHROME_PACKAGES = arrayOf(
        "com.android.chrome",
        "com.chrome.beta",
        "com.microsoft.emmx"
    )

    val MANDATORY_DEVICE_OWNER_RESTRICTIONS = listOf(
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_ADD_USER,
        UserManager.DISALLOW_APPS_CONTROL
    )

    fun getDevicePolicyManager(context: Context): DevicePolicyManager {
        return context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    }

    fun isDeviceOwner(context: Context): Boolean {
        return getDevicePolicyManager(context).isDeviceOwnerApp(context.packageName)
    }

    fun isAdminActive(context: Context): Boolean {
        val dpm = getDevicePolicyManager(context)
        return dpm.isAdminActive(KioskDeviceAdminReceiver.getComponentName(context))
    }

    /**
     * Enforces all core, extended hardware, DNS, and BlockP/BlockerX browser policies idempotently.
     */
    fun enforceKioskPolicies(context: Context) {
        val appContext = context.applicationContext
        val dpm = getDevicePolicyManager(appContext)
        if (!dpm.isDeviceOwnerApp(appContext.packageName)) {
            return
        }

        val admin = KioskDeviceAdminReceiver.getComponentName(appContext)
        val prefs = KioskPreferences(appContext)
        val isAdminUnlocked = prefs.isSettingsAndUninstallUnlocked()

        // 1. Mandatory tamper-resistance UserManager restrictions
        dpm.addUserRestriction(admin, UserManager.DISALLOW_SAFE_BOOT)
        dpm.addUserRestriction(admin, UserManager.DISALLOW_FACTORY_RESET)
        dpm.addUserRestriction(admin, UserManager.DISALLOW_ADD_USER)

        if (isAdminUnlocked) {
            dpm.clearUserRestriction(admin, UserManager.DISALLOW_APPS_CONTROL)
        } else {
            dpm.addUserRestriction(admin, UserManager.DISALLOW_APPS_CONTROL)
        }

        // 2. USB, physical media, and anti-clock-tampering restrictions
        if (prefs.isUsbTransferBlocked() && !isAdminUnlocked) {
            dpm.addUserRestriction(admin, UserManager.DISALLOW_USB_FILE_TRANSFER)
            dpm.addUserRestriction(admin, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
        } else {
            dpm.clearUserRestriction(admin, UserManager.DISALLOW_USB_FILE_TRANSFER)
            dpm.clearUserRestriction(admin, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
        }

        if (prefs.isDateTimeLocked() && !isAdminUnlocked) {
            dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME)
        } else {
            dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME)
        }

        // 3. Family Private DNS & VPN Bypass Prevention
        val dnsMode = prefs.getFamilyDnsMode()
        if (dnsMode != KioskPreferences.DNS_OFF && !isAdminUnlocked) {
            dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_VPN)
        } else {
            dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_VPN)
        }
        applyPrivateDnsPolicy(dpm, admin, dnsMode)

        // 4. Managed Chrome / Browser Restrictions (SafeSearch + Disable Incognito + URLBlocklist)
        applyManagedBrowserRestrictions(dpm, admin, prefs)

        // 5. Hardware & UI lockdown controls
        try {
            dpm.setCameraDisabled(admin, prefs.isCameraDisabled())
            dpm.setScreenCaptureDisabled(admin, prefs.isScreenCaptureDisabled())
            dpm.setStatusBarDisabled(admin, !isAdminUnlocked && prefs.isStatusBarDisabled())
            dpm.setKeyguardDisabled(admin, !isAdminUnlocked && prefs.isKeyguardDisabled())
        } catch (_: SecurityException) {
            // Some OEM builds restrict specific hardware flags on secondary users
        }

        // 6. Prevent uninstalling the kiosk launcher itself at all times
        dpm.setUninstallBlocked(admin, appContext.packageName, true)
        if (isAdminUnlocked) {
            prefs.getAllowedPackages()
                .filter { it != appContext.packageName }
                .forEach { pkg ->
                    try {
                        dpm.setUninstallBlocked(admin, pkg, false)
                    } catch (_: Exception) {
                    }
                }
        }

        // 7. Enforce or lift suspension on Android Settings, Package Installer, & Unsupported Browsers
        applySystemPackageLockState(appContext, dpm, admin, unlocked = isAdminUnlocked, prefs = prefs)

        // 8. Pin KioskLauncherActivity as the persistent HOME screen
        val homeFilter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        val homeComponent = ComponentName(appContext, KioskLauncherActivity::class.java)
        dpm.addPersistentPreferredActivity(admin, homeFilter, homeComponent)

        // 9. Configure LockTask whitelist AND LockTask features (Home, Keyguard, StatusBar/Notifications)
        syncLockTaskPackages(appContext, dpm, admin, prefs)
    }

    /**
     * Configures LockTask allowed UI features on Android 9+ (API 28+).
     * Without explicitly enabling HOME, SYSTEM_INFO/NOTIFICATIONS, and KEYGUARD here,
     * LockTask defaults to LOCK_TASK_FEATURE_NONE which traps the Home button, hides the
     * status bar even when enabled, and disables the lock screen.
     */
    fun applyLockTaskFeatures(
        dpm: DevicePolicyManager,
        admin: ComponentName,
        prefs: KioskPreferences,
        isAdminUnlocked: Boolean
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return
        val allowHomeNav = (prefs.getKioskMode() == KioskPreferences.MODE_MULTI_APP) || isAdminUnlocked
        var features = DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS
        if (allowHomeNav) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_HOME
        }
        if (!prefs.isStatusBarDisabled() || isAdminUnlocked) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
            if (allowHomeNav) {
                features = features or DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
            }
        }
        if (!prefs.isKeyguardDisabled() || isAdminUnlocked) {
            features = features or DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD
        }
        try {
            dpm.setLockTaskFeatures(admin, features)
        } catch (_: Exception) {
            // Ignored on devices that disallow a subset of LockTask features
        }
    }

    private fun applyPrivateDnsPolicy(
        dpm: DevicePolicyManager,
        admin: ComponentName,
        dnsMode: String
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val dnsHost = when (dnsMode) {
            KioskPreferences.DNS_CLOUDFLARE_FAMILY -> KioskPreferences.DNS_HOST_CLOUDFLARE_FAMILY
            KioskPreferences.DNS_CLEANBROWSING_ADULT -> KioskPreferences.DNS_HOST_CLEANBROWSING_ADULT
            else -> null
        }
        try {
            if (dnsHost != null) {
                dpm.setGlobalPrivateDnsModeSpecifiedHost(admin, dnsHost)
            } else {
                dpm.setGlobalPrivateDnsModeOpportunistic(admin)
            }
        } catch (_: Exception) {
            // Ignored if network is offline during connectivity check
        }
    }

    private fun applyManagedBrowserRestrictions(
        dpm: DevicePolicyManager,
        admin: ComponentName,
        prefs: KioskPreferences
    ) {
        val disablePornOnBrowsers = prefs.isDisablePornOnBrowsers()
        val bundle = Bundle().apply {
            putInt("IncognitoModeAvailability", if (disablePornOnBrowsers) 1 else 0)
            putBoolean("ForceGoogleSafeSearch", disablePornOnBrowsers)
            putInt("ForceYouTubeRestrict", if (disablePornOnBrowsers) 2 else 0)

            val urlBlocklist = JSONArray()
            if (disablePornOnBrowsers) {
                KioskPreferences.BLOCKED_DISTRACTION_DOMAINS.forEach { domain ->
                    urlBlocklist.put(domain)
                }
                prefs.getBlockedKeywords().forEach { keyword ->
                    urlBlocklist.put("*$keyword*")
                }
            }
            if (prefs.isBlockShortFormFeeds()) {
                urlBlocklist.put("youtube.com/shorts*")
                urlBlocklist.put("instagram.com/reels*")
                urlBlocklist.put("tiktok.com")
            }
            putString("URLBlocklist", urlBlocklist.toString())
        }

        MANAGED_CHROME_PACKAGES.forEach { pkg ->
            try {
                dpm.setApplicationRestrictions(admin, pkg, bundle)
            } catch (_: Exception) {
            }
        }
    }

    /**
     * Called on device reboot to clear any temporary admin unlock and immediately
     * re-lock Android Settings, uninstallation, and all Device Owner restrictions.
     */
    fun enforceKioskPoliciesOnBoot(context: Context) {
        val prefs = KioskPreferences(context)
        prefs.setSettingsAndUninstallUnlocked(false)
        enforceKioskPolicies(context)
    }

    fun setAdminUnlockState(context: Context, unlocked: Boolean) {
        val prefs = KioskPreferences(context)
        prefs.setSettingsAndUninstallUnlocked(unlocked)
        enforceKioskPolicies(context)
    }

    /**
     * Reconciles expired timed Admin unlocks. Returns true if unlock was previously active and just expired.
     */
    fun reconcileAdminUnlockTimeout(context: Context): Boolean {
        val prefs = KioskPreferences(context)
        val hadTimer = prefs.getAdminUnlockUntilMs() > 0L
        val stillUnlocked = prefs.isSettingsAndUninstallUnlocked()
        if (hadTimer && !stillUnlocked) {
            enforceKioskPolicies(context)
            return true
        }
        return false
    }

    /**
     * Uninstalls a non-launcher target package when Admin unlock is active.
     * Uses Device Owner silent PackageInstaller.uninstall() when permitted, with ACTION_DELETE fallback.
     */
    fun uninstallPackage(activity: Activity, packageName: String): Boolean {
        val appContext = activity.applicationContext
        val prefs = KioskPreferences(appContext)
        if (packageName == appContext.packageName || !prefs.isSettingsAndUninstallUnlocked()) {
            return false
        }
        val dpm = getDevicePolicyManager(appContext)
        val admin = KioskDeviceAdminReceiver.getComponentName(appContext)
        val isDo = dpm.isDeviceOwnerApp(appContext.packageName)

        if (isDo) {
            try {
                dpm.clearUserRestriction(admin, UserManager.DISALLOW_APPS_CONTROL)
                dpm.setUninstallBlocked(admin, packageName, false)
            } catch (_: Exception) {
            }
            try {
                activity.stopLockTask()
            } catch (_: Exception) {
            }
            try {
                val callbackIntent = Intent(appContext, UpdateResultReceiver::class.java).apply {
                    action = UpdateResultReceiver.ACTION_UNINSTALL_RESULT
                    putExtra(UpdateResultReceiver.EXTRA_TARGET_PACKAGE, packageName)
                }
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
                val pending = PendingIntent.getBroadcast(
                    appContext,
                    packageName.hashCode(),
                    callbackIntent,
                    flags
                )
                appContext.packageManager.packageInstaller.uninstall(packageName, pending.intentSender)
                return true
            } catch (_: Exception) {
                // Fall back to standard ACTION_DELETE dialog below
            }
        }

        return try {
            val deleteIntent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(deleteIntent)
            true
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Emergency Panic Protocol:
     * 1. Activates a 15-minute Panic Lockdown & Strict Shield Lock, revoking admin unlock.
     * 2. Wipes the device clipboard (clearPrimaryClip + empty ClipData fallback).
     * 3. Kills background/active processes for third-party & browser apps.
     * 4. Suspends non-essential apps via DPM and locks UI directly to the Kiosk Dashboard.
     */
    fun triggerEmergencyPanic(context: Context): Int {
        val appContext = context.applicationContext
        val prefs = KioskPreferences(appContext)
        val remainingMins = prefs.activatePanicLockdown(KioskPreferences.PANIC_RECOVERY_MINUTES)

        // 1. Wipe Clipboard cleanly
        try {
            val clipboard = appContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            if (clipboard != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    clipboard.clearPrimaryClip()
                }
                clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
            }
        } catch (_: Exception) {
        }

        // 2. Kill active external/browser background processes
        try {
            val am = appContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            if (am != null) {
                val killTargets = (
                    prefs.getAllowedPackages() +
                        prefs.getAppTimeLimitMinutesMap().keys +
                        UNSUPPORTED_BROWSER_PACKAGES +
                        MANAGED_CHROME_PACKAGES
                    ).filter { it != appContext.packageName }.distinct()
                killTargets.forEach { pkg ->
                    try {
                        am.killBackgroundProcesses(pkg)
                    } catch (_: Exception) {
                    }
                }
            }
        } catch (_: Exception) {
        }

        // 3. Re-enforce restrictions & suspend non-essential packages immediately
        enforceKioskPolicies(appContext)

        // 4. Bring Kiosk Dashboard (KioskLauncherActivity) cleanly to front and lock task
        val homeIntent = Intent(appContext, KioskLauncherActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            putExtra(KioskLauncherActivity.EXTRA_PANIC_TRIGGERED, remainingMins)
        }
        appContext.startActivity(homeIntent)
        return remainingMins
    }

    fun syncLockTaskPackages(
        context: Context,
        dpm: DevicePolicyManager = getDevicePolicyManager(context),
        admin: ComponentName = KioskDeviceAdminReceiver.getComponentName(context),
        prefs: KioskPreferences = KioskPreferences(context)
    ) {
        if (!dpm.isDeviceOwnerApp(context.packageName)) return
        prefs.ensureUsageDateCurrent()

        val unlocked = prefs.isSettingsAndUninstallUnlocked()
        val allowed = prefs.getAllowedPackages().toMutableSet()
        allowed.add(context.packageName)
        prefs.getSingleAppPackage()?.let {
            if (it.isNotBlank() && prefs.getTimeOrScheduleBlockReason(it) == null) {
                allowed.add(it)
            }
        }
        if (unlocked) {
            allowed.addAll(BLOCKED_SETTINGS_AND_INSTALLER_PACKAGES)
        } else {
            allowed.removeAll(BLOCKED_SETTINGS_AND_INSTALLER_PACKAGES.toSet())
            if (prefs.isBlockUnsupportedBrowsers()) {
                allowed.removeAll(UNSUPPORTED_BROWSER_PACKAGES.toSet())
            }
            allowed.removeAll { pkg ->
                pkg != context.packageName && prefs.getTimeOrScheduleBlockReason(pkg) != null
            }
        }
        dpm.setLockTaskPackages(admin, allowed.toTypedArray())
        applyLockTaskFeatures(dpm, admin, prefs, unlocked)
    }

    /**
     * Checks whether launching [packageName] is blocked by AppBlock daily time limits,
     * Quiet Hours Downtime, or Freedom Quick Focus Block.
     * Returns null when allowed, or a user-facing reason string when blocked.
     */
    fun getLaunchBlockReason(context: Context, packageName: String): String? {
        val prefs = KioskPreferences(context)
        prefs.ensureUsageDateCurrent()
        return prefs.getTimeOrScheduleBlockReason(packageName)
    }

    /**
     * Launches an allowed target package using Lock Task mode (startLockTask).
     * Returns true if launched, false if blocked by kiosk policy, time limit, or schedule.
     */
    fun launchPackageInKioskMode(activity: Activity, packageName: String): Boolean {
        val prefs = KioskPreferences(activity)
        prefs.ensureUsageDateCurrent()
        val isUnlocked = prefs.isSettingsAndUninstallUnlocked()
        val isBlockedSystemPkg = packageName in BLOCKED_SETTINGS_AND_INSTALLER_PACKAGES
        val isUnsupportedBrowser = prefs.isBlockUnsupportedBrowsers() &&
            packageName in UNSUPPORTED_BROWSER_PACKAGES

        if ((isBlockedSystemPkg || isUnsupportedBrowser) && !isUnlocked) {
            prefs.incrementBlockedAttemptsToday()
            return false
        }

        if (!isUnlocked && prefs.getTimeOrScheduleBlockReason(packageName) != null) {
            prefs.incrementBlockedAttemptsToday()
            enforceKioskPolicies(activity)
            return false
        }

        val isSingleAppTarget = prefs.getKioskMode() == KioskPreferences.MODE_SINGLE_APP &&
            prefs.getSingleAppPackage() == packageName

        if (!isUnlocked && !isSingleAppTarget && packageName !in prefs.getAllowedPackages()) {
            return false
        }

        val launchIntent = activity.packageManager.getLaunchIntentForPackage(packageName)
            ?: return false

        val dpm = getDevicePolicyManager(activity)
        if (isUnlocked) {
            // While Admin Settings/Uninstall unlock is active, avoid trapping the user in LockTask
            try {
                activity.stopLockTask()
            } catch (_: Exception) {
            }
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            activity.startActivity(launchIntent)
            return true
        }

        if (dpm.isDeviceOwnerApp(activity.packageName)) {
            syncLockTaskPackages(activity, dpm)
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val options = ActivityOptions.makeBasic().setLockTaskEnabled(true)
                activity.startActivity(launchIntent, options.toBundle())
                return true
            }
        }

        try {
            activity.startLockTask()
        } catch (_: IllegalStateException) {
            // Ignored if lock task is already active or not permitted in current state
        }
        activity.startActivity(launchIntent)
        return true
    }

    private fun applySystemPackageLockState(
        context: Context,
        dpm: DevicePolicyManager,
        admin: ComponentName,
        unlocked: Boolean,
        prefs: KioskPreferences
    ) {
        val pm = context.packageManager
        val suspendSet = BLOCKED_SETTINGS_AND_INSTALLER_PACKAGES.toMutableSet()
        if (prefs.isBlockUnsupportedBrowsers()) {
            suspendSet.addAll(UNSUPPORTED_BROWSER_PACKAGES)
        }

        // Also suspend any allowlisted packages that exceeded today's daily limit or active schedule
        val candidatePackages = (prefs.getAllowedPackages() + prefs.getAppTimeLimitMinutesMap().keys)
            .filter { it != context.packageName }
            .distinct()

        val timeOrScheduleBlocked = if (unlocked) {
            emptySet()
        } else {
            candidatePackages.filter { prefs.getTimeOrScheduleBlockReason(it) != null }.toSet()
        }
        suspendSet.addAll(timeOrScheduleBlocked)

        val unsuspendCandidates = (UNSUPPORTED_BROWSER_PACKAGES.toSet() + candidatePackages)
            .filter { pkg ->
                if (unlocked) {
                    pkg !in BLOCKED_SETTINGS_AND_INSTALLER_PACKAGES // Settings/installer handled below
                } else {
                    pkg !in suspendSet
                }
            }
            .filter { isPackageInstalled(pm, it) }
            .toTypedArray()

        if (unsuspendCandidates.isNotEmpty()) {
            try {
                dpm.setPackagesSuspended(admin, unsuspendCandidates, false)
            } catch (_: SecurityException) {
            }
        }

        val installedToSuspend = suspendSet
            .filter { isPackageInstalled(pm, it) }
            .toTypedArray()

        if (installedToSuspend.isNotEmpty()) {
            try {
                dpm.setPackagesSuspended(admin, installedToSuspend, !unlocked)
            } catch (_: SecurityException) {
                // AccessibilityService + DISALLOW_APPS_CONTROL cover OEM exceptions
            }
        }
    }

    private fun isPackageInstalled(pm: android.content.pm.PackageManager, packageName: String): Boolean {
        return try {
            pm.getPackageInfo(packageName, 0)
            true
        } catch (_: Exception) {
            false
        }
    }
}
