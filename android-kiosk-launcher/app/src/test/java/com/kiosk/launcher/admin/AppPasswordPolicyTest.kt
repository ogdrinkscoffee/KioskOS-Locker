package com.kiosk.launcher.admin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppPasswordPolicyTest {

    @Test
    fun requiresPasswordMatchesProtectedPackagesOnly() {
        val protectedSet = setOf("com.whatsapp", "com.android.chrome")

        assertTrue(AppPasswordPolicy.requiresPassword("com.whatsapp", protectedSet))
        assertFalse(AppPasswordPolicy.requiresPassword("com.android.dialer", protectedSet))
        assertFalse(AppPasswordPolicy.requiresPassword("", protectedSet))
        assertFalse(AppPasswordPolicy.requiresPassword("   ", setOf("   ")))
    }

    @Test
    fun filterQuickLaunchPackagesRespectsAllowlistAndCap() {
        val selected = listOf(
            "app.one",
            "app.two",
            "app.blocked",
            "app.two",
            "app.three",
            "app.four",
            "app.five",
            "app.six",
            "app.seven"
        )
        val allowed = setOf("app.one", "app.two", "app.three", "app.four", "app.five", "app.six", "app.seven")

        val result = AppPasswordPolicy.filterQuickLaunchPackages(
            selectedPackages = selected,
            allowAllApps = false,
            allowedPackages = allowed,
            panicLocked = false,
            callingPackages = emptySet()
        )

        assertEquals(
            listOf("app.one", "app.two", "app.three", "app.four", "app.five", "app.six"),
            result
        )
    }

    @Test
    fun filterQuickLaunchPackagesRestrictsToCallingAppsDuringPanic() {
        val result = AppPasswordPolicy.filterQuickLaunchPackages(
            selectedPackages = listOf("com.android.dialer", "com.whatsapp", "com.android.chrome"),
            allowAllApps = true,
            allowedPackages = setOf("com.android.dialer", "com.whatsapp"),
            panicLocked = true,
            callingPackages = setOf("com.android.dialer")
        )

        assertEquals(listOf("com.android.dialer"), result)
    }
}
