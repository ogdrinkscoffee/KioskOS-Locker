package com.kiosk.launcher.data

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pinned cross-platform vectors. These digests are also asserted in the web app
 * (src/utils/cloudSyncEngine.test.ts); changing the salt format or adding a
 * separator here would break PIN verification between the APK and the panel.
 */
class PinHashTest {

    /** SHA-256(raw salt bytes || utf8(pin)), lowercase hex, no separator. */
    @Test
    fun matchesWebVectorForPassphrasePin() {
        assertEquals(
            "0362d8277f129f3c7e080dce1a04e3e3fecf61368f2168a046ffb3c7f525439b",
            PinHash.digest(
                pin = "correct horse 1234",
                salt = PinHash.hexToBytes("00112233445566778899aabbccddeeff")
            )
        )
    }

    @Test
    fun matchesWebVectorForLongSymbolPin() {
        assertEquals(
            "3611c14c4c3d86cc0cf13b047e2470c882443567a79b3e25061bfeecd730eef8",
            PinHash.digest(
                pin = "KioskAdmin!2026#SafePassphrase",
                salt = PinHash.hexToBytes("0123456789abcdef0123456789abcdef")
            )
        )
    }

    /** The old web bug hashed the salt as text with a ':' separator. */
    @Test
    fun saltIsHashedAsBytesNotHexText() {
        val saltHex = "00112233445566778899aabbccddeeff"
        val saltBytes = PinHash.hexToBytes(saltHex)
        assertEquals(16, saltBytes.size)

        val actual = PinHash.digest("correct horse 1234", saltBytes)
        val colonFormat = java.security.MessageDigest.getInstance("SHA-256")
            .digest("$saltHex:correct horse 1234".toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

        assertEquals(64, actual.length)
        org.junit.Assert.assertNotEquals(colonFormat, actual)
    }

    @Test
    fun hexRoundTripKeepsEveryByte() {
        val bytes = ByteArray(16) { (it * 17).toByte() }
        assertArrayEquals(bytes, PinHash.hexToBytes(PinHash.toHex(bytes)))
    }

    @Test
    fun invalidHexChunksAreSkippedLikeTheWeb() {
        assertArrayEquals(byteArrayOf(0xab.toByte()), PinHash.hexToBytes("abzz"))
    }
}
