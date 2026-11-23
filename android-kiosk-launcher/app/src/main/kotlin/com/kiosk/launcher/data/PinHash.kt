package com.kiosk.launcher.data

import java.security.MessageDigest

/**
 * Salted PIN hashing. The web app recomputes the same digest in
 * src/utils/cloudSyncEngine.ts, so the two must stay byte-for-byte identical:
 * SHA-256 over the raw 16 salt bytes followed by the UTF-8 PIN bytes, with no
 * separator. A PIN set on the phone therefore verifies in the panel and back.
 */
object PinHash {

    fun digest(pin: String, salt: ByteArray): String {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(salt)
        md.update(pin.toByteArray(Charsets.UTF_8))
        return toHex(md.digest())
    }

    fun toHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    /** Tolerant like the web side: invalid chunks are skipped, not thrown. */
    fun hexToBytes(hex: String): ByteArray =
        hex.chunked(2).mapNotNull { it.toIntOrNull(16)?.toByte() }.toByteArray()
}
