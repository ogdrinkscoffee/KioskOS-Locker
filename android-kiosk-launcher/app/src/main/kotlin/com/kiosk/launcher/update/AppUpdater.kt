package com.kiosk.launcher.update

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import com.kiosk.launcher.BuildConfig
import com.kiosk.launcher.data.KioskPreferences
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * In-app APK updater for KioskOS.
 * Supports KioskOS /api/apk/latest JSON manifests as well as GitHub Releases /releases/latest JSON.
 * Verifies APK ZIP header + optional SHA-256 checksum and commits silent Device Owner
 * updates via PackageInstaller (with FileProvider installer fallback).
 */
object AppUpdater {

    private const val MAX_APK_BYTES = 85L * 1024L * 1024L
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    sealed class CheckResult {
        data class UpdateAvailable(val manifest: KioskPreferences.ApkReleaseManifest) : CheckResult()
        data class UpToDate(val manifest: KioskPreferences.ApkReleaseManifest) : CheckResult()
        data class Failed(val errorMessage: String) : CheckResult()
    }

    sealed class InstallOutcome {
        data class SessionCommitted(val silentDeviceOwner: Boolean) : InstallOutcome()
        data class Failed(val errorMessage: String) : InstallOutcome()
    }

    fun checkForUpdate(
        context: Context,
        manifestUrl: String,
        onResult: (CheckResult) -> Unit
    ) {
        val cleanUrl = manifestUrl.trim()
        if (!isHttpUrl(cleanUrl)) {
            onResult(CheckResult.Failed("Enter a valid https:// or http:// APK manifest URL."))
            return
        }

        executor.execute {
            try {
                val jsonText = fetchText(cleanUrl)
                val manifest = KioskPreferences.parseUpdateManifestJson(jsonText, cleanUrl)
                if (manifest == null) {
                    postMain {
                        onResult(CheckResult.Failed("No valid APK release found at manifest URL."))
                    }
                    return@execute
                }
                val isNewer = KioskPreferences.isNewerAppVersion(
                    remoteVersionCode = manifest.versionCode,
                    currentVersionCode = BuildConfig.VERSION_CODE,
                    remoteVersionName = manifest.versionName,
                    currentVersionName = BuildConfig.VERSION_NAME
                )
                postMain {
                    onResult(
                        if (isNewer) CheckResult.UpdateAvailable(manifest)
                        else CheckResult.UpToDate(manifest)
                    )
                }
            } catch (e: Exception) {
                postMain {
                    onResult(CheckResult.Failed(e.message ?: "Unable to check for APK update."))
                }
            }
        }
    }

    fun downloadAndInstallApk(
        activity: Activity,
        manifest: KioskPreferences.ApkReleaseManifest,
        onProgress: (String) -> Unit,
        onComplete: (InstallOutcome) -> Unit
    ) {
        val downloadUrl = manifest.downloadUrl.trim()
        if (!isHttpUrl(downloadUrl)) {
            onComplete(InstallOutcome.Failed("Invalid APK download URL."))
            return
        }

        val appContext = activity.applicationContext
        executor.execute {
            try {
                postMain { onProgress("Downloading v${manifest.versionName}...") }
                val cacheDir = File(appContext.cacheDir, "apk_updates").apply { mkdirs() }
                val apkFile = File(cacheDir, "kiosk-update.apk")
                if (apkFile.exists()) {
                    apkFile.delete()
                }

                val sha256 = downloadFileAndHash(downloadUrl, apkFile)
                if (apkFile.length() < 1024L || !hasApkZipMagic(apkFile)) {
                    apkFile.delete()
                    postMain {
                        onComplete(InstallOutcome.Failed("Downloaded file is not a valid APK package."))
                    }
                    return@execute
                }
                if (manifest.sha256.isNotEmpty() && !sha256.equals(manifest.sha256, ignoreCase = true)) {
                    apkFile.delete()
                    postMain {
                        onComplete(InstallOutcome.Failed("APK SHA-256 verification failed."))
                    }
                    return@execute
                }

                postMain { onProgress("Installing update (${apkFile.length() / 1024} KB)...") }
                val installedViaSession = installWithPackageInstaller(appContext, apkFile)
                if (installedViaSession) {
                    val isDo = com.kiosk.launcher.admin.DevicePolicyHelper.isDeviceOwner(appContext)
                    postMain { onComplete(InstallOutcome.SessionCommitted(silentDeviceOwner = isDo)) }
                } else {
                    postMain {
                        val opened = launchFileProviderInstaller(activity, apkFile)
                        if (opened) {
                            onComplete(InstallOutcome.SessionCommitted(silentDeviceOwner = false))
                        } else {
                            onComplete(InstallOutcome.Failed("Could not start system package installer."))
                        }
                    }
                }
            } catch (e: Exception) {
                postMain {
                    onComplete(InstallOutcome.Failed(e.message ?: "APK download or install failed."))
                }
            }
        }
    }

    private fun installWithPackageInstaller(context: Context, apkFile: File): Boolean {
        return try {
            val packageInstaller = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                setAppPackageName(context.packageName)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
            }
            val sessionId = packageInstaller.createSession(params)
            packageInstaller.openSession(sessionId).use { session ->
                FileInputStream(apkFile).use { input ->
                    session.openWrite("kiosk-update.apk", 0, apkFile.length()).use { output ->
                        input.copyTo(output)
                        session.fsync(output)
                    }
                }
                val callbackIntent = Intent(context, UpdateResultReceiver::class.java).apply {
                    action = UpdateResultReceiver.ACTION_INSTALL_RESULT
                }
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
                val pending = PendingIntent.getBroadcast(
                    context,
                    sessionId,
                    callbackIntent,
                    flags
                )
                session.commit(pending.intentSender)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun launchFileProviderInstaller(activity: Activity, apkFile: File): Boolean {
        return try {
            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                apkFile
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun fetchText(rawUrl: String): String {
        val conn = (URL(rawUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                throw IllegalStateException("Server returned HTTP $code")
            }
            return conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun downloadFileAndHash(rawUrl: String, target: File): String {
        val conn = (URL(rawUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 60_000
            instanceFollowRedirects = true
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) {
                throw IllegalStateException("APK download failed with HTTP $code")
            }
            val declaredLength = conn.contentLengthLong
            if (declaredLength > MAX_APK_BYTES) {
                throw IllegalStateException("APK exceeds maximum allowed size (85 MB).")
            }
            val digest = MessageDigest.getInstance("SHA-256")
            var totalBytes = 0L
            conn.inputStream.use { input ->
                FileOutputStream(target).use { output ->
                    val buffer = ByteArray(16_384)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        totalBytes += read
                        if (totalBytes > MAX_APK_BYTES) {
                            throw IllegalStateException("APK exceeds maximum allowed size (85 MB).")
                        }
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                    }
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        } finally {
            conn.disconnect()
        }
    }

    private fun hasApkZipMagic(file: File): Boolean {
        if (file.length() < 4L) return false
        val header = ByteArray(4)
        FileInputStream(file).use { input ->
            if (input.read(header) != 4) return false
        }
        return header[0] == 0x50.toByte() &&
            header[1] == 0x4B.toByte() &&
            header[2] == 0x03.toByte() &&
            header[3] == 0x04.toByte()
    }

    private fun isHttpUrl(url: String): Boolean {
        return url.startsWith("https://") || url.startsWith("http://")
    }

    private fun postMain(block: () -> Unit) {
        mainHandler.post(block)
    }
}
