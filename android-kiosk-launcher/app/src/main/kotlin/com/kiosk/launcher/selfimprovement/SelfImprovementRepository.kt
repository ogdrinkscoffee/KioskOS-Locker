package com.kiosk.launcher.selfimprovement

import android.content.Context
import com.kiosk.launcher.data.KioskPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Habits, tasks, goals and notes, stored as JSON in shared preferences so the
 * app stays account-free and works offline.
 */
class SelfImprovementRepository(context: Context) {

    private val prefs = KioskPreferences(context)

    fun today(): Long = System.currentTimeMillis() / 86_400_000L

    // ------------------------------------------------------------------- habits
    fun habits(): List<Habit> = objects(KEY_HABITS).map {
        Habit(it.optString("id"), it.optString("title"), it.optLong("doneDay", 0L))
    }

    fun habitsDoneToday(): Int = habits().count { it.doneDay == today() }

    fun addHabit(title: String) {
        add(KEY_HABITS, title) { JSONObject().put("doneDay", 0L) }
    }

    fun setHabitDone(id: String, done: Boolean) {
        update(KEY_HABITS, id) { it.put("doneDay", if (done) today() else 0L) }
    }

    fun removeHabit(id: String) = remove(KEY_HABITS, id)

    // -------------------------------------------------------------------- tasks
    fun tasks(): List<Task> = objects(KEY_TASKS).map {
        Task(it.optString("id"), it.optString("title"), it.optBoolean("done"))
    }

    fun openTasks(): Int = tasks().count { !it.done }

    fun addTask(title: String) {
        add(KEY_TASKS, title) { JSONObject().put("done", false) }
    }

    fun setTaskDone(id: String, done: Boolean) {
        update(KEY_TASKS, id) { it.put("done", done) }
    }

    fun removeTask(id: String) = remove(KEY_TASKS, id)

    // -------------------------------------------------------------------- goals
    fun goals(): List<Goal> = objects(KEY_GOALS).map {
        Goal(it.optString("id"), it.optString("title"), it.optInt("progress", 0))
    }

    fun goalProgress(): Int {
        val goals = goals()
        return if (goals.isEmpty()) 0 else goals.sumOf { it.progress } / goals.size
    }

    fun addGoal(title: String) {
        add(KEY_GOALS, title) { JSONObject().put("progress", 0) }
    }

    fun stepGoal(id: String, delta: Int) {
        update(KEY_GOALS, id) {
            val next = (it.optInt("progress", 0) + delta).coerceIn(0, 100)
            it.put("progress", next)
        }
    }

    fun removeGoal(id: String) = remove(KEY_GOALS, id)

    // -------------------------------------------------------------------- notes
    fun notes(): List<Note> = objects(KEY_NOTES).map {
        Note(
            it.optString("id"),
            it.optString("title"),
            it.optString("body"),
            it.optLong("created", 0L)
        )
    }

    fun addNote(title: String, body: String) {
        if (title.isBlank() && body.isBlank()) return
        mutate(KEY_NOTES) { list ->
            list.add(
                0,
                JSONObject()
                    .put("id", UUID.randomUUID().toString())
                    .put("title", title.ifBlank { "Untitled" })
                    .put("body", body)
                    .put("created", System.currentTimeMillis())
            )
        }
    }

    fun removeNote(id: String) = remove(KEY_NOTES, id)

    // ------------------------------------------------------------------ storage
    private fun objects(key: String): List<JSONObject> {
        val raw = prefs.raw(key) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { array.optJSONObject(it) }
        }.getOrDefault(emptyList())
    }

    private fun mutate(key: String, block: (MutableList<JSONObject>) -> Unit) {
        val list = objects(key).toMutableList()
        block(list)
        val array = JSONArray()
        list.forEach { array.put(it) }
        prefs.putRaw(key, array.toString())
    }

    private fun add(key: String, title: String, extra: () -> JSONObject) {
        if (title.isBlank()) return
        mutate(key) { list ->
            val item = JSONObject()
                .put("id", UUID.randomUUID().toString())
                .put("title", title.trim())
            val fields = extra()
            fields.keys().forEach { field -> item.put(field, fields.get(field)) }
            list.add(item)
        }
    }

    private fun update(key: String, id: String, block: (JSONObject) -> Unit) {
        mutate(key) { list -> list.firstOrNull { it.optString("id") == id }?.let(block) }
    }

    private fun remove(key: String, id: String) {
        mutate(key) { list -> list.removeAll { it.optString("id") == id } }
    }

    companion object {
        private const val KEY_HABITS = "habits"
        private const val KEY_TASKS = "tasks"
        private const val KEY_GOALS = "goals"
        private const val KEY_NOTES = "notes"
    }
}
