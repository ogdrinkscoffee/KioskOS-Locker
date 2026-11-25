package com.kiosk.launcher.diagnostics

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.admin.KioskDeviceAdminReceiver
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.receiver.BootCompletedReceiver
import com.kiosk.launcher.service.KioskGuardAccessibilityService

/**
 * Reads what is *actually* in effect on the device instead of what the toggles ask for.
 * Kiosk apps fail silently — the launcher still looks right while a guard layer is off —
 * so every probe here is independent and a failure reads as [GuardStatus.State.UNKNOWN]
 * rather than as a healthy device.
 */
class DiagnosticsCollector(context: Context) {

    private val app: Context = context.applicationContext
    private val prefs = KioskPreferences(app)
    private val policy = DevicePolicyHelper(app)
    private val dpm = app.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
    private val admin = ComponentName(app, KioskDeviceAdminReceiver::class.java)

    fun collect(nowMs: Long = System.currentTimeMillis()): DiagnosticsSnapshot {
        val pkg = runCatching { app.packageManager.getPackageInfo(app.packageName, 0) }.getOrNull()
        return DiagnosticsSnapshot(
            headings = headings(),
            appVersion = pkg?.versionName ?: "?",
            versionCode = versionCode(pkg),
            androidRelease = Build.VERSION.RELEASE ?: "?",
            sdkInt = Build.VERSION.SDK_INT,
            deviceModel = listOf(Build.MANUFACTURER, Build.MODEL)
                .filter { !it.isNullOrBlank() }
                .joinToString(" ")
                .ifBlank { "unknown device" },
            generatedAt = nowMs,
            guards = guards(),
            restrictions = restrictions(),
            events = prefs.policyEvents()
        )
    }

    private fun headings() = DiagnosticsHeadings(
        title = s(R.string.diag_report_title),
        generated = s(R.string.diag_generated),
        guards = s(R.string.diag_section_guards),
        restrictions = s(R.string.diag_section_restrictions),
        log = s(R.string.diag_section_log),
        noEvents = s(R.string.diag_no_events),
        legend = s(R.string.diag_legend)
    )

    // ----------------------------------------------------------------- guard layers
    private fun guards(): List<GuardStatus> = buildList {
        add(
            GuardStatus(
                s(R.string.diag_guard_device_owner),
                state(policy.isDeviceOwner),
                if (policy.isDeviceOwner) null else DevicePolicyHelper.PROVISION_COMMAND
            )
        )
        add(GuardStatus(s(R.string.diag_guard_device_admin), state(policy.isAdminActive)))
        addAll(lockTaskGuards())
        add(accessibilityGuard())
        add(bootReceiverGuard())
        add(
            GuardStatus(
                s(R.string.diag_guard_window_setting),
                state(prefs.guardEnabled),
                if (prefs.guardEnabled) null else s(R.string.diag_detail_guard_setting_off)
            )
        )
    }

    /**
     * Lock task availability and the live lock task state are separate rows: a device
     * that is correctly provisioned but not locked at the moment is healthy, not broken.
     */
    private fun lockTaskGuards(): List<GuardStatus> = LockTaskStatus.rows(
        text = LockTaskStatus.Text(
            availableLabel = s(R.string.diag_guard_lock_task),
            activeLabel = s(R.string.diag_guard_lock_task_active),
            allowedApps = { s(R.string.diag_detail_lock_task_packages_fmt, it) },
            needsOwner = s(R.string.diag_detail_lock_task_needs_owner),
            notAllowed = s(R.string.diag_detail_lock_task_not_allowed),
            idle = s(R.string.diag_detail_lock_task_idle),
            unavailable = s(R.string.diag_detail_lock_task_unavailable),
            unreadable = s(R.string.diag_detail_unreadable)
        ),
        packageName = app.packageName,
        isDeviceOwner = policy.isDeviceOwner,
        inLockTaskMode = policy.isInLockTaskMode(),
        allowListedPackages = runCatching { dpm.getLockTaskPackages(admin).toSet() }.getOrNull()
    )

    /** Settings store the component either flattened or short-form, so compare parsed names. */
    private fun accessibilityGuard(): GuardStatus {
        val label = s(R.string.diag_guard_accessibility)
        val expected = ComponentName(app, KioskGuardAccessibilityService::class.java)
        val listed = runCatching {
            Settings.Secure.getString(
                app.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ).orEmpty()
                .split(':')
                .mapNotNull { ComponentName.unflattenFromString(it.trim()) }
                .any { it == expected }
        }.getOrDefault(false)
        val masterOn = runCatching {
            (app.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager).isEnabled
        }.getOrDefault(false)

        return when {
            listed && masterOn -> GuardStatus(label, GuardStatus.State.ACTIVE)
            listed -> GuardStatus(
                label,
                GuardStatus.State.INACTIVE,
                s(R.string.diag_detail_accessibility_master_off)
            )
            else -> GuardStatus(
                label,
                GuardStatus.State.INACTIVE,
                s(R.string.diag_detail_accessibility_off)
            )
        }
    }

    private fun bootReceiverGuard(): GuardStatus {
        val label = s(R.string.diag_guard_boot_receiver)
        val component = ComponentName(app, BootCompletedReceiver::class.java)
        val enabled = runCatching {
            app.packageManager.getComponentEnabledSetting(component) !=
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }.getOrDefault(false)
        val permission = runCatching {
            app.checkSelfPermission(Manifest.permission.RECEIVE_BOOT_COMPLETED) ==
                PackageManager.PERMISSION_GRANTED
        }.getOrDefault(false)

        return when {
            enabled && permission -> GuardStatus(label, GuardStatus.State.ACTIVE)
            enabled -> GuardStatus(
                label,
                GuardStatus.State.INACTIVE,
                s(R.string.diag_detail_boot_permission)
            )
            else -> GuardStatus(
                label,
                GuardStatus.State.INACTIVE,
                s(R.string.diag_detail_boot_component_disabled)
            )
        }
    }

    // ----------------------------------------------------------------- restrictions
    /**
     * Reports the restrictions the system really holds, and calls out drift from the
     * toggles: a restriction that is on after being switched off is exactly the kind of
     * leftover that makes a "broken" kiosk look broken.
     */
    private fun restrictions(): List<GuardStatus> {
        val observed = runCatching {
            (app.getSystemService(Context.USER_SERVICE) as UserManager).userRestrictions
        }.getOrNull() ?: return listOf(
            GuardStatus(
                s(R.string.diag_restrictions_unreadable),
                GuardStatus.State.UNKNOWN,
                s(R.string.diag_detail_unreadable)
            )
        )

        val rows = mutableListOf<GuardStatus>()

        val unlocked = prefs.isAdminTemporarilyUnlocked()

        fun userRestriction(labelRes: Int, key: String, requested: Boolean) {
            val inEffect = observed.getBoolean(key, false)
            rows += GuardStatus(s(labelRes), state(inEffect), drift(inEffect, requested))
        }

        userRestriction(R.string.diag_restriction_safe_boot, UserManager.DISALLOW_SAFE_BOOT, prefs.disallowSafeBoot)
        userRestriction(
            R.string.diag_restriction_factory_reset,
            UserManager.DISALLOW_FACTORY_RESET,
            prefs.disallowFactoryReset
        )
        userRestriction(R.string.diag_restriction_add_user, UserManager.DISALLOW_ADD_USER, prefs.disallowAddUser)
        userRestriction(
            R.string.diag_restriction_apps_control,
            UserManager.DISALLOW_APPS_CONTROL,
            prefs.disallowAppsControl && !unlocked
        )
        userRestriction(
            R.string.diag_restriction_date_time,
            UserManager.DISALLOW_CONFIG_DATE_TIME,
            prefs.dateTimeLocked && !unlocked
        )
        userRestriction(
            R.string.diag_restriction_usb,
            UserManager.DISALLOW_USB_FILE_TRANSFER,
            prefs.usbLocked && !unlocked
        )

        rows += devicePolicyFlag(R.string.diag_restriction_camera) { dpm.getCameraDisabled(admin) }
        rows += devicePolicyFlag(R.string.diag_restriction_screenshots) { dpm.getScreenCaptureDisabled(admin) }

        return rows
    }

    private fun devicePolicyFlag(labelRes: Int, read: () -> Boolean): GuardStatus {
        val value = runCatching(read).getOrNull()
        return GuardStatus(
            s(labelRes),
            when (value) {
                true -> GuardStatus.State.ACTIVE
                false -> GuardStatus.State.INACTIVE
                null -> GuardStatus.State.UNKNOWN
            },
            if (value == null) s(R.string.diag_detail_unreadable) else null
        )
    }

    private fun drift(inEffect: Boolean, requested: Boolean): String? = when {
        inEffect && !requested -> s(R.string.diag_detail_requested_off_still_in_effect)
        !inEffect && requested -> s(R.string.diag_detail_requested_not_applied)
        else -> null
    }

    // ---------------------------------------------------------------------- helpers
    private fun state(value: Boolean) =
        if (value) GuardStatus.State.ACTIVE else GuardStatus.State.INACTIVE

    private fun versionCode(pkg: PackageInfo?): Int {
        if (pkg == null) return 0
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            pkg.longVersionCode.toInt()
        } else {
            @Suppress("DEPRECATION")
            pkg.versionCode
        }
    }

    private fun s(resId: Int, vararg args: Any): String = app.getString(resId, *args)
}
