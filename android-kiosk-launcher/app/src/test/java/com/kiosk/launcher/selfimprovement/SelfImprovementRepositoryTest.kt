package com.kiosk.launcher.selfimprovement

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.kiosk.launcher.data.KioskPreferences
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * JVM coverage for the persistence and analytics in [SelfImprovementRepository].
 *
 * Robolectric provides the Android context, real SharedPreferences and a working
 * org.json, so these tests exercise the same code the app runs on a device.
 * "Today" is pinned through the repository's clock lambda, which keeps the streak
 * and 30-day assertions exact instead of depending on when the suite happens to run.
 */
@RunWith(RobolectricTestRunner::class)
class SelfImprovementRepositoryTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val today = 20_000L

    private fun repo(day: Long = today) = SelfImprovementRepository(context) { day }

    private fun prefs() = KioskPreferences(context)

    @Before
    fun clearStorage() {
        context.getSharedPreferences("kiosk_prefs", Context.MODE_PRIVATE).edit().clear().commit()
    }

    // ------------------------------------------------------------------ habit streak

    @Test
    fun `habit streak counts consecutive days ending at the anchor`() {
        val habit = Habit("h", "Read", HabitCategories.FOCUS, listOf(today, today - 1, today - 2))

        assertEquals(3, repo().habitStreak(habit))
    }

    @Test
    fun `habit streak counts from yesterday while today is still open`() {
        val habit = Habit("h", "Read", HabitCategories.FOCUS, listOf(today - 1, today - 2, today - 3))

        assertEquals(3, repo().habitStreak(habit))
    }

    @Test
    fun `habit streak breaks at the first missing day`() {
        val habit = Habit("h", "Read", HabitCategories.FOCUS, listOf(today, today - 1, today - 3, today - 4))

        assertEquals(2, repo().habitStreak(habit))
    }

    @Test
    fun `habit streak is zero when yesterday and today are both missing`() {
        val habit = Habit("h", "Read", HabitCategories.FOCUS, listOf(today - 2, today - 3))

        assertEquals(0, repo().habitStreak(habit))
        assertEquals(0, repo().habitStreak(Habit("e", "Empty", HabitCategories.FOCUS, emptyList())))
    }

    @Test
    fun `habit streak ignores duplicates, order and future days`() {
        val habit = Habit(
            "h",
            "Read",
            HabitCategories.FOCUS,
            listOf(today - 1, today, today, today - 1, today + 3, today - 2)
        )

        assertEquals(3, repo().habitStreak(habit))
    }

    @Test
    fun `habit streak can be measured from an explicit anchor`() {
        val habit = Habit("h", "Read", HabitCategories.HEALTH, listOf(today - 5, today - 6, today - 7))

        assertEquals(3, repo().habitStreak(habit, anchor = today - 5))
        assertEquals(0, repo().habitStreak(habit, anchor = today - 9))
    }

    // -------------------------------------------------------------- 30-day analytics

    @Test
    fun `last30Days returns 30 ascending days ending today`() {
        val series = repo().last30Days()

        assertEquals(30, series.size)
        assertEquals(today - 29, series.first().day)
        assertEquals(today, series.last().day)
        assertEquals(series.map { it.day }.sorted(), series.map { it.day })
    }

    @Test
    fun `last30Days carries the clean streak across logged days`() {
        // Five consecutive clean days ending today.
        prefs().putRaw("clean_days", "[" + (today - 4..today).joinToString(",") + "]")
        prefs().streak = 5

        val series = repo().last30Days()
        val byDay = series.associateBy { it.day }

        assertEquals(0, byDay.getValue(today - 5).cleanStreakDay)
        assertEquals(1, byDay.getValue(today - 4).cleanStreakDay)
        assertEquals(3, byDay.getValue(today - 2).cleanStreakDay)
        assertEquals(5, byDay.getValue(today).cleanStreakDay)
    }

    @Test
    fun `last30Days keeps yesterday's streak visible while today is unlogged`() {
        prefs().streak = 7

        val series = repo().last30Days()

        assertEquals(7, series.last().cleanStreakDay)
        // Only the final day borrows the saved streak; earlier unlogged days stay flat.
        assertEquals(0, series[series.size - 2].cleanStreakDay)
    }

    @Test
    fun `last30Days rounds habit completion percent`() {
        val r = repo()
        r.addHabit("Read")
        r.addHabit("Run")
        r.addHabit("Meditate")
        val ids = r.habits().map { it.id }

        r.toggleHabitDay(ids[0], today - 1)
        r.toggleHabitDay(ids[1], today - 1)
        r.toggleHabitDay(ids[0], today)

        val byDay = r.last30Days().associateBy { it.day }

        assertEquals(67, byDay.getValue(today - 1).habitPercent) // 2 of 3
        assertEquals(33, byDay.getValue(today).habitPercent) // 1 of 3
        assertEquals(0, byDay.getValue(today - 2).habitPercent)
    }

    @Test
    fun `last30Days reports zero percent when there are no habits`() {
        assertTrue(repo().last30Days().all { it.habitPercent == 0 })
    }

    // ----------------------------------------------------------------- JSON round trip

    @Test
    fun `state survives a new repository instance`() {
        val first = repo()
        first.addHabit("Read", HabitCategories.FOCUS)
        val habitId = first.habits().first().id
        first.toggleHabitDay(habitId, today)
        first.toggleHabitDay(habitId, today - 1)

        first.addTask("Ship the APK", TaskPriorities.HIGH, "09:00")
        first.addGoal(
            title = "Ship 1.2",
            category = GoalCategories.CAREER,
            targetDate = "2026-12-01",
            why = "Because it ships",
            milestones = listOf("Build", "Sign", "Publish")
        )
        val goal = first.goals().single()
        first.toggleMilestone(goal.id, goal.milestones.first().id)

        first.addNote("Diary entry", "Body text", Notebooks.DIARY)
        first.urgeVictories = 3
        first.whyIStarted = "  Family  "
        first.recordFocusSession(25)

        // A brand-new instance reads the same SharedPreferences the app reloads on cold start.
        val second = repo()

        assertEquals(first.habits(), second.habits())
        assertEquals(
            Habit(habitId, "Read", HabitCategories.FOCUS, listOf(today - 1, today)),
            second.habits().single()
        )
        assertEquals(first.tasks(), second.tasks())
        assertEquals("Ship the APK", second.tasks().single().title)
        assertEquals(TaskPriorities.HIGH, second.tasks().single().priority)
        assertEquals(first.goals(), second.goals())
        assertEquals(listOf(true, false, false), second.goals().single().milestones.map { it.done })
        assertEquals(33, second.goals().single().progressPercent)
        assertEquals(first.notes(), second.notes())
        assertEquals("Body text", second.notes().single().body)
        assertEquals(3, second.urgeVictories)
        assertEquals("Family", second.whyIStarted)
        assertEquals(25, second.todayFocusMinutes())
        assertEquals(1, second.todayFocusSessionsCount())
    }

    @Test
    fun `stored lists are valid JSON arrays`() {
        val r = repo()
        r.addHabit("Read")
        r.addTask("Ship")
        r.addGoal("Ship", GoalCategories.FITNESS, "", "", listOf("One"))
        r.addNote("Title", "Body", Notebooks.NOTES)

        listOf("habits", "tasks", "goals", "notes").forEach { key ->
            val raw = prefs().raw(key) ?: error("$key should be persisted")
            assertEquals(1, JSONArray(raw).length())
        }
    }

    @Test
    fun `malformed JSON falls back to empty instead of crashing`() {
        prefs().putRaw("habits", "[{not json")
        prefs().putRaw("tasks", "null")
        prefs().putRaw("clean_days", "garbage")

        val r = repo()

        assertTrue(r.habits().isEmpty())
        assertTrue(r.tasks().isEmpty())
        assertTrue(r.cleanDays().isEmpty())
        assertTrue(r.last30Days().all { it.cleanStreakDay == 0 })
    }

    @Test
    fun `toggling a habit day twice removes it again`() {
        val r = repo()
        r.addHabit("Read")
        val id = r.habits().single().id

        r.toggleHabitDay(id, today)
        assertEquals(listOf(today), r.habits().single().days)

        r.toggleHabitDay(id, today)
        assertTrue(r.habits().single().days.isEmpty())
        assertEquals(0, r.todayHabitProgress().completed)
        assertEquals(1, r.todayHabitProgress().total)
    }

    @Test
    fun `notes round trip keeps pinned notes first`() {
        val r = repo()
        val older = r.addNote("Older", "", Notebooks.DIARY)!!
        val newer = r.addNote("Newer", "", Notebooks.DIARY)!!

        // Both are added with the same updatedDay, so pinning decides the order.
        r.toggleNotePinned(older)

        val notes = repo().notes()

        assertEquals(listOf("Older", "Newer"), notes.map { it.title })
        assertTrue(notes.first().pinned)
        assertEquals(newer, notes.last().id)
    }

    @Test
    fun `note search matches title and body within one notebook`() {
        val r = repo()
        r.addNote("Morning pages", "gratitude", Notebooks.DIARY)
        r.addNote("Urge log", "walked instead", Notebooks.URGE)

        assertEquals(1, r.notes(Notebooks.DIARY, "gratitude").size)
        assertEquals(1, r.notes(Notebooks.DIARY, "MORNING").size)
        assertTrue(r.notes(Notebooks.URGE, "gratitude").isEmpty())
        assertEquals(2, r.notes("", "").size)
    }

    // ---------------------------------------------------------------- focus sessions

    @Test
    fun `focus sessions keep only the newest 120`() {
        val r = repo()
        repeat(130) { r.recordFocusSession(1) }

        assertEquals(120, r.todayFocusSessionsCount())
        assertEquals(120, r.todayFocusMinutes())
    }

    @Test
    fun `focus sessions ignore non-positive minutes`() {
        val r = repo()
        r.recordFocusSession(0)
        r.recordFocusSession(-5)

        assertEquals(0, r.todayFocusSessionsCount())
    }

    @Test
    fun `focus sessions only count the pinned day`() {
        val r = repo()
        r.recordFocusSession(30)

        assertEquals(30, r.todayFocusMinutes())
        assertEquals(0, repo(day = today + 1).todayFocusMinutes())
    }

    // -------------------------------------------------------------------- clean days

    @Test
    fun `logging a clean day is idempotent and resettable`() {
        val r = SelfImprovementRepository(context)

        assertTrue(r.markCleanDay())
        assertFalse(r.markCleanDay())
        assertTrue(r.cleanDays().contains(r.today()))

        r.resetCleanStreak()

        assertFalse(r.cleanDays().contains(r.today()))
        assertEquals(0, prefs().streak)
    }
}
