package com.kiosk.launcher.selfimprovement

import android.content.Context
import com.kiosk.launcher.data.KioskPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Habits, tasks, goals, focus sessions, clean days, urges and notes.
 *
 * Everything is stored as JSON in shared preferences so the app stays
 * account-free, offline-first and survives process death.
 */
class SelfImprovementRepository(
    context: Context,
    /** Overridable so unit tests can pin "today" instead of racing the wall clock. */
    private val todayProvider: () -> Long = { KioskPreferences.localEpochDay() }
) {

    private val prefs = KioskPreferences(context)

    fun today(): Long = todayProvider()

    // ---------------------------------------------------------- clean day streak
    /** Every clean day ever logged, used by the streak chart. */
    fun cleanDays(): Set<Long> = longArray(KEY_CLEAN_DAYS).toSet()

    /** Returns false when today was already logged. */
    fun markCleanDay(): Boolean {
        val logged = prefs.markTodayClean()
        if (logged) {
            val days = cleanDays().toMutableSet()
            days.add(today())
            putLongArray(KEY_CLEAN_DAYS, days)
        }
        return logged
    }

    /** Ends the current streak but keeps the best streak and the history. */
    fun resetCleanStreak() {
        prefs.streak = 0
        prefs.lastCleanDay = 0L
        val days = cleanDays().toMutableSet()
        days.remove(today())
        putLongArray(KEY_CLEAN_DAYS, days)
    }

    var urgeVictories: Int
        get() = prefs.raw(KEY_URGE_VICTORIES)?.toIntOrNull() ?: 0
        set(value) = prefs.putRaw(KEY_URGE_VICTORIES, value.coerceAtLeast(0).toString())

    fun logUrgeVictory() {
        urgeVictories += 1
    }

    var whyIStarted: String
        get() = prefs.raw(KEY_WHY) ?: ""
        set(value) = prefs.putRaw(KEY_WHY, value.trim())

    // ------------------------------------------------------------ focus sessions
    fun recordFocusSession(minutes: Int) {
        if (minutes <= 0) return
        val array = JSONArray(prefs.raw(KEY_FOCUS_SESSIONS) ?: "[]")
        array.put(
            JSONObject()
                .put("day", today())
                .put("minutes", minutes)
                .put("at", System.currentTimeMillis())
        )
        // Keep the most recent 120 sessions.
        val trimmed = JSONArray()
        val start = (array.length() - 120).coerceAtLeast(0)
        for (i in start until array.length()) {
            trimmed.put(array.get(i))
        }
        prefs.putRaw(KEY_FOCUS_SESSIONS, trimmed.toString())
    }

    fun todayFocusMinutes(): Int {
        val day = today()
        return objects(KEY_FOCUS_SESSIONS)
            .filter { it.optLong("day", -1L) == day }
            .sumOf { it.optInt("minutes", 0) }
    }

    fun todayFocusSessionsCount(): Int {
        val day = today()
        return objects(KEY_FOCUS_SESSIONS).count { it.optLong("day", -1L) == day }
    }

    // ------------------------------------------------------------------- habits
    fun habits(): List<Habit> = objects(KEY_HABITS).map { item ->
        Habit(
            id = item.optString("id"),
            title = item.optString("title"),
            category = item.optString("category", HabitCategories.RECOVERY),
            days = item.optJSONArray("days")?.let { array ->
                (0 until array.length()).mapNotNull { array.optLong(it, Long.MIN_VALUE).takeIf { d -> d != Long.MIN_VALUE } }
            } ?: emptyList()
        )
    }

    fun addHabit(title: String, category: String = HabitCategories.RECOVERY) {
        if (title.isBlank()) return
        mutate(KEY_HABITS) { list ->
            list.add(
                JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("title", title.trim())
                    .put("category", category)
                    .put("days", JSONArray())
            )
        }
    }

    fun toggleHabitDay(habitId: String, day: Long = today()) {
        update(KEY_HABITS, habitId) { item ->
            val days = item.optJSONArray("days")?.let { array ->
                (0 until array.length()).mapNotNull { array.optLong(it, Long.MIN_VALUE).takeIf { d -> d != Long.MIN_VALUE } }
            }?.toMutableSet() ?: mutableSetOf()
            if (!days.add(day)) days.remove(day)
            val array = JSONArray()
            days.sorted().forEach { array.put(it) }
            item.put("days", array)
        }
    }

    fun removeHabit(id: String) = remove(KEY_HABITS, id)

    fun todayHabitProgress(): HabitProgress {
        val habits = habits()
        return HabitProgress(habits.count { it.days.contains(today()) }, habits.size)
    }

    /** Consecutive completed days ending today (or yesterday when today is still open). */
    fun habitStreak(habit: Habit, anchor: Long = today()): Int {
        val days = habit.days.toSet()
        var cursor = if (days.contains(anchor)) anchor else anchor - 1
        var streak = 0
        while (days.contains(cursor)) {
            streak += 1
            cursor -= 1
        }
        return streak
    }

    // -------------------------------------------------------------------- tasks
    fun tasks(): List<Task> = objects(KEY_TASKS).map { item ->
        Task(
            id = item.optString("id"),
            title = item.optString("title"),
            priority = item.optString("priority", TaskPriorities.MEDIUM),
            dueTime = item.optString("dueTime", ""),
            done = item.optBoolean("done", false)
        )
    }

    fun tasks(filter: String = TaskFilters.ALL): List<Task> {
        val all = tasks()
        return when (filter) {
            TaskFilters.ACTIVE -> all.filter { !it.done }
            TaskFilters.COMPLETED -> all.filter { it.done }
            else -> all
        }
    }

    fun openTasks(): Int = tasks().count { !it.done }

    fun completedTasks(): Int = tasks().count { it.done }

    fun addTask(title: String, priority: String = TaskPriorities.MEDIUM, dueTime: String = "") {
        if (title.isBlank()) return
        mutate(KEY_TASKS) { list ->
            list.add(
                0,
                JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("title", title.trim())
                    .put("priority", priority)
                    .put("dueTime", dueTime.trim())
                    .put("done", false)
            )
        }
    }

    fun setTaskDone(id: String, done: Boolean) {
        update(KEY_TASKS, id) { it.put("done", done) }
    }

    fun removeTask(id: String) = remove(KEY_TASKS, id)

    // -------------------------------------------------------------------- goals
    fun goals(): List<Goal> = objects(KEY_GOALS).map { item ->
        val milestones = item.optJSONArray("milestones")?.let { array ->
            (0 until array.length()).mapNotNull { index ->
                array.optJSONObject(index)?.let { ms ->
                    Milestone(ms.optString("id"), ms.optString("title"), ms.optBoolean("done", false))
                }
            }
        } ?: emptyList()
        Goal(
            id = item.optString("id"),
            title = item.optString("title"),
            category = item.optString("category", GoalCategories.RECOVERY),
            targetDate = item.optString("targetDate", ""),
            why = item.optString("why", ""),
            milestones = milestones
        )
    }

    fun goalProgress(): Int {
        val goals = goals()
        return if (goals.isEmpty()) 0 else goals.sumOf { it.progressPercent } / goals.size
    }

    fun addGoal(
        title: String,
        category: String,
        targetDate: String,
        why: String,
        milestones: List<String>
    ) {
        if (title.isBlank()) return
        val milestoneArray = JSONArray()
        milestones.map { it.trim() }.filter { it.isNotEmpty() }.forEach { label ->
            milestoneArray.put(
                JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("title", label)
                    .put("done", false)
            )
        }
        mutate(KEY_GOALS) { list ->
            list.add(
                0,
                JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("title", title.trim())
                    .put("category", category)
                    .put("targetDate", targetDate.trim())
                    .put("why", why.trim())
                    .put("milestones", milestoneArray)
            )
        }
    }

    fun toggleMilestone(goalId: String, milestoneId: String) {
        update(KEY_GOALS, goalId) { goal ->
            val array = goal.optJSONArray("milestones") ?: return@update
            for (index in 0 until array.length()) {
                val ms = array.optJSONObject(index) ?: continue
                if (ms.optString("id") == milestoneId) {
                    ms.put("done", !ms.optBoolean("done", false))
                }
            }
            goal.put("milestones", array)
        }
    }

    fun addMilestone(goalId: String, title: String) {
        if (title.isBlank()) return
        update(KEY_GOALS, goalId) { goal ->
            val array = goal.optJSONArray("milestones") ?: JSONArray()
            array.put(
                JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("title", title.trim())
                    .put("done", false)
            )
            goal.put("milestones", array)
        }
    }

    fun removeGoal(id: String) = remove(KEY_GOALS, id)

    // -------------------------------------------------------------------- notes
    fun notes(): List<Note> = objects(KEY_NOTES).map { item ->
        Note(
            id = item.optString("id"),
            title = item.optString("title"),
            body = item.optString("body"),
            notebook = item.optString("notebook", Notebooks.DIARY),
            pinned = item.optBoolean("pinned", false),
            updatedDay = item.optLong("updatedDay", 0L)
        )
    }.sortedWith(compareByDescending<Note> { it.pinned }.thenByDescending { it.updatedDay })

    fun notes(notebook: String, query: String = ""): List<Note> {
        val needle = query.trim().lowercase()
        return notes().filter { note ->
            (notebook.isBlank() || note.notebook == notebook) &&
                (needle.isEmpty() ||
                    note.title.lowercase().contains(needle) ||
                    note.body.lowercase().contains(needle))
        }
    }

    fun addNote(title: String, body: String, notebook: String, fallbackTitle: String = "Untitled"): String? {
        if (title.isBlank() && body.isBlank()) return null
        val id = UUID.randomUUID().toString()
        val now = today()
        mutate(KEY_NOTES) { list ->
            list.add(
                0,
                JSONObject()
                    .put("id", id)
                    .put("title", title.ifBlank { fallbackTitle })
                    .put("body", body)
                    .put("notebook", notebook)
                    .put("pinned", false)
                    .put("updatedDay", now)
            )
        }
        return id
    }

    fun updateNote(
        id: String,
        title: String,
        body: String,
        notebook: String,
        pinned: Boolean,
        fallbackTitle: String = "Untitled"
    ) {
        update(KEY_NOTES, id) { note ->
            note.put("title", title.ifBlank { fallbackTitle })
            note.put("body", body)
            note.put("notebook", notebook)
            note.put("pinned", pinned)
            note.put("updatedDay", today())
        }
    }

    fun toggleNotePinned(id: String) {
        update(KEY_NOTES, id) { note -> note.put("pinned", !note.optBoolean("pinned", false)) }
    }

    fun removeNote(id: String) = remove(KEY_NOTES, id)

    // ---------------------------------------------------------------- analytics
    /** Streak value and habit completion rate for each of the last 30 days. */
    fun last30Days(): List<DayProgress> {
        val end = today()
        val cleanDays = cleanDays()
        val habits = habits()
        val currentStreak = prefs.streak
        return (29 downTo 0).map { offset ->
            val day = end - offset
            var running = 0
            if (cleanDays.contains(day)) {
                var cursor = day
                while (cleanDays.contains(cursor)) {
                    running += 1
                    cursor -= 1
                }
            } else if (offset == 0 && currentStreak > 0) {
                // Today is not logged yet: keep yesterday's streak visible.
                running = currentStreak
            }
            val done = habits.count { it.days.contains(day) }
            DayProgress(
                day = day,
                cleanStreakDay = running,
                habitPercent = if (habits.isEmpty()) 0 else Math.round(done * 100f / habits.size)
            )
        }
    }

    // ------------------------------------------------------------------ storage
    private fun objects(key: String): List<JSONObject> {
        val raw = prefs.raw(key) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { array.optJSONObject(it) }
        }.getOrDefault(emptyList())
    }

    private fun longArray(key: String): List<Long> {
        val raw = prefs.raw(key) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { index ->
                if (array.isNull(index)) null else array.optLong(index, Long.MIN_VALUE)
                    .takeIf { it != Long.MIN_VALUE }
            }
        }.getOrDefault(emptyList()).filter { it > 0L }
    }

    private fun putLongArray(key: String, values: Collection<Long>) {
        val array = JSONArray()
        values.sorted().forEach { array.put(it) }
        prefs.putRaw(key, array.toString())
    }

    private fun mutate(key: String, block: (MutableList<JSONObject>) -> Unit) {
        val list = objects(key).toMutableList()
        block(list)
        val array = JSONArray()
        list.forEach { array.put(it) }
        prefs.putRaw(key, array.toString())
    }

    private fun update(key: String, id: String, block: (JSONObject) -> Unit) {
        mutate(key) { list ->
            list.firstOrNull { it.optString("id") == id }?.let(block)
        }
    }

    private fun remove(key: String, id: String) {
        mutate(key) { list -> list.removeAll { it.optString("id") == id } }
    }

    companion object {
        private const val KEY_HABITS = "habits"
        private const val KEY_TASKS = "tasks"
        private const val KEY_GOALS = "goals"
        private const val KEY_NOTES = "notes"
        private const val KEY_FOCUS_SESSIONS = "focus_sessions"
        private const val KEY_CLEAN_DAYS = "clean_days"
        private const val KEY_URGE_VICTORIES = "urge_victories"
        private const val KEY_WHY = "why_i_started"
    }
}
