package com.kiosk.launcher.admin

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ActivityInfo
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import androidx.test.core.app.ApplicationProvider
import com.kiosk.launcher.ui.KioskLauncherActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Verifies Home launcher resolution, Device Owner pinning verification, and Home intent matching
 * under Android 15 (API 35).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class HomeResolutionTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun pinAsHomeLauncherReturnsFalseWhenNotDeviceOwner() {
        val helper = DevicePolicyHelper(context)
        assertFalse(helper.pinAsHomeLauncher())
    }

    @Test
    fun isDefaultLauncherReflectsResolvedHomePackage() {
        val shadowPm = shadowOf(context.packageManager)
        val kioskHome = ComponentName(context, KioskLauncherActivity::class.java)
        shadowPm.addOrUpdateActivity(
            ActivityInfo().apply {
                packageName = kioskHome.packageName
                name = kioskHome.className
                applicationInfo = ApplicationInfo().apply {
                    packageName = kioskHome.packageName
                }
            }
        )
        shadowPm.addIntentFilterForActivity(
            kioskHome,
            IntentFilter(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_HOME)
                addCategory(Intent.CATEGORY_DEFAULT)
            }
        )

        val resolved = context.packageManager.resolveActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME),
            PackageManager.MATCH_DEFAULT_ONLY
        )
        assertEquals(context.packageName, resolved?.activityInfo?.packageName)
        assertTrue(DevicePolicyHelper(context).isDefaultLauncher)
    }
}
