package com.kiosk.launcher.data

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.concurrent.Executors

data class AppEntry(
    val packageName: String,
    val label: String,
    val icon: Drawable
)

class InstalledAppsRepository(private val context: Context) {

    private val packageManager: PackageManager = context.packageManager
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Every app that would appear in the system launcher, sorted by label. */
    @Suppress("DEPRECATION")
    fun launchable(): List<AppEntry> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
        } else {
            packageManager.queryIntentActivities(intent, 0)
        }

        return resolved.asSequence()
            .mapNotNull { it.activityInfo?.applicationInfo }
            .filter { it.packageName != context.packageName }
            .distinctBy { it.packageName }
            .map { info ->
                AppEntry(
                    packageName = info.packageName,
                    label = packageManager.getApplicationLabel(info).toString(),
                    icon = packageManager.getApplicationIcon(info)
                )
            }
            .sortedBy { it.label.lowercase() }
            .toList()
    }

    /**
     * Scans on a worker thread and delivers the result on the main thread, so neither
     * the package-manager lookups nor icon loading block the UI.
     */
    fun launchableAsync(onLoaded: (List<AppEntry>) -> Unit) {
        scanner.execute {
            val entries = runCatching { launchable() }.getOrDefault(emptyList())
            mainHandler.post { onLoaded(entries) }
        }
    }

    fun launch(packageName: String): Boolean {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching {
            context.startActivity(intent)
            true
        }.getOrDefault(false)
    }

    private companion object {
        /** One shared worker per process, so repeated scans queue instead of stacking up. */
        val scanner = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "kiosk-app-scan").apply { isDaemon = true }
        }
    }
}
