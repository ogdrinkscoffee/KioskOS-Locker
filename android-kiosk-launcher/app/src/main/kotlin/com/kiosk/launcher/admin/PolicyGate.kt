package com.kiosk.launcher.admin

/**
 * Decides what [DevicePolicyHelper.applyPolicy] does on this pass.
 *
 * The explicit kiosk state is the opt-in, Home ownership is only what lets the policy take effect,
 * and the schedule says whether this is kiosk time at all. Outside a scheduled window the policy is
 * released — no restrictions, no lock task packages — so the device behaves like a normal phone,
 * while the opt-in stays recorded so the next window enforces again on its own.
 *
 * Switching the kiosk off releases everything straight away, even while this app is still Home (a
 * non-owner cannot change Home itself), and another launcher owning Home always releases, because a
 * device-owner install must not keep a phone restricted that never chose this launcher. When Home
 * does not resolve — boot, or the system picker being open — the device is left alone rather than
 * guessed at. Kept free of Android types so the rule is unit-testable off-device.
 */
object PolicyGate {

    enum class Action { ENFORCE, RELEASE, LEAVE }

    fun decide(
        kioskEnabled: Boolean?,
        isDefaultLauncher: Boolean,
        anotherLauncherOwnsHome: Boolean,
        scheduleKioskActive: Boolean
    ): Action = when {
        anotherLauncherOwnsHome -> Action.RELEASE
        kioskEnabled == false -> Action.RELEASE
        // Outside a kiosk window the device is a normal phone; the opt-in is kept for later.
        kioskEnabled == true && !scheduleKioskActive -> Action.RELEASE
        kioskEnabled == true && isDefaultLauncher -> Action.ENFORCE
        else -> Action.LEAVE
    }
}
