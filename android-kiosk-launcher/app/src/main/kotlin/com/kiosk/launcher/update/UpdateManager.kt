package com.kiosk.launcher.update

import android.content.Context
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences

/**
 * One place for "is there a newer build, and install it". The launcher checks quietly on
 * start; Admin uses the same object for the manual check and the install button.
 */
class UpdateManager(private val context: Context) {

    private val prefs = KioskPreferences(context)

    /** Build baked into whatever is installed right now. */
    fun installedVersionName(): String = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }.getOrDefault("?") ?: "?"

    fun installedVersionCode(): Int = runCatching {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            info.longVersionCode.toInt()
        } else {
            @Suppress("DEPRECATION")
            info.versionCode
        }
    }.getOrDefault(0)

    /** Feed location saved in Admin, or the built-in default. */
    fun feedUrl(): String {
        val stored = prefs.updateFeedUrl
        return stored.ifBlank { context.getString(R.string.update_default_feed) }.let(UpdateManifest::manifestUrl)
    }

    fun hasFeed(): Boolean = feedUrl().startsWith("https://")

    /**
     * Fetches the manifest off the main thread. [onResult] receives null when the feed is
     * unreachable or invalid; failures are never treated as "up to date".
     */
    fun check(onResult: (UpdateManifest?) -> Unit) {
        val feed = feedUrl()
        if (!feed.startsWith("https://")) {
            onResult(null)
            return
        }
        worker.execute {
            val manifest = runCatching {
                UpdateManifest.parse(UpdateHttpClient().fetchText(feed))
            }.getOrNull()
            prefs.lastUpdateCheckMs = System.currentTimeMillis()
            mainHandler.post { onResult(manifest) }
        }
    }

    fun isUpdateAvailable(manifest: UpdateManifest?): Boolean =
        manifest != null && manifest.isNewerThan(installedVersionCode())

    /** The admin dismissed this exact version; the launcher should not nag about it. */
    fun isSkipped(manifest: UpdateManifest?): Boolean =
        manifest != null && prefs.skippedUpdateVersionCode == manifest.versionCode

    fun skip(manifest: UpdateManifest?) {
        manifest ?: return
        prefs.skippedUpdateVersionCode = manifest.versionCode
    }

    fun downloadAndInstall(
        activity: android.app.Activity,
        manifest: UpdateManifest,
        onEvent: (UpdateInstaller.Event) -> Unit
    ) {
        val installer = UpdateInstaller(activity)
        installer.download(manifest, onEvent = { event ->
            when (event) {
                is UpdateInstaller.Event.ReadyToInstall -> {
                    val file = java.io.File(
                        activity.cacheDir,
                        "IroncladOS-${manifest.versionCode}.apk"
                    )
                    // Relax lock task before the installer UI can appear.
                    com.kiosk.launcher.admin.DevicePolicyHelper(activity).refreshLockTaskPackages()

                    val sessionStarted = installer.installFromSession(file) { installEvent ->
                        if (installEvent == UpdateInstaller.Event.NeedsUserAction) {
                            if (!installer.promptUserInstall(activity, file)) {
                                onEvent(UpdateInstaller.Event.Failed(context.getString(R.string.update_install_permission)))
                            }
                        } else {
                            onEvent(installEvent)
                        }
                    }
                    if (!sessionStarted) {
                        if (!installer.promptUserInstall(activity, file)) {
                            onEvent(UpdateInstaller.Event.Failed(context.getString(R.string.update_install_permission)))
                        } else {
                            onEvent(UpdateInstaller.Event.NeedsUserAction)
                        }
                    }
                }
                else -> onEvent(event)
            }
        })
    }

    private companion object {
        val worker = java.util.concurrent.Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "kiosk-update-check").apply { isDaemon = true }
        }
        val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    }
}
