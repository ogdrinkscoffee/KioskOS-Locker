package com.kiosk.launcher.update

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * Downloads a published APK and hands it to Android's package installer.
 *
 * Two paths, in order:
 *  1. A [PackageInstaller] session — on a provisioned kiosk the system installs the
 *     update without the admin leaving the screen.
 *  2. The standard install prompt — used when the session is refused (non-owner install,
 *     OEM builds that require a tap). The launcher adds the installer packages to lock
 *     task while this runs so the prompt is not immediately bounced back home.
 *
 * Android only accepts an update signed with the same key as the installed app, so a
 * mismatched APK fails at the platform rather than being trusted here.
 */
class UpdateInstaller(context: Context) {

    sealed interface Event {
        data class Progress(val percent: Int) : Event
        data class Failed(val reason: String) : Event
        data object ReadyToInstall : Event
        /** The system wants one confirmation tap before it will install. */
        data class NeedsUserAction(val confirmIntent: Intent? = null) : Event
        data object Installed : Event
    }

    private val appContext: Context = context.applicationContext
    private val prefs = KioskPreferences(appContext)
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Downloads and verifies on a worker; callbacks are delivered on the main thread. */
    fun download(
        manifest: UpdateManifest,
        fallbackApkUrl: String? = null,
        onEvent: (Event) -> Unit
    ) {
        fun emit(event: Event) = mainHandler.post { onEvent(event) }

        worker.execute {
            val target = File(appContext.cacheDir, "IroncladOS-${manifest.versionCode}.apk")
            val cached = target.isFile &&
                target.length() == manifest.sizeBytes &&
                checksum(target) == manifest.sha256

            if (!cached) {
                target.delete()
                val urls = listOfNotNull(manifest.apkUrl, fallbackApkUrl).distinct()
                var lastFailure: Throwable? = null
                var downloaded = false

                for (url in urls) {
                    val failure = runCatching {
                        UpdateHttpClient().download(url, target) { percent ->
                            emit(Event.Progress(percent))
                        }
                    }.exceptionOrNull()

                    if (failure == null) {
                        val validFile = target.length() == manifest.sizeBytes &&
                            checksum(target) == manifest.sha256
                        if (validFile) {
                            downloaded = true
                            break
                        }
                        lastFailure = UpdateException(FAILED_CHECKSUM)
                        target.delete()
                    } else {
                        lastFailure = failure
                        target.delete()
                    }
                }

                if (!downloaded) {
                    target.delete()
                    emit(Event.Failed(lastFailure?.message ?: FAILED_DOWNLOAD))
                    return@execute
                }
            }

            if (target.length() != manifest.sizeBytes || checksum(target) != manifest.sha256) {
                target.delete()
                emit(Event.Failed(FAILED_CHECKSUM))
                return@execute
            }
            emit(Event.ReadyToInstall)
        }
    }

    /**
     * Preferred path: installs through a package installer session. Returns false when the
     * session could not be opened, so the caller can fall back to [promptUserInstall].
     */
    fun installFromSession(apk: File, onEvent: (Event) -> Unit): Boolean {
        prefs.beginUpdateInstall()

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val status = intent?.getIntExtra(
                    PackageInstaller.EXTRA_STATUS,
                    PackageInstaller.STATUS_FAILURE
                ) ?: PackageInstaller.STATUS_FAILURE
                val message = intent?.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)

                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    val confirmIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent?.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent?.getParcelableExtra(Intent.EXTRA_INTENT)
                    }
                    // Keep the receiver registered and keep the APK file intact while the
                    // user responds to the system confirmation dialog.
                    onEvent(Event.NeedsUserAction(confirmIntent))
                    return
                }

                when (status) {
                    PackageInstaller.STATUS_SUCCESS -> {
                        prefs.finishUpdateInstall()
                        onEvent(Event.Installed)
                    }
                    else -> {
                        prefs.finishUpdateInstall()
                        onEvent(Event.Failed(message ?: FAILED_INSTALL))
                    }
                }

                runCatching { appContext.unregisterReceiver(this) }
                runCatching { apk.delete() }
            }
        }

        return runCatching {
            val installer = appContext.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(appContext.packageName)
            val sessionId = installer.createSession(params)

            installer.openSession(sessionId).use { session ->
                apk.inputStream().use { input ->
                    session.openWrite("base.apk", 0, apk.length()).use { output ->
                        input.copyTo(output)
                        session.fsync(output)
                    }
                }

                ContextCompat.registerReceiver(
                    appContext,
                    receiver,
                    IntentFilter(ACTION_INSTALL_STATUS),
                    ContextCompat.RECEIVER_NOT_EXPORTED
                )

                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
                val pending = PendingIntent.getBroadcast(
                    appContext,
                    sessionId,
                    Intent(ACTION_INSTALL_STATUS).setPackage(appContext.packageName),
                    flags
                )
                session.commit(pending.intentSender)
            }
            true
        }.getOrElse {
            runCatching { appContext.unregisterReceiver(receiver) }
            prefs.finishUpdateInstall()
            false
        }
    }

    /**
     * Fallback: the standard installer UI. The admin sees Android's own "Update app?"
     * dialog; lock task is relaxed just enough for it to appear over the launcher.
     *
     * Returns false when the permission to install is missing — the caller is sent to
     * the system screen that grants it, and no install starts.
     */
    fun promptUserInstall(activity: Activity, apk: File): Boolean {
        val policy = DevicePolicyHelper(activity)
        if (!canInstall(appContext)) {
            prefs.finishUpdateInstall()
            if (policy.isInLockTaskMode()) {
                prefs.grantTemporaryAdminWindow()
                policy.applyPolicy()
                policy.stopKiosk(activity)
            }
            runCatching {
                activity.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${appContext.packageName}")
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
            return false
        }

        val uri: Uri = runCatching {
            FileProvider.getUriForFile(appContext, "${appContext.packageName}.updates", apk)
        }.getOrElse {
            prefs.finishUpdateInstall()
            return false
        }

        prefs.beginUpdateInstall()
        policy.refreshLockTaskPackages()

        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return runCatching {
            activity.startActivity(viewIntent)
            true
        }.getOrElse {
            @Suppress("DEPRECATION")
            val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                data = uri
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                putExtra(Intent.EXTRA_RETURN_RESULT, true)
            }
            runCatching {
                activity.startActivity(installIntent)
                true
            }.getOrElse {
                prefs.finishUpdateInstall()
                false
            }
        }
    }

    companion object {
        private const val ACTION_INSTALL_STATUS = "com.kiosk.launcher.INSTALL_STATUS"
        private const val FAILED_DOWNLOAD = "download_failed"
        private const val FAILED_CHECKSUM = "checksum_mismatch"
        private const val FAILED_INSTALL = "install_failed"

        fun canInstall(context: Context): Boolean =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.packageManager.canRequestPackageInstalls()
            } else {
                true
            }

        fun checksum(file: File): String = runCatching {
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { stream ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    val read = stream.read(buffer)
                    if (read <= 0) break
                    digest.update(buffer, 0, read)
                }
            }
            digest.digest().joinToString("") { "%02x".format(it) }
        }.getOrDefault("")

        private val worker = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "kiosk-update").apply { isDaemon = true }
        }
    }
}
