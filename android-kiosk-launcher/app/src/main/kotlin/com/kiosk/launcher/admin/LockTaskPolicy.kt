package com.kiosk.launcher.admin

/**
 * Decides when the launcher should hold the device in lock task mode.
 *
 * `setLockTaskPackages` only *allows* lock task; the mode is entered by
 * `startLockTask()`, which Android refuses for anything but a device owner. Entering
 * it in preview mode would raise the screen-pinning confirmation instead of a kiosk,
 * and entering it while an admin holds the temporary unlock window would undo the
 * escape hatch that reaches system settings. Kept free of Android types so the rule
 * is unit-testable off-device.
 *
 * An in-app update is the third exception: the installer needs to be able to open over
 * the launcher, which a held lock task would block.
 */
object LockTaskPolicy {

    fun shouldStart(
        isDeviceOwner: Boolean,
        temporaryAdminUnlockActive: Boolean,
        inLockTaskMode: Boolean
    ): Boolean = isDeviceOwner && !temporaryAdminUnlockActive && !inLockTaskMode

    fun shouldStartDuringUpdate(
        isDeviceOwner: Boolean,
        temporaryAdminUnlockActive: Boolean,
        inLockTaskMode: Boolean,
        installingUpdate: Boolean
    ): Boolean = shouldStart(isDeviceOwner, temporaryAdminUnlockActive, inLockTaskMode) && !installingUpdate
}
