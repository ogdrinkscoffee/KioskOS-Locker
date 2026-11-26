package com.kiosk.launcher.recovery

/**
 * The whole decision behind self-recovery, kept free of Android types so it is unit-testable.
 *
 * A pinned kiosk with no adb has nobody to restart it: if the launcher process dies while one of
 * its screens is up, the device just goes dark. The watchdog may only act on that one case,
 * because pulling the launcher forward in any other state would interrupt the kiosk on purpose:
 *
 * - a kiosk app, the lock screen or a dark display pauses every one of this app's activities, so
 *   nothing may be yanked back in front of what the operator is doing;
 * - the admin's temporary window and an in-app update both mean the launcher is meant to be away;
 * - a kiosk that is switched off, or whose Home another launcher owns, is not ours to restore.
 *
 * [com.kiosk.launcher.KioskApplication] records whether one of our activities is in front and
 * refreshes a heartbeat from a 30-second loop. A visible kiosk whose heartbeat stops can only
 * mean the process died on screen, which is exactly the state that needs restoring.
 */
object RecoveryPolicy {

    enum class Action { NONE, RESTORE }

    /** Two minutes of silence is a death: a live process beats every 30 seconds. */
    const val STALE_AFTER_MS = 120_000L

    /** The watchdog is only armed for a kiosk this app actually owns; nothing else to protect. */
    fun shouldWatch(kioskEnabled: Boolean?, isDefaultLauncher: Boolean): Boolean =
        kioskEnabled == true && isDefaultLauncher

    fun decide(
        kioskEnabled: Boolean?,
        isDefaultLauncher: Boolean,
        kioskUiVisible: Boolean,
        lastHeartbeatMs: Long,
        nowMs: Long,
        adminWindowOpen: Boolean,
        installingUpdate: Boolean
    ): Action {
        if (!shouldWatch(kioskEnabled, isDefaultLauncher)) return Action.NONE
        if (adminWindowOpen || installingUpdate) return Action.NONE
        if (!kioskUiVisible) return Action.NONE
        // A zero heartbeat cannot prove the process is alive, so it counts as silence.
        if (lastHeartbeatMs > 0L && nowMs - lastHeartbeatMs <= STALE_AFTER_MS) return Action.NONE
        return Action.RESTORE
    }
}
