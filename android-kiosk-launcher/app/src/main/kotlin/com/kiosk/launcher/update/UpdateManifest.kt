package com.kiosk.launcher.update

import org.json.JSONObject

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
        fun parse(json: String): UpdateManifest? = runCatching {
            val root = JSONObject(json)
            val versionName = root.optString("version").trim()
            val versionCode = root.optInt("versionCode", 0)
            val apkUrl = root.optString("apkUrl").trim()
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
    }
}
