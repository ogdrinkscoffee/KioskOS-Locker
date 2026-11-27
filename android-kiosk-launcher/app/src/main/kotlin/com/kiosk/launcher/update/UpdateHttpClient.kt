package com.kiosk.launcher.update

import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal HTTPS fetch for the update feed. Deliberately tiny and dependency-free: the
 * kiosk has no Google Play Services and must keep working on a bare device.
 *
 * Certificate and hostname checks are handled by the platform socket; redirects are
 * followed for the CDN case but re-checked to stay on HTTPS.
 */
internal class UpdateHttpClient {

    fun fetchText(url: String, timeoutMs: Int = 15_000): String {
        val connection = open(url, timeoutMs)
        return connection.use { conn ->
            if (conn.responseCode !in 200..299) {
                throw UpdateException("http_${conn.responseCode}")
            }
            if (!conn.url.protocol.equals("https", ignoreCase = true)) {
                throw UpdateException("insecure_redirect")
            }
            conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        }
    }

    /** Streams the body to [target], reporting whole-percent progress. */
    fun download(url: String, target: File, onProgress: (Int) -> Unit) {
        val connection = open(url, timeoutMs = 30_000)
        connection.use { conn ->
            if (conn.responseCode !in 200..299) {
                throw UpdateException("http_${conn.responseCode}")
            }
            if (!conn.url.protocol.equals("https", ignoreCase = true)) {
                throw UpdateException("insecure_redirect")
            }
            val total = conn.contentLengthLong
            var written = 0L
            var lastPercent = -1

            conn.inputStream.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        output.write(buffer, 0, read)
                        written += read
                        if (total > 0) {
                            val percent = ((written * 100) / total).toInt()
                            if (percent != lastPercent) {
                                lastPercent = percent
                                onProgress(percent)
                            }
                        }
                    }
                    output.flush()
                }
            }
        }
    }

    private fun open(url: String, timeoutMs: Int): HttpURLConnection {
        if (!url.startsWith("https://")) throw UpdateException("insecure_url")
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = timeoutMs
            readTimeout = timeoutMs
            instanceFollowRedirects = true
            setRequestProperty("Accept", "*/*")
            setRequestProperty("Cache-Control", "no-cache")
        }
        if (connection.url.protocol != "https") {
            connection.disconnect()
            throw UpdateException("insecure_redirect")
        }
        return connection
    }
}

internal class UpdateException(message: String) : Exception(message)

private inline fun <T> HttpURLConnection.use(block: (HttpURLConnection) -> T): T =
    try {
        block(this)
    } finally {
        disconnect()
    }
