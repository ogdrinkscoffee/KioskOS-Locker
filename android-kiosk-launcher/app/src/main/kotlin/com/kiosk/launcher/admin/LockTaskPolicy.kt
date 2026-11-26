package com.kiosk.launcher.admin

/**
 * Decides when the launcher should hold the device in lock task mode.
 *
 * `setLockTaskPackages` only *allows* lock task; the mode is entered by
 * `startLockTask()`, which Android refuses for anything but a device owner. Entering
 * it in preview mode would raise the screen-pinning confirmation instead of a kiosk,
 * entering it while an admin holds the temporary unlock window would undo the
 * escape hatch that reaches system settings, entering it outside a scheduled kiosk window would
 * keep a device pinned during the hours it is meant to be a normal phone, and entering it while
 * another launcher owns Home would trap a phone that never opted into the kiosk (no Settings, no
 * other apps — not even the package installer). Kept free of Android types so the rule is
 * unit-testable off-device.
 *
 * An in-app update is the last exception: the installer needs to be able to open over
 * the launcher, which a held lock task would block.
 */
object LockTaskPolicy {

    fun shouldStart(
        isDeviceOwner: Boolean,
        isDefaultLauncher: Boolean,
        temporaryAdminUnlockActive: Boolean,
        scheduleKioskActive: Boolean,
        inLockTaskMode: Boolean
    ): Boolean = isDeviceOwner && isDefaultLauncher && !temporaryAdminUnlockActive &&
        scheduleKioskActive && !inLockTaskMode

    fun shouldStartDuringUpdate(
        isDeviceOwner: Boolean,
        isDefaultLauncher: Boolean,
        temporaryAdminUnlockActive: Boolean,
        scheduleKioskActive: Boolean,
        inLockTaskMode: Boolean,
        installingUpdate: Boolean
    ): Boolean =
        shouldStart(
            isDeviceOwner = isDeviceOwner,
            isDefaultLauncher = isDefaultLauncher,
            temporaryAdminUnlockActive = temporaryAdminUnlockActive,
            scheduleKioskActive = scheduleKioskActive,
            inLockTaskMode = inLockTaskMode
        ) && !installingUpdate
}
