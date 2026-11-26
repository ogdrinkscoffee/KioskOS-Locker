package com.kiosk.launcher.admin

import android.content.ComponentName
import android.content.Context
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Verifies [SystemFeatureResolver] exposes essential telephony, Google Play Services,
 * permission controller, and installer packages safely under Lock Task Mode.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SystemFeatureResolverTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun callingAndGoogleServicesAreAlwaysIncludedInEssentialSets() {
        val resolver = SystemFeatureResolver(context)
        val calling = resolver.callingPackages()
        val system = resolver.essentialSystemPackages()
        val protectedPkgs = resolver.protectedFromUninstallLockPackages()

        assertTrue("com.android.server.telecom" in calling)
        assertTrue("com.google.android.dialer" in calling)
        assertTrue("com.android.emergency" in calling)

        assertTrue("com.google.android.gms" in system)
        assertTrue("com.google.android.gsf" in system)
        assertTrue("com.google.android.permissioncontroller" in system)

        assertTrue(context.packageName in protectedPkgs)
        assertTrue("com.google.android.gms" in protectedPkgs)
        assertTrue(DevicePolicyHelper.PLAY_STORE_PACKAGE in protectedPkgs)
    }

    @Test
    fun permissionControllerPackageNameResolvesSystemHandlerOnly() {
        val shadowPm = shadowOf(context.packageManager)
        val resolver = SystemFeatureResolver(context)

        val userAppComponent = ComponentName("com.example.fakeperm", "com.example.fakeperm.GrantActivity")
        shadowPm.addOrUpdateActivity(
            ActivityInfo().apply {
                packageName = userAppComponent.packageName
                name = userAppComponent.className
                applicationInfo = ApplicationInfo().apply {
                    packageName = userAppComponent.packageName
                    flags = 0
                }
            }
        )
        shadowPm.addIntentFilterForActivity(
            userAppComponent,
            IntentFilter("android.content.pm.action.REQUEST_PERMISSIONS").apply {
                addCategory(android.content.Intent.CATEGORY_DEFAULT)
            }
        )
        assertNull(resolver.permissionControllerPackageName)

        val systemComponent = ComponentName("com.oem.permissioncontroller", "com.oem.permissioncontroller.GrantActivity")
        shadowPm.addOrUpdateActivity(
            ActivityInfo().apply {
                packageName = systemComponent.packageName
                name = systemComponent.className
                applicationInfo = ApplicationInfo().apply {
                    packageName = systemComponent.packageName
                    flags = ApplicationInfo.FLAG_SYSTEM
                }
            }
        )
        shadowPm.addIntentFilterForActivity(
            systemComponent,
            IntentFilter("android.content.pm.action.REQUEST_PERMISSIONS").apply {
                addCategory(android.content.Intent.CATEGORY_DEFAULT)
            }
        )

        resolver.invalidateCache()
        assertEquals("com.oem.permissioncontroller", resolver.permissionControllerPackageName)
        assertTrue("com.oem.permissioncontroller" in resolver.essentialSystemPackages())
    }

    @Test
    fun uninstallProtectionNeverIncludesCoreSystemOrCallingPackages() {
        val resolver = SystemFeatureResolver(context)
        resolver.invalidateCache()

        val targets = UninstallBlocks.blockTargets(
            installed = listOf(
                context.packageName,
                "com.google.android.gms",
                "com.android.vending",
                "com.android.server.telecom",
                "com.example.userapp"
            ),
            ownPackage = context.packageName,
            protectedPackages = resolver.protectedFromUninstallLockPackages()
        )

        assertTrue("com.example.userapp" in targets)
        assertFalse("com.google.android.gms" in targets)
        assertFalse("com.android.vending" in targets)
        assertFalse("com.android.server.telecom" in targets)
        assertFalse(context.packageName in targets)
    }
}
