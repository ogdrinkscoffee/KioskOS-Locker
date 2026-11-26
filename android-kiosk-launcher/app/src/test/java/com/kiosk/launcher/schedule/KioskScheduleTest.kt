package com.kiosk.launcher.schedule

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The schedule is what decides whether the device is a kiosk or a normal phone, so the pieces that
 * can be wrong silently are pinned here: wall-clock boundaries, overnight windows, day masks,
 * both DST transitions, and the search for the next boundary the alarm is armed for.
 */
class KioskScheduleTest {

    private val cairo = TimeZone.getTimeZone("Africa/Cairo")
    private val newYork = TimeZone.getTimeZone("America/New_York")

    private fun at(zone: TimeZone, year: Int, month: Int, day: Int, hour: Int, minute: Int): Long =
        GregorianCalendar(zone).apply {
            clear()
            set(year, month - 1, day, hour, minute, 0)
        }.timeInMillis

    private fun windows(text: String): List<KioskWindow> {
        val parsed = KioskSchedule.parse(text)
        assertTrue("expected a valid schedule: $text -> $parsed", parsed is ScheduleParse.Parsed)
        return (parsed as ScheduleParse.Parsed).windows
    }

    // ------------------------------------------------------------------- parsing

    @Test
    fun parsesADayRangeAndATimeRange() {
        val window = windows("Mon-Fri 08:00-15:00").single()
        assertEquals(setOf(Day.MON, Day.TUE, Day.WED, Day.THU, Day.FRI), window.days)
        assertEquals(8 * 60, window.startMinute)
        assertEquals(15 * 60, window.endMinute)
    }

    @Test
    fun omittedDaysMeanEveryDay() {
        assertEquals(Day.entries.toSet(), windows("20:00-07:00").single().days)
        assertEquals(Day.entries.toSet(), windows("all 20:00-07:00").single().days)
        assertEquals(Day.entries.toSet(), windows("daily 20:00-07:00").single().days)
    }

    @Test
    fun acceptsCommaSeparatedDaysAndWrappingRanges() {
        assertEquals(setOf(Day.SAT, Day.SUN), windows("Sat,Sun 09:00-22:00").single().days)
        assertEquals(
            setOf(Day.FRI, Day.SAT, Day.SUN, Day.MON),
            windows("Fri-Mon 20:00-07:00").single().days
        )
    }

    @Test
    fun skipsBlankLinesAndComments() {
        val parsed = KioskSchedule.parse("\n# school\nMon-Fri 08:00-15:00\n\n")
        assertEquals(1, (parsed as ScheduleParse.Parsed).windows.size)
    }

    @Test
    fun anEmptyScheduleParsesToNoWindows() {
        assertEquals(0, (KioskSchedule.parse("") as ScheduleParse.Parsed).windows.size)
        assertEquals(0, (KioskSchedule.parse("# nothing here") as ScheduleParse.Parsed).windows.size)
    }

    @Test
    fun reportsTheLineThatCouldNotBeUnderstood() {
        val parsed = KioskSchedule.parse("Mon-Fri 08:00-15:00\nlunch\n")
        assertEquals(ScheduleParse.Invalid(2, "lunch"), parsed)
    }

    @Test
    fun rejectsImpossibleTimesAndUnknownDays() {
        assertTrue(KioskSchedule.parse("Mon 25:00-07:00") is ScheduleParse.Invalid)
        assertTrue(KioskSchedule.parse("Mon 08:60-15:00") is ScheduleParse.Invalid)
        assertTrue(KioskSchedule.parse("Funday 08:00-15:00") is ScheduleParse.Invalid)
        assertTrue(KioskSchedule.parse("Mon-Sat-Sun 08:00-15:00") is ScheduleParse.Invalid)
    }

    // ---------------------------------------------------------------- evaluation

    @Test
    fun theStartMinuteIsInsideAndTheEndMinuteIsOutside() {
        val school = windows("Mon-Fri 08:00-15:00")
        // 2026-11-23 is a Monday.
        assertTrue(KioskSchedule.isKioskTime(school, at(cairo, 2026, 11, 23, 8, 0), cairo))
        assertTrue(KioskSchedule.isKioskTime(school, at(cairo, 2026, 11, 23, 14, 59), cairo))
        assertFalse(KioskSchedule.isKioskTime(school, at(cairo, 2026, 11, 23, 15, 0), cairo))
        assertFalse(KioskSchedule.isKioskTime(school, at(cairo, 2026, 11, 23, 7, 59), cairo))
    }

    @Test
    fun aDayMaskIsRespected() {
        val school = windows("Mon-Fri 08:00-15:00")
        // 2026-11-28 is a Saturday.
        assertFalse(KioskSchedule.isKioskTime(school, at(cairo, 2026, 11, 28, 10, 0), cairo))
        assertFalse(KioskSchedule.isWeekend(at(cairo, 2026, 11, 23, 10, 0), cairo))
        assertTrue(KioskSchedule.isWeekend(at(cairo, 2026, 11, 28, 10, 0), cairo))
        assertTrue(KioskSchedule.isWeekend(at(cairo, 2026, 11, 29, 10, 0), cairo))
    }

    @Test
    fun anOvernightWindowRunsIntoTheNextMorning() {
        val bedtime = windows("20:00-07:00")
        assertTrue(KioskSchedule.isKioskTime(bedtime, at(cairo, 2026, 11, 23, 23, 30), cairo))
        assertTrue(KioskSchedule.isKioskTime(bedtime, at(cairo, 2026, 11, 24, 2, 0), cairo))
        assertTrue(KioskSchedule.isKioskTime(bedtime, at(cairo, 2026, 11, 24, 6, 59), cairo))
        assertFalse(KioskSchedule.isKioskTime(bedtime, at(cairo, 2026, 11, 24, 7, 0), cairo))
        assertFalse(KioskSchedule.isKioskTime(bedtime, at(cairo, 2026, 11, 24, 12, 0), cairo))
    }

    @Test
    fun anOvernightWindowOnOneDayDoesNotLeakIntoAnotherDaysMorning() {
        // Friday night only: Saturday 02:00 is inside, Sunday 02:00 is not.
        val fridayNight = windows("Fri 20:00-07:00")
        assertTrue(KioskSchedule.isKioskTime(fridayNight, at(cairo, 2026, 11, 28, 2, 0), cairo))
        assertFalse(KioskSchedule.isKioskTime(fridayNight, at(cairo, 2026, 11, 29, 2, 0), cairo))
        assertFalse(KioskSchedule.isKioskTime(fridayNight, at(cairo, 2026, 11, 27, 2, 0), cairo))
    }

    @Test
    fun equalEndsMeanTheWholeDay() {
        val allDay = windows("Sat 00:00-00:00")
        assertTrue(KioskSchedule.isKioskTime(allDay, at(cairo, 2026, 11, 28, 0, 0), cairo))
        assertTrue(KioskSchedule.isKioskTime(allDay, at(cairo, 2026, 11, 28, 23, 59), cairo))
        assertFalse(KioskSchedule.isKioskTime(allDay, at(cairo, 2026, 11, 29, 12, 0), cairo))
    }

    @Test
    fun severalWindowsCombine() {
        val both = windows("Mon-Fri 08:00-15:00\nSat-Sun 10:00-20:00")
        assertTrue(KioskSchedule.isKioskTime(both, at(cairo, 2026, 11, 23, 9, 0), cairo))
        assertTrue(KioskSchedule.isKioskTime(both, at(cairo, 2026, 11, 28, 11, 0), cairo))
        assertFalse(KioskSchedule.isKioskTime(both, at(cairo, 2026, 11, 28, 9, 0), cairo))
    }

    @Test
    fun anEmptyScheduleIsNeverKioskTime() {
        assertFalse(KioskSchedule.isKioskTime(emptyList(), at(cairo, 2026, 11, 23, 23, 0), cairo))
    }

    // ---------------------------------------------------------------- next change

    @Test
    fun findsTheEveningBoundary() {
        val bedtime = windows("20:00-07:00")
        val from = at(cairo, 2026, 11, 23, 19, 15)
        assertEquals(at(cairo, 2026, 11, 23, 20, 0), KioskSchedule.nextChangeAt(bedtime, from, cairo))
    }

    @Test
    fun findsTheMorningBoundaryFromInsideAnOvernightWindow() {
        val bedtime = windows("20:00-07:00")
        val from = at(cairo, 2026, 11, 23, 23, 0)
        assertEquals(at(cairo, 2026, 11, 24, 7, 0), KioskSchedule.nextChangeAt(bedtime, from, cairo))
    }

    @Test
    fun findsTheStartOfTheNextSchoolDay() {
        val school = windows("Mon-Fri 08:00-15:00")
        val fridayAfternoon = at(cairo, 2026, 11, 27, 16, 0)
        assertEquals(
            at(cairo, 2026, 11, 30, 8, 0),
            KioskSchedule.nextChangeAt(school, fridayAfternoon, cairo)
        )
    }

    @Test
    fun noBoundaryWhenNothingEverChanges() {
        assertNull(KioskSchedule.nextChangeAt(emptyList(), at(cairo, 2026, 11, 23, 12, 0), cairo))
        assertNull(
            KioskSchedule.nextChangeAt(
                windows("Mon-Sun 00:00-00:00"),
                at(cairo, 2026, 11, 23, 12, 0),
                cairo
            )
        )
    }

    // ----------------------------------------------------------------------- DST

    @Test
    fun springForwardCrossesTheMissingHour() {
        // America/New_York jumps 02:00 -> 03:00 on 2026-03-08.
        val morning = windows("01:00-04:00")
        assertTrue(KioskSchedule.isKioskTime(morning, at(newYork, 2026, 3, 8, 1, 30), newYork))
        assertTrue(KioskSchedule.isKioskTime(morning, at(newYork, 2026, 3, 8, 3, 30), newYork))
        assertFalse(KioskSchedule.isKioskTime(morning, at(newYork, 2026, 3, 8, 5, 0), newYork))
        // The window ends at 04:00 local, which is still 04:00 after the jump.
        assertEquals(
            at(newYork, 2026, 3, 8, 4, 0),
            KioskSchedule.nextChangeAt(morning, at(newYork, 2026, 3, 8, 1, 30), newYork)
        )
    }

    @Test
    fun aWindowInsideTheMissingHourHasNoInstantThatDay() {
        val gap = windows("02:00-03:00")
        assertFalse(KioskSchedule.isKioskTime(gap, at(newYork, 2026, 3, 8, 1, 30), newYork))
        assertFalse(KioskSchedule.isKioskTime(gap, at(newYork, 2026, 3, 8, 3, 30), newYork))
        // And the alarm looks past the gap to the next day's window instead of firing twice.
        assertEquals(
            at(newYork, 2026, 3, 9, 2, 0),
            KioskSchedule.nextChangeAt(gap, at(newYork, 2026, 3, 8, 1, 30), newYork)
        )
    }

    @Test
    fun fallBackMatchesBothPassesOfTheRepeatedHour() {
        // America/New_York repeats 01:00-02:00 on 2026-11-01. An ambiguous wall time resolves to
        // the standard pass, so the daylight pass is found by going one real hour back.
        val hour = windows("01:00-02:00")
        val standardPass = at(newYork, 2026, 11, 1, 1, 30)
        val daylightPass = standardPass - 60 * 60_000L
        assertTrue(KioskSchedule.isKioskTime(hour, daylightPass, newYork))
        assertTrue(KioskSchedule.isKioskTime(hour, standardPass, newYork))
        // The fold is inside the window, so the next change is the one real 02:00 that follows.
        assertEquals(
            at(newYork, 2026, 11, 1, 2, 0),
            KioskSchedule.nextChangeAt(hour, daylightPass, newYork)
        )
    }

    @Test
    fun anOvernightWindowStillEndsOnTimeAcrossAFallBack() {
        val bedtime = windows("20:00-07:00")
        val beforeMidnight = at(newYork, 2026, 10, 31, 22, 0)
        assertEquals(
            at(newYork, 2026, 11, 1, 7, 0),
            KioskSchedule.nextChangeAt(bedtime, beforeMidnight, newYork)
        )
    }
}
