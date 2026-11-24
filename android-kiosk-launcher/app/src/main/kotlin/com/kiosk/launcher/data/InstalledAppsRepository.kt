package com.kiosk.launcher.data

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.os.Build

data class InstalledAppInfo(
    val packageName: String,
    val label: String,
    val icon: Drawable?,
    val isSystemRestricted: Boolean
)

object InstalledAppsRepository {

    private val RESTRICTED_SYSTEM_PACKAGES = setOf(
        "com.android.settings",
        "com.android.packageinstaller",
        "com.google.android.packageinstaller",
        "com.samsung.android.packageinstaller",
        "com.miui.packageinstaller",
        "com.oplus.packageinstaller",
        "com.coloros.packageinstaller",
        "com.android.permissioncontroller",
        "com.google.android.permissioncontroller",
        "com.android.vending"
    )

    fun loadLaunchableApps(context: Context): List<InstalledAppInfo> {
        val pm = context.packageManager
        val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }

        val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(
                mainIntent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_ALL.toLong())
            )
        } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(mainIntent, PackageManager.MATCH_ALL)
        }

        return resolved
            .asSequence()
            .mapNotNull { info ->
                val pkg = info.activityInfo?.packageName ?: return@mapNotNull null
                if (pkg == context.packageName) return@mapNotNull null
                val label = info.loadLabel(pm)?.toString().orEmpty().ifBlank { pkg }
                val icon = try {
                    info.loadIcon(pm)
                } catch (_: Exception) {
                    null
                }
                InstalledAppInfo(
                    packageName = pkg,
                    label = label,
                    icon = icon,
                    isSystemRestricted = pkg in RESTRICTED_SYSTEM_PACKAGES
                )
            }
            .distinctBy { it.packageName }
            .sortedBy { it.label.lowercase() }
            .toList()
    }
}
