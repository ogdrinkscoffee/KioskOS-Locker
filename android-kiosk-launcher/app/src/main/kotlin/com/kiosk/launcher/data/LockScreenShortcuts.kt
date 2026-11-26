package com.kiosk.launcher.data

/**
 * Encodes the lock screen dock. A string set has no order, so the admin's order is kept
 * in a newline-separated string instead. Package names never contain a newline, and
 * decoding tolerates blanks and duplicates left by older or hand-edited values.
 *
 * Kept free of Android types so the storage and filtering rules are unit-testable.
 */
object LockScreenShortcuts {

    private const val SEPARATOR = "\n"

    fun encode(packages: List<String>): String =
        packages.map { it.trim() }.filter { it.isNotEmpty() }.distinct().joinToString(SEPARATOR)

    fun decode(raw: String?): List<String> =
        raw.orEmpty()
            .split(SEPARATOR)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinct()

    /**
     * Shortcuts that can actually be shown: still installed and still allowed. Keeps the
     * admin's order and drops stale entries instead of leaving dead icons in the dock.
     */
    fun resolve(quickLaunch: List<String>, available: Collection<String>): List<String> =
        quickLaunch.filter { it in available }.distinct()
}
