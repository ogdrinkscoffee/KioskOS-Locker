package com.kiosk.launcher.diagnostics

import com.kiosk.launcher.data.PolicyEvent
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * One guard layer or restriction together with the state actually observed on the
 * device. [detail] carries the "why" so a report explains itself without the screen.
 */
data class GuardStatus(
    val label: String,
    val state: State,
    val detail: String? = null
) {
    enum class State { ACTIVE, INACTIVE, UNKNOWN }

    val marker: String
        get() = when (state) {
            State.ACTIVE -> "[ OK ]"
            State.INACTIVE -> "[FAIL]"
            State.UNKNOWN -> "[ ?? ]"
        }
}

/** Section titles, resolved from resources so the renderer stays free of Android types. */
data class DiagnosticsHeadings(
    val title: String,
    val generated: String,
    val guards: String,
    val restrictions: String,
    val log: String,
    val noEvents: String,
    val legend: String
)

data class DiagnosticsSnapshot(
    val headings: DiagnosticsHeadings,
    val appVersion: String,
    val versionCode: Int,
    val androidRelease: String,
    val sdkInt: Int,
    val deviceModel: String,
    val generatedAt: Long,
    val guards: List<GuardStatus>,
    val restrictions: List<GuardStatus>,
    val events: List<PolicyEvent>
)

/**
 * Renders a snapshot as the plain text that gets copied or saved, so the screen and the
 * exported file can never drift apart.
 */
object DiagnosticsReport {

    /** The policy log keeps 20 events; the report never claims to be complete beyond that. */
    private const val MAX_EVENTS = 20

    private val timestampFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)

    fun render(
        snapshot: DiagnosticsSnapshot,
        formatTime: (Long) -> String = { timestampFormat.format(Date(it)) }
    ): String = buildString {
        appendLine(snapshot.headings.title)
        appendLine("${snapshot.headings.generated} ${formatTime(snapshot.generatedAt)}")
        appendLine(
            "Ironclad OS ${snapshot.appVersion} (${snapshot.versionCode}) · " +
                "Android ${snapshot.androidRelease} (SDK ${snapshot.sdkInt}) · ${snapshot.deviceModel}"
        )
        appendLine()

        appendSection(snapshot.headings.guards, snapshot.guards)
        appendSection(snapshot.headings.restrictions, snapshot.restrictions)

        appendLine(snapshot.headings.log)
        val events = snapshot.events.take(MAX_EVENTS)
        if (events.isEmpty()) {
            appendLine("  ${snapshot.headings.noEvents}")
        } else {
            events.forEach { appendLine("  ${formatTime(it.time)}  ${it.label}") }
        }
        appendLine()

        appendLine(snapshot.headings.legend)
    }

    private fun StringBuilder.appendSection(title: String, rows: List<GuardStatus>) {
        appendLine(title)
        if (rows.isEmpty()) {
            appendLine("  $EMPTY_SECTION")
        } else {
            rows.forEach { row ->
                append("  ${row.marker} ${row.label}")
                if (!row.detail.isNullOrBlank()) append(" — ${row.detail}")
                appendLine()
            }
        }
        appendLine()
    }

    private const val EMPTY_SECTION = "—"
}
