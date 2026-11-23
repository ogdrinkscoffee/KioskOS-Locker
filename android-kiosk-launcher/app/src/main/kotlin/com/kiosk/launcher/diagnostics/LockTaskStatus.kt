package com.kiosk.launcher.diagnostics

/**
 * Lock task is two different facts: whether the device is *able* to hold the kiosk
 * (device owner plus this app in the allow list) and whether it is *holding* it right
 * now. A healthy kiosk sits between those states whenever the admin unlock window is
 * open or the screen is briefly handed over, so reporting only the live flag made an
 * already configured device read as a broken kiosk.
 *
 * Kept free of Android types so the mapping can be tested without a device.
 */
object LockTaskStatus {

    /** Resolved strings, so the collector stays the only place that knows resources. */
    data class Text(
        val availableLabel: String,
        val activeLabel: String,
        val allowedApps: (Int) -> String,
        val needsOwner: String,
        val notAllowed: String,
        val idle: String,
        val unavailable: String,
        val unreadable: String
    )

    /**
     * [allowListedPackages] is what Android reports as allowed in lock task, or null
     * when it could not be read at all.
     */
    fun rows(
        text: Text,
        packageName: String,
        isDeviceOwner: Boolean,
        inLockTaskMode: Boolean,
        allowListedPackages: Set<String>?
    ): List<GuardStatus> {
        val available = isDeviceOwner && allowListedPackages?.contains(packageName) == true

        val availableRow = when {
            !isDeviceOwner -> GuardStatus(text.availableLabel, GuardStatus.State.INACTIVE, text.needsOwner)
            allowListedPackages == null ->
                GuardStatus(text.availableLabel, GuardStatus.State.UNKNOWN, text.unreadable)
            !available ->
                GuardStatus(text.availableLabel, GuardStatus.State.INACTIVE, text.notAllowed)
            else -> GuardStatus(
                text.availableLabel,
                GuardStatus.State.ACTIVE,
                text.allowedApps(allowListedPackages.size)
            )
        }

        val activeRow = GuardStatus(
            text.activeLabel,
            if (inLockTaskMode) GuardStatus.State.ACTIVE else GuardStatus.State.INACTIVE,
            when {
                inLockTaskMode -> null
                available -> text.idle
                else -> text.unavailable
            }
        )

        return listOf(availableRow, activeRow)
    }
}
