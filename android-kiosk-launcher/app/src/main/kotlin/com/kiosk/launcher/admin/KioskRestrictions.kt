package com.kiosk.launcher.admin

import android.os.UserManager

/**
 * Computes the [UserManager] restrictions and hardware/UI locks enforced by Device Owner policy.
 *
 * Crucially separates explicit kiosk tamper guards from baseline device capabilities so core
 * system features (telephony, SMS, Google account sign-in, network configuration, and app
 * installs/updates when unlocked) are never silently auto-disabled.
 */
object KioskRestrictions {

    data class Config(
        val disallowSafeBoot: Boolean,
        val disallowFactoryReset: Boolean,
        val disallowAddUser: Boolean,
        val disallowAppsControl: Boolean,
        val dateTimeLocked: Boolean,
        val usbLocked: Boolean,
        val statusBarLocked: Boolean,
        val keyguardDisabled: Boolean,
        val cameraDisabled: Boolean,
        val screenCaptureDisabled: Boolean,
        val blockUnsupportedBrowsers: Boolean,
        val stayAwake: Boolean,
        val temporaryAdminUnlockActive: Boolean,
        val customLockScreenEnabled: Boolean = false
    )

    data class EnforcedState(
        val userRestrictions: Map<String, Boolean>,
        val statusBarDisabled: Boolean,
        val keyguardDisabled: Boolean,
        val cameraDisabled: Boolean,
        val screenCaptureDisabled: Boolean,
        val suspendUnsupportedBrowsers: Boolean,
        val blockPackageUninstalls: Boolean,
        val stayAwakeSetting: String
    )

    /**
     * Platform restrictions that must remain cleared during normal kiosk operation so
     * telephony, Google Services account flows, connectivity, and standard installs are
     * never stranded by legacy policies or vendor defaults.
     */
    val BASELINE_CLEARED_RESTRICTIONS: List<String> = listOf(
        UserManager.DISALLOW_OUTGOING_CALLS,
        UserManager.DISALLOW_SMS,
        UserManager.DISALLOW_MODIFY_ACCOUNTS,
        UserManager.DISALLOW_INSTALL_APPS,
        UserManager.DISALLOW_UNINSTALL_APPS,
        UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
        UserManager.DISALLOW_CONFIG_WIFI,
        UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS,
        UserManager.DISALLOW_DATA_ROAMING
    )

    val MANAGED_RESTRICTIONS: List<String> = listOf(
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_ADD_USER,
        UserManager.DISALLOW_APPS_CONTROL,
        UserManager.DISALLOW_CONFIG_DATE_TIME,
        UserManager.DISALLOW_USB_FILE_TRANSFER,
        UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA
    )

    fun computeEnforced(config: Config): EnforcedState {
        val unlocked = config.temporaryAdminUnlockActive
        val restrictions = LinkedHashMap<String, Boolean>()

        // Ensure essential system capabilities are explicitly unlocked first.
        BASELINE_CLEARED_RESTRICTIONS.forEach { key ->
            restrictions[key] = false
        }

        restrictions[UserManager.DISALLOW_SAFE_BOOT] = config.disallowSafeBoot
        restrictions[UserManager.DISALLOW_FACTORY_RESET] = config.disallowFactoryReset
        restrictions[UserManager.DISALLOW_ADD_USER] = config.disallowAddUser
        restrictions[UserManager.DISALLOW_APPS_CONTROL] = config.disallowAppsControl && !unlocked
        restrictions[UserManager.DISALLOW_CONFIG_DATE_TIME] = config.dateTimeLocked && !unlocked
        restrictions[UserManager.DISALLOW_USB_FILE_TRANSFER] = config.usbLocked && !unlocked
        restrictions[UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA] = config.usbLocked && !unlocked

        return EnforcedState(
            userRestrictions = restrictions,
            statusBarDisabled = config.statusBarLocked && !unlocked,
            keyguardDisabled = config.keyguardDisabled || (config.customLockScreenEnabled && !unlocked),
            cameraDisabled = config.cameraDisabled,
            screenCaptureDisabled = config.screenCaptureDisabled && !unlocked,
            suspendUnsupportedBrowsers = config.blockUnsupportedBrowsers && !unlocked,
            blockPackageUninstalls = config.disallowAppsControl && !unlocked,
            stayAwakeSetting = if (config.stayAwake) "7" else "0"
        )
    }

    fun allClearedRestrictionKeys(): List<String> =
        (BASELINE_CLEARED_RESTRICTIONS + MANAGED_RESTRICTIONS).distinct()
}
