package com.kiosk.launcher.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LockTaskStatusTest {

    private val text = LockTaskStatus.Text(
        availableLabel = "Lock task available",
        activeLabel = "Lock task active",
        allowedApps = { "$it app(s) allowed in lock task" },
        needsOwner = "Needs device owner; lock task cannot start without it",
        notAllowed = "Ironclad OS is not allowed in lock task (re-apply the policy)",
        idle = "Configured; engages when the kiosk locks",
        unavailable = "Not available on this device yet",
        unreadable = "Could not be read on this build"
    )

    private fun rows(
        isDeviceOwner: Boolean = true,
        inLockTaskMode: Boolean = false,
        allowListedPackages: Set<String>? = setOf("com.kiosk.launcher")
    ) = LockTaskStatus.rows(
        text = text,
        packageName = "com.kiosk.launcher",
        isDeviceOwner = isDeviceOwner,
        inLockTaskMode = inLockTaskMode,
        allowListedPackages = allowListedPackages
    )

    @Test
    fun `a configured but idle kiosk reports lock task as available and not active`() {
        val (available, active) = rows(inLockTaskMode = false)

        assertEquals(GuardStatus.State.ACTIVE, available.state)
        assertEquals("1 app(s) allowed in lock task", available.detail)
        assertEquals(GuardStatus.State.INACTIVE, active.state)
        assertEquals(text.idle, active.detail)
    }

    @Test
    fun `a locked kiosk reports both rows active`() {
        val (available, active) = rows(inLockTaskMode = true)

        assertEquals(GuardStatus.State.ACTIVE, available.state)
        assertEquals(GuardStatus.State.ACTIVE, active.state)
        assertNull(active.detail)
    }

    @Test
    fun `a non owner cannot offer lock task and says why`() {
        val (available, active) = rows(isDeviceOwner = false, allowListedPackages = emptySet())

        assertEquals(GuardStatus.State.INACTIVE, available.state)
        assertEquals(text.needsOwner, available.detail)
        assertEquals(GuardStatus.State.INACTIVE, active.state)
        assertEquals(text.unavailable, active.detail)
    }

    @Test
    fun `an owner without this app in the allow list is broken rather than idle`() {
        val (available, active) = rows(allowListedPackages = setOf("com.example.other"))

        assertEquals(GuardStatus.State.INACTIVE, available.state)
        assertEquals(text.notAllowed, available.detail)
        assertEquals(GuardStatus.State.INACTIVE, active.state)
        assertEquals(text.unavailable, active.detail)
    }

    @Test
    fun `an unreadable allow list is unknown instead of inactive`() {
        val (available, _) = rows(allowListedPackages = null)

        assertEquals(GuardStatus.State.UNKNOWN, available.state)
        assertEquals(text.unreadable, available.detail)
    }

    @Test
    fun `availability row carries the allow list size`() {
        val (available, _) = rows(
            allowListedPackages = setOf("com.kiosk.launcher", "com.example.browser")
        )

        assertEquals("2 app(s) allowed in lock task", available.detail)
        assertTrue(available.state == GuardStatus.State.ACTIVE)
    }
}
