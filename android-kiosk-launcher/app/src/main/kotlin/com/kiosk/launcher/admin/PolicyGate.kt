package com.kiosk.launcher.admin

/**
 * Decides what [DevicePolicyHelper.applyPolicy] does on this pass.
 *
 * The explicit kiosk state is the opt-in; Home ownership is only what lets the policy
 * take effect, so an enabled kiosk that is not the Home app is waiting rather than
 * enforcing. Switching the kiosk off releases everything straight away, even while this
 * app is still Home (a non-owner cannot change Home itself), and another launcher
 * owning Home always releases, because a device-owner install must not keep a phone
 * restricted that never chose this launcher. When Home does not resolve — boot, or the
 * system picker being open — the device is left alone rather than guessed at. Kept free
 * of Android types so the rule is unit-testable off-device.
 */
object PolicyGate {

    enum class Action { ENFORCE, RELEASE, LEAVE }

    fun decide(
        kioskEnabled: Boolean?,
        isDefaultLauncher: Boolean,
        anotherLauncherOwnsHome: Boolean
    ): Action = when {
        kioskEnabled == true && isDefaultLauncher -> Action.ENFORCE
        kioskEnabled == false || anotherLauncherOwnsHome -> Action.RELEASE
        else -> Action.LEAVE
    }
}
