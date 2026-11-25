package com.kiosk.launcher.admin

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telecom.TelecomManager

/**
 * Dynamically discovers telephony, essential Google services, permission controllers, and
 * package installers using standard Android intent filtering and system roles.
 *
 * Intent-resolved system helpers and installers are filtered to system / updated-system apps
 * so unapproved third-party apps cannot bypass kiosk allowlists merely by declaring broad
 * intents like [Intent.ACTION_GET_CONTENT] or [Intent.ACTION_CHOOSER].
 */
class SystemFeatureResolver(context: Context) {

    private val appContext: Context = context.applicationContext

    @Volatile
    private var cachedSnapshot: Snapshot? = null

    private data class Snapshot(
        val expiresAtMs: Long,
        val calling: Set<String>,
        val essentialSystem: Set<String>,
        val installers: Set<String>
    )

    fun invalidateCache() {
        cachedSnapshot = null
    }

    fun callingPackages(nowMs: Long = System.currentTimeMillis()): Set<String> =
        snapshot(nowMs).calling

    fun essentialSystemPackages(nowMs: Long = System.currentTimeMillis()): Set<String> =
        snapshot(nowMs).essentialSystem

    fun installerPackages(nowMs: Long = System.currentTimeMillis()): Set<String> =
        snapshot(nowMs).installers

    fun protectedFromUninstallLockPackages(nowMs: Long = System.currentTimeMillis()): Set<String> {
        val snap = snapshot(nowMs)
        return LinkedHashSet<String>().apply {
            add(appContext.packageName)
            addAll(snap.calling)
            addAll(snap.essentialSystem)
            addAll(snap.installers)
            add(DevicePolicyHelper.PLAY_STORE_PACKAGE)
        }
    }

    private fun snapshot(nowMs: Long): Snapshot {
        val existing = cachedSnapshot
        if (existing != null && nowMs < existing.expiresAtMs) {
            return existing
        }
        val fresh = Snapshot(
            expiresAtMs = nowMs + CACHE_TTL_MS,
            calling = resolveCallingPackages(),
            essentialSystem = resolveEssentialSystemPackages(),
            installers = resolveInstallerPackages()
        )
        cachedSnapshot = fresh
        return fresh
    }

    private fun resolveCallingPackages(): Set<String> {
        val packages = LinkedHashSet<String>()
        packages.addAll(DevicePolicyHelper.CALLING_PACKAGES)

        runCatching {
            val telecom = appContext.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
            telecom?.defaultDialerPackage?.takeIf { it.isNotBlank() }?.let { packages.add(it) }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                telecom?.systemDialerPackage?.takeIf { it.isNotBlank() }?.let { packages.add(it) }
            }
        }

        // Standard telephony intent filters (with and without tel: scheme, plus emergency & InCallService).
        packages.addAll(queryActivityPackages(Intent(Intent.ACTION_DIAL), systemOnly = false))
        packages.addAll(queryActivityPackages(Intent(Intent.ACTION_DIAL, Uri.parse("tel:0")), systemOnly = false))
        packages.addAll(queryActivityPackages(Intent(Intent.ACTION_VIEW, Uri.parse("tel:0")), systemOnly = true))
        packages.addAll(queryActivityPackages(Intent(Intent.ACTION_CALL_BUTTON), systemOnly = true))
        packages.addAll(queryActivityPackages(Intent("android.intent.action.CALL_EMERGENCY", Uri.parse("tel:911")), systemOnly = true))
        packages.addAll(queryServicePackages(Intent("android.telecom.InCallService"), systemOnly = false))
        packages.addAll(queryServicePackages(Intent("android.telecom.ConnectionService"), systemOnly = true))

        return packages
    }

    private fun resolveEssentialSystemPackages(): Set<String> {
        val packages = LinkedHashSet<String>()
        packages.addAll(DevicePolicyHelper.ESSENTIAL_SYSTEM_PACKAGES)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            runCatching { appContext.packageManager.permissionControllerPackageName }
                .getOrNull()
                ?.takeIf { it.isNotBlank() }
                ?.let { packages.add(it) }
        }

        // Standard Google Play Services / Auth / Credential Manager / Location Accuracy intents.
        val systemActivityIntents = listOf(
            Intent("com.google.android.gms.common.account.CHOOSE_ACCOUNT"),
            Intent("com.google.android.gms.auth.GOOGLE_SIGN_IN"),
            Intent("com.google.android.gms.auth.api.credentials.PICKER"),
            Intent("com.google.android.gms.location.settings.LOCATION_ACCURACY"),
            Intent("androidx.credentials.ACTION_GET_CREDENTIAL"),
            Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),
            Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"),
            Intent("android.provider.action.PICK_IMAGES"),
            Intent(Intent.ACTION_CHOOSER),
            Intent("android.net.conn.CAPTIVE_PORTAL")
        )
        systemActivityIntents.forEach { intent ->
            packages.addAll(queryActivityPackages(intent, systemOnly = true))
        }

        val systemServiceIntents = listOf(
            Intent("android.service.credentials.CredentialProviderService"),
            Intent("android.speech.RecognitionService")
        )
        systemServiceIntents.forEach { intent ->
            packages.addAll(queryServicePackages(intent, systemOnly = true))
        }

        return packages
    }

    private fun resolveInstallerPackages(): Set<String> {
        val packages = LinkedHashSet<String>()
        packages.addAll(DevicePolicyHelper.INSTALLER_PACKAGES)

        val apkUri = Uri.parse("content://${appContext.packageName}.updates/probe.apk")
        packages.addAll(
            queryActivityPackages(
                Intent(Intent.ACTION_VIEW).setDataAndType(apkUri, "application/vnd.android.package-archive"),
                systemOnly = true
            )
        )
        @Suppress("DEPRECATION")
        packages.addAll(
            queryActivityPackages(
                Intent(Intent.ACTION_INSTALL_PACKAGE).setDataAndType(apkUri, "application/vnd.android.package-archive"),
                systemOnly = true
            )
        )
        packages.addAll(
            queryActivityPackages(
                Intent(Intent.ACTION_DELETE, Uri.parse("package:${appContext.packageName}")),
                systemOnly = true
            )
        )
        return packages
    }

    @Suppress("DEPRECATION")
    private fun queryActivityPackages(intent: Intent, systemOnly: Boolean): Set<String> = runCatching {
        val pm = appContext.packageManager
        val list = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(
                intent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong())
            )
        } else {
            pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        }
        list.mapNotNull { info ->
            val ai = info.activityInfo ?: return@mapNotNull null
            val pkg = ai.packageName?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            if (systemOnly && !isSystemApp(ai.applicationInfo)) return@mapNotNull null
            pkg
        }.toSet()
    }.getOrDefault(emptySet())

    @Suppress("DEPRECATION")
    private fun queryServicePackages(intent: Intent, systemOnly: Boolean): Set<String> = runCatching {
        val pm = appContext.packageManager
        val list = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentServices(intent, PackageManager.ResolveInfoFlags.of(0L))
        } else {
            pm.queryIntentServices(intent, 0)
        }
        list.mapNotNull { info ->
            val si = info.serviceInfo ?: return@mapNotNull null
            val pkg = si.packageName?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            if (systemOnly && !isSystemApp(si.applicationInfo)) return@mapNotNull null
            pkg
        }.toSet()
    }.getOrDefault(emptySet())

    private fun isSystemApp(applicationInfo: ApplicationInfo?): Boolean {
        val ai = applicationInfo ?: return false
        return (ai.flags and (ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP)) != 0
    }

    private companion object {
        const val CACHE_TTL_MS = 30_000L
    }
}
