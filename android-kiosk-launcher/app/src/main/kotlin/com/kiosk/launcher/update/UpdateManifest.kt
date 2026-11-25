package com.kiosk.launcher.update

import org.json.JSONObject
import java.net.URI

/**
 * What the website publishes next to the APK: enough for an installed copy to decide
 * whether it is out of date and to verify what it downloads.
 *
 * `sha256` is required — an update that cannot be verified is refused, so a half-written
 * or substituted file can never be installed over a working kiosk.
 */
data class UpdateManifest(
    val versionName: String,
    val versionCode: Int,
    val apkUrl: String,
    val sha256: String,
    val sizeBytes: Long
) {

    /** Only a strictly higher version code is an update; re-signing the same one is not. */
    fun isNewerThan(installedVersionCode: Int): Boolean = versionCode > installedVersionCode

    companion object {
        /**
         * Returns null instead of throwing: the feed is remote input and a malformed
         * document should read as "no update", not as a crash in Admin.
         */
        fun parse(json: String): UpdateManifest? = parse(json, null)

        fun parse(json: String, feedUrl: String?): UpdateManifest? = runCatching {
            val root = JSONObject(json)
            val versionName = root.optString("version").trim()
            val versionCode = root.optInt("versionCode", 0)
            val rawApkUrl = root.optString("apkUrl").trim()
            val apkUrl = resolveApkUrl(rawApkUrl, feedUrl)
            val sha256 = root.optString("sha256").trim().lowercase()
            val sizeBytes = root.optLong("sizeBytes", 0L)

            when {
                versionName.isBlank() -> null
                versionCode <= 0 -> null
                !apkUrl.startsWith("https://") -> null
                sha256.length != 64 || !sha256.all { it.isDigit() || it in 'a'..'f' } -> null
                sizeBytes <= 0L -> null
                else -> UpdateManifest(versionName, versionCode, apkUrl, sha256, sizeBytes)
            }
        }.getOrNull()

        private fun resolveApkUrl(rawApkUrl: String, feedUrl: String?): String {
            if (rawApkUrl.isEmpty()) return ""
            if (rawApkUrl.startsWith("https://") || rawApkUrl.startsWith("http://")) {
                return rawApkUrl
            }
            if (feedUrl.isNullOrBlank()) return rawApkUrl
            return runCatching { URI(feedUrl).resolve(rawApkUrl).toString() }.getOrDefault(rawApkUrl)
        }

        /** Accepts a feed URL or a directory URL and always yields the manifest location. */
        fun manifestUrl(feed: String): String {
            val trimmed = feed.trim()
            return when {
                trimmed.isEmpty() -> trimmed
                trimmed.endsWith(".json") -> trimmed
                trimmed.endsWith("/") -> trimmed + "latest.json"
                else -> "$trimmed/latest.json"
            }
        }

        /**
         * Expands a user-entered domain, website root, `/downloads` folder, `.json` feed, or
         * GitHub repository URL into ordered HTTPS manifest candidate URLs.
         */
        fun candidateUrls(feed: String): List<String> {
            val trimmed = feed.trim()
            if (trimmed.isEmpty()) return emptyList()
            val normalized = if (!trimmed.contains("://")) "https://$trimmed" else trimmed
            if (!normalized.startsWith("https://")) return emptyList()

            val candidates = mutableListOf<String>()
            val ghMatch = Regex("^https://github\\.com/([^/]+)/([^/]+)(?:/.*)?$").find(normalized)
            if (ghMatch != null) {
                val owner = ghMatch.groupValues[1]
                val repo = ghMatch.groupValues[2].removeSuffix(".git")
                candidates += "https://raw.githubusercontent.com/$owner/$repo/main/public/downloads/latest.json"
                candidates += "https://raw.githubusercontent.com/$owner/$repo/master/public/downloads/latest.json"
                return candidates.distinct()
            }

            if (normalized.endsWith(".json")) {
                candidates += normalized
                return candidates
            }

            val base = normalized.trimEnd('/')
            if (base.endsWith("/downloads")) {
                candidates += "$base/latest.json"
            } else {
                candidates += "$base/downloads/latest.json"
                candidates += "$base/latest.json"
            }
            return candidates.distinct()
        }

        /** Resolves `IroncladOS.apk` next to [feedUrl] as a verified fallback when `apkUrl` 404s. */
        fun siblingApkUrl(feedUrl: String, fileName: String = "IroncladOS.apk"): String? =
            runCatching { URI(feedUrl).resolve(fileName).toString() }
                .getOrNull()
                ?.takeIf { it.startsWith("https://") }
    }
}
