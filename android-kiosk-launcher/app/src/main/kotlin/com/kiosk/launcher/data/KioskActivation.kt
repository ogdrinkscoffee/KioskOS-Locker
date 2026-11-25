package com.kiosk.launcher.data

/**
 * Decides the explicit kiosk state for installs that predate [KioskPreferences.kioskEnabled].
 *
 * Being the device owner is a permission, not consent, and neither is a Home pin an older
 * build applied by force. But a device that was already running as the Home app has been
 * in kiosk service, so an upgrade must not hand it back unless an admin asked: only an
 * install that never owned Home is released. Once a value is recorded it is final, so the
 * decision is never re-made from device state.
 */
object KioskActivation {

    enum class Source {
        /** Chosen in Admin, or migrated by an earlier launch. */
        EXPLICIT,

        /** 1.3.1 stored the Admin switch in `home_launcher_declined`. */
        LEGACY_SWITCH,

        /** Home already resolved to this app when the explicit flag first appeared. */
        HOME_OWNER,

        /** No explicit choice, and Home belonged to another launcher. */
        NEVER_OPTED_IN
    }

    data class Decision(val enabled: Boolean, val source: Source) {
        val migrated: Boolean get() = source != Source.EXPLICIT
    }

    fun resolve(recorded: Boolean?, legacyDeclined: Boolean?, homeIsKiosk: Boolean): Decision =
        when {
            recorded != null -> Decision(recorded, Source.EXPLICIT)
            legacyDeclined != null -> Decision(!legacyDeclined, Source.LEGACY_SWITCH)
            homeIsKiosk -> Decision(true, Source.HOME_OWNER)
            else -> Decision(false, Source.NEVER_OPTED_IN)
        }
}
