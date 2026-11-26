package com.kiosk.launcher.schedule

import java.util.Calendar
import java.util.TimeZone

/** Days a [KioskWindow] can cover. Ordered Monday-first so "the previous day" is simple arithmetic. */
enum class Day { MON, TUE, WED, THU, FRI, SAT, SUN }

/**
 * One wall-clock window of kiosk time, e.g. `Mon-Fri 08:00-15:00` or `Sat-Sun 20:00-07:00`.
 *
 * [startMinute] is inclusive and [endMinute] exclusive. When the end is earlier than the start the
 * window runs past midnight: `20:00-07:00` on Monday means Monday 20:00 until Tuesday 07:00. A
 * window whose ends are equal covers the whole day it applies to.
 */
data class KioskWindow(val days: Set<Day>, val startMinute: Int, val endMinute: Int)

/** Outcome of parsing the Admin's schedule text; invalid input is reported per line, never guessed. */
sealed class ScheduleParse {
    data class Parsed(val windows: List<KioskWindow>) : ScheduleParse()
    data class Invalid(val lineNumber: Int, val line: String) : ScheduleParse()
}

/**
 * The schedule rules, free of Android types so they are unit-testable.
 *
 * Everything is evaluated in the device's time zone from an epoch instant, using wall-clock fields.
 * That is what makes DST correct without any special cases: a spring-forward day simply has no
 * 02:00–03:00 wall hour to match, a fall-back hour matches twice, and [nextChangeAt] walks real
 * minutes through the zone's rules instead of adding fixed offsets to a wall time.
 */
object KioskSchedule {

    const val MINUTES_PER_DAY = 24 * 60

    /** A schedule with no windows is kiosk time never, which is a valid "always a normal phone". */
    const val MAX_LOOKAHEAD_MINUTES = 8 * MINUTES_PER_DAY

    private val TIME_RANGE = Regex("""(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})""")
    private val ALL_DAYS_WORDS = setOf("all", "daily", "everyday", "every day", "any")

    /**
     * Parses one window per line: `Mon-Fri 08:00-15:00`, `Sat,Sun 09:00-22:00`, `20:00-07:00`.
     * Blank lines and `#` comments are skipped. Days may be omitted, which means every day.
     */
    fun parse(text: String): ScheduleParse {
        val windows = mutableListOf<KioskWindow>()
        text.lines().forEachIndexed { index, raw ->
            val line = raw.substringBefore('#').trim()
            if (line.isEmpty()) return@forEachIndexed
            val window = parseLine(line) ?: return ScheduleParse.Invalid(index + 1, line)
            windows += window
        }
        return ScheduleParse.Parsed(windows)
    }

    /** True when [epochMs] falls inside any window. */
    fun isKioskTime(
        windows: List<KioskWindow>,
        epochMs: Long,
        zone: TimeZone = TimeZone.getDefault()
    ): Boolean {
        if (windows.isEmpty()) return false
        val calendar = Calendar.getInstance(zone).apply { timeInMillis = epochMs }
        return matches(windows, calendar)
    }

    /** True on Saturday and Sunday in [zone]; the weekend allowlist follows this. */
    fun isWeekend(epochMs: Long, zone: TimeZone = TimeZone.getDefault()): Boolean {
        val calendar = Calendar.getInstance(zone).apply { timeInMillis = epochMs }
        return dayOf(calendar).let { it == Day.SAT || it == Day.SUN }
    }

    /**
     * The next instant at which the kiosk state flips, minute resolution, or null when it never
     * does. Walking one real minute at a time is deliberately dumb: it crosses DST transitions,
     * overnight windows and a clock the admin just changed without any special cases.
     */
    fun nextChangeAt(
        windows: List<KioskWindow>,
        epochMs: Long,
        zone: TimeZone = TimeZone.getDefault()
    ): Long? {
        if (windows.isEmpty()) return null
        val calendar = Calendar.getInstance(zone).apply {
            timeInMillis = epochMs
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val current = matches(windows, calendar)
        val windowEnd = calendar.timeInMillis + MAX_LOOKAHEAD_MINUTES * 60_000L
        calendar.add(Calendar.MINUTE, 1)
        while (calendar.timeInMillis <= windowEnd) {
            if (matches(windows, calendar) != current) return calendar.timeInMillis
            calendar.add(Calendar.MINUTE, 1)
        }
        return null
    }

    private fun matches(windows: List<KioskWindow>, calendar: Calendar): Boolean {
        val minute = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
        val day = dayOf(calendar)
        val previous = Day.entries[(day.ordinal + Day.entries.size - 1) % Day.entries.size]
        return windows.any { it.covers(day, previous, minute) }
    }

    private fun KioskWindow.covers(day: Day, previous: Day, minute: Int): Boolean {
        if (startMinute == endMinute) return day in days
        if (startMinute < endMinute) {
            return day in days && minute >= startMinute && minute < endMinute
        }
        return (day in days && minute >= startMinute) || (previous in days && minute < endMinute)
    }

    private fun dayOf(calendar: Calendar): Day = when (calendar.get(Calendar.DAY_OF_WEEK)) {
        Calendar.MONDAY -> Day.MON
        Calendar.TUESDAY -> Day.TUE
        Calendar.WEDNESDAY -> Day.WED
        Calendar.THURSDAY -> Day.THU
        Calendar.FRIDAY -> Day.FRI
        Calendar.SATURDAY -> Day.SAT
        else -> Day.SUN
    }

    private fun parseLine(line: String): KioskWindow? {
        val match = TIME_RANGE.find(line) ?: return null
        val startHour = match.groupValues[1].toIntOrNull() ?: return null
        val startMinute = match.groupValues[2].toIntOrNull() ?: return null
        val endHour = match.groupValues[3].toIntOrNull() ?: return null
        val endMinuteOfHour = match.groupValues[4].toIntOrNull() ?: return null
        if (startHour !in 0..23 || endHour !in 0..23) return null
        if (startMinute !in 0..59 || endMinuteOfHour !in 0..59) return null

        val dayText = line.removeRange(match.range).trim().trim(',').trim()
        val days = if (dayText.isEmpty() || dayText.lowercase() in ALL_DAYS_WORDS) {
            Day.entries.toSet()
        } else {
            parseDays(dayText) ?: return null
        }
        return KioskWindow(
            days = days,
            startMinute = startHour * 60 + startMinute,
            endMinute = endHour * 60 + endMinuteOfHour
        )
    }

    private fun parseDays(text: String): Set<Day>? {
        val days = linkedSetOf<Day>()
        for (part in text.split(',')) {
            val token = part.trim()
            if (token.isEmpty()) continue
            val bounds = token.split('-', limit = 2).map { it.trim() }
            // "Mon-Sat-Sun" is a typo, not a range to the Saturday-ish token.
            if (bounds.size == 2 && bounds[1].contains('-')) return null
            val start = dayOfToken(bounds[0]) ?: return null
            if (bounds.size == 1) {
                days += start
                continue
            }
            val end = dayOfToken(bounds[1]) ?: return null
            var current = start
            var walked = 0
            while (true) {
                days += current
                if (current == end) break
                // Walk forward and wrap past Sunday, so "Fri-Mon" is the four days you expect.
                current = Day.entries[(current.ordinal + 1) % Day.entries.size]
                if (++walked > Day.entries.size) return null
            }
        }
        return days.ifEmpty { null }
    }

    /** Whole words only, so a stray token next to a day is a parse error instead of being ignored. */
    private fun dayOfToken(token: String): Day? = when (token.lowercase()) {
        "mon", "monday" -> Day.MON
        "tue", "tuesday" -> Day.TUE
        "wed", "wednesday" -> Day.WED
        "thu", "thursday" -> Day.THU
        "fri", "friday" -> Day.FRI
        "sat", "saturday" -> Day.SAT
        "sun", "sunday" -> Day.SUN
        else -> null
    }
}
