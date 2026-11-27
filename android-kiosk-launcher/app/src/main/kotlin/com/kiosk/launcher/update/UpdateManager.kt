package com.kiosk.launcher.update

import android.app.Activity
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences

/**
 * One place for "is there a newer build, and install it". The launcher checks quietly on
 * start; Admin uses the same object for the automatic check + install button.
 */
class UpdateManager(private val context: Context) {

    sealed interface CheckOutcome {
        data class Success(val manifest: UpdateManifest, val resolvedFeedUrl: String) : CheckOutcome
        data class Error(val reason: String) : CheckOutcome
    }

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

    /** Primary feed location saved in Admin, or the built-in default. */
    fun feedUrl(): String {
        val stored = prefs.updateFeedUrl
        return stored.ifBlank { context.getString(R.string.update_default_feed) }
            .let(UpdateManifest::manifestUrl)
    }

    /** Built-in update feed chain is always available without manual configuration. */
    fun hasFeed(): Boolean = feedCandidates().isNotEmpty()

    fun feedCandidates(): List<String> {
        val list = mutableListOf<String>()
        if (prefs.updateFeedUrl.isNotBlank()) {
            list.addAll(UpdateManifest.candidateUrls(prefs.updateFeedUrl))
        }
        list.addAll(UpdateManifest.candidateUrls(context.getString(R.string.update_default_feed)))
        list.add(GITHUB_RAW_FEED)
        return list.distinct()
    }

    /**
     * Fetches the manifest off the main thread across the candidate feed URLs.
     */
    fun check(onResult: (UpdateManifest?) -> Unit) {
        checkDetailed { outcome ->
            onResult((outcome as? CheckOutcome.Success)?.manifest)
        }
    }

    fun checkDetailed(onResult: (CheckOutcome) -> Unit) {
        val candidates = feedCandidates()
        if (candidates.isEmpty()) {
            mainHandler.post { onResult(CheckOutcome.Error("no_feed")) }
            return
        }
        worker.execute {
            val client = UpdateHttpClient()
            var lastError: String? = null
            var best: CheckOutcome.Success? = null

            for (url in candidates) {
                val bodyResult = runCatching { client.fetchText(url) }
                if (bodyResult.isFailure) {
                    lastError = bodyResult.exceptionOrNull()?.message ?: "network_error"
                    continue
                }
                val manifest = UpdateManifest.parse(bodyResult.getOrNull().orEmpty(), url)
                if (manifest != null) {
                    if (best == null || manifest.versionCode > best.manifest.versionCode) {
                        best = CheckOutcome.Success(manifest, url)
                    }
                    if (isUpdateAvailable(manifest)) {
                        break
                    }
                } else {
                    lastError = "invalid_manifest"
                }
            }

            prefs.lastUpdateCheckMs = System.currentTimeMillis()
            val outcome: CheckOutcome = best ?: CheckOutcome.Error(lastError ?: "unreachable")
            mainHandler.post { onResult(outcome) }
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
        activity: Activity,
        manifest: UpdateManifest,
        resolvedFeedUrl: String? = null,
        onEvent: (UpdateInstaller.Event) -> Unit
    ) {
        val fallbackApkUrl = resolvedFeedUrl?.let { UpdateManifest.siblingApkUrl(it) }
        val installer = UpdateInstaller(activity)
        installer.download(manifest, fallbackApkUrl = fallbackApkUrl, onEvent = { event ->
            when (event) {
                is UpdateInstaller.Event.ReadyToInstall -> {
                    val file = java.io.File(
                        activity.cacheDir,
                        "IroncladOS-${manifest.versionCode}.apk"
                    )
                    // Mark update install active BEFORE refreshing lock task packages so
                    // INSTALLER_PACKAGES are always included.
                    prefs.beginUpdateInstall()
                    DevicePolicyHelper(activity).refreshLockTaskPackages()

                    val sessionStarted = installer.installFromSession(file) { installEvent ->
                        if (installEvent is UpdateInstaller.Event.NeedsUserAction) {
                            val confirm = installEvent.confirmIntent
                            val launchedConfirm = confirm != null && runCatching {
                                activity.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                true
                            }.getOrDefault(false)

                            if (launchedConfirm) {
                                onEvent(installEvent)
                            } else if (!installer.promptUserInstall(activity, file)) {
                                onEvent(
                                    UpdateInstaller.Event.Failed(
                                        context.getString(R.string.update_install_permission)
                                    )
                                )
                            } else {
                                onEvent(installEvent)
                            }
                        } else {
                            onEvent(installEvent)
                        }
                    }
                    if (!sessionStarted) {
                        if (!installer.promptUserInstall(activity, file)) {
                            onEvent(
                                UpdateInstaller.Event.Failed(
                                    context.getString(R.string.update_install_permission)
                                )
                            )
                        } else {
                            onEvent(UpdateInstaller.Event.NeedsUserAction())
                        }
                    }
                }
                else -> onEvent(event)
            }
        })
    }

    private companion object {
        const val GITHUB_RAW_FEED =
            "https://raw.githubusercontent.com/ogdrinkscoffee/KioskOS-Locker/main/public/downloads/latest.json"

        val worker = java.util.concurrent.Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "kiosk-update-check").apply { isDaemon = true }
        }
        val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    }
}
