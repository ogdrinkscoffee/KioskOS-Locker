/**
 * Copyright (c) 2026 [Your Name / Studio Name]. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, reverse-engineering,
 * modification, or redistribution of this file is strictly prohibited.
 */
package com.kiosk.launcher.selfimprovement

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Direct-Boot-safe JSON repository storing Habits, Tasks, Goals, Clean Streak,
 * and Rich HTML Notes (bold, italic, font size, font family, tables).
 */
class SelfImprovementRepository(context: Context) {

    private val deviceContext = context.applicationContext.createDeviceProtectedStorageContext()
    private val prefs = deviceContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        seedDefaultsIfEmpty()
    }

    private fun seedDefaultsIfEmpty() {
        if (prefs.getBoolean(KEY_INITIALIZED, false)) return

        val defaultHabits = listOf(
            KioskHabit(UUID.randomUUID().toString(), "Clean Day (No Porn)", "Recovery", emptySet()),
            KioskHabit(UUID.randomUUID().toString(), "Zero Social Media Scrolling", "Recovery", emptySet()),
            KioskHabit(UUID.randomUUID().toString(), "25m Deep Work / Study", "Focus", emptySet()),
            KioskHabit(UUID.randomUUID().toString(), "Physical Training", "Health", emptySet())
        )
        saveHabits(defaultHabits)

        val defaultNotes = listOf(
            KioskNote(
                id = UUID.randomUUID().toString(),
                title = "My Recovery Commitment & Why",
                notebook = "Goals",
                fontFamily = "sans",
                fontSizeSp = 16,
                htmlContent = "<p><b>Why I locked this device:</b> Reclaiming focus, clarity, and real-world momentum.</p>" +
                    "<p><i>Rule:</i> When an urge hits, pause for 60 seconds, breathe, and log the trigger below.</p>" +
                    "<table><tr><th>Trigger</th><th>Replacement Action</th></tr><tr><td>Boredom / Late Night</td><td>Put phone on desk, read 10 pages</td></tr></table>",
                updatedAtMillis = System.currentTimeMillis()
            )
        )
        saveNotes(defaultNotes)

        val defaultAffirmations = listOf(
            "My attention belongs to my real-world goals, not to an algorithm or cheap dopamine.",
            "An urge is only a temporary wave. I pause for 60 seconds and choose who I want to become.",
            "Every clean night builds deep self-respect that I will feel the moment I wake up.",
            "Boredom is not an emergency. I turn quiet moments into reading, training, or building."
        )
        saveAffirmations(defaultAffirmations)
        prefs.edit()
            .putInt(KEY_CLEAN_STREAK_DAYS, 0)
            .putInt(KEY_ACTIVE_AFFIRMATION_INDEX, 0)
            .putBoolean(KEY_INITIALIZED, true)
            .apply()
    }

    fun getCleanStreakDays(): Int = prefs.getInt(KEY_CLEAN_STREAK_DAYS, 0)

    fun setCleanStreakDays(days: Int) {
        prefs.edit().putInt(KEY_CLEAN_STREAK_DAYS, days.coerceAtLeast(0)).apply()
    }

    fun getHabits(): List<KioskHabit> {
        val raw = prefs.getString(KEY_HABITS, "[]") ?: "[]"
        val arr = JSONArray(raw)
        return buildList {
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val datesArr = obj.optJSONArray("completedDates") ?: JSONArray()
                val dates = mutableSetOf<String>()
                for (j in 0 until datesArr.length()) dates.add(datesArr.getString(j))
                add(
                    KioskHabit(
                        id = obj.getString("id"),
                        title = obj.getString("title"),
                        category = obj.optString("category", "General"),
                        completedDates = dates
                    )
                )
            }
        }
    }

    fun saveHabits(habits: List<KioskHabit>) {
        val arr = JSONArray()
        habits.forEach { habit ->
            arr.put(JSONObject().apply {
                put("id", habit.id)
                put("title", habit.title)
                put("category", habit.category)
                put("completedDates", JSONArray(habit.completedDates.toList()))
            })
        }
        prefs.edit().putString(KEY_HABITS, arr.toString()).apply()
    }

    fun getTasks(): List<KioskTask> {
        val raw = prefs.getString(KEY_TASKS, "[]") ?: "[]"
        val arr = JSONArray(raw)
        return buildList {
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                add(
                    KioskTask(
                        id = obj.getString("id"),
                        title = obj.getString("title"),
                        priority = obj.optString("priority", "Medium"),
                        completed = obj.optBoolean("completed", false)
                    )
                )
            }
        }
    }

    fun saveTasks(tasks: List<KioskTask>) {
        val arr = JSONArray()
        tasks.forEach { task ->
            arr.put(JSONObject().apply {
                put("id", task.id)
                put("title", task.title)
                put("priority", task.priority)
                put("completed", task.completed)
            })
        }
        prefs.edit().putString(KEY_TASKS, arr.toString()).apply()
    }

    fun getGoals(): List<KioskGoal> {
        val raw = prefs.getString(KEY_GOALS, "[]") ?: "[]"
        val arr = JSONArray(raw)
        return buildList {
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val mArr = obj.optJSONArray("milestones") ?: JSONArray()
                val milestones = buildList {
                    for (j in 0 until mArr.length()) {
                        val mObj = mArr.getJSONObject(j)
                        add(
                            KioskGoalMilestone(
                                id = mObj.getString("id"),
                                title = mObj.getString("title"),
                                done = mObj.optBoolean("done", false)
                            )
                        )
                    }
                }
                add(
                    KioskGoal(
                        id = obj.getString("id"),
                        title = obj.getString("title"),
                        category = obj.optString("category", "Recovery"),
                        targetDate = obj.optString("targetDate", ""),
                        whyItMatters = obj.optString("whyItMatters", ""),
                        milestones = milestones
                    )
                )
            }
        }
    }

    fun saveGoals(goals: List<KioskGoal>) {
        val arr = JSONArray()
        goals.forEach { goal ->
            val mArr = JSONArray()
            goal.milestones.forEach { m ->
                mArr.put(JSONObject().apply {
                    put("id", m.id)
                    put("title", m.title)
                    put("done", m.done)
                })
            }
            arr.put(JSONObject().apply {
                put("id", goal.id)
                put("title", goal.title)
                put("category", goal.category)
                put("targetDate", goal.targetDate)
                put("whyItMatters", goal.whyItMatters)
                put("milestones", mArr)
            })
        }
        prefs.edit().putString(KEY_GOALS, arr.toString()).apply()
    }

    fun getNotes(): List<KioskNote> {
        val raw = prefs.getString(KEY_NOTES, "[]") ?: "[]"
        val arr = JSONArray(raw)
        return buildList {
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                add(
                    KioskNote(
                        id = obj.getString("id"),
                        title = obj.getString("title"),
                        notebook = obj.optString("notebook", "Diary"),
                        fontFamily = obj.optString("fontFamily", "sans"),
                        fontSizeSp = obj.optInt("fontSizeSp", 16),
                        htmlContent = obj.optString("htmlContent", ""),
                        updatedAtMillis = obj.optLong("updatedAtMillis", System.currentTimeMillis())
                    )
                )
            }
        }
    }

    fun saveNotes(notes: List<KioskNote>) {
        val arr = JSONArray()
        notes.forEach { note ->
            arr.put(JSONObject().apply {
                put("id", note.id)
                put("title", note.title)
                put("notebook", note.notebook)
                put("fontFamily", note.fontFamily)
                put("fontSizeSp", note.fontSizeSp)
                put("htmlContent", note.htmlContent)
                put("updatedAtMillis", note.updatedAtMillis)
            })
        }
        prefs.edit().putString(KEY_NOTES, arr.toString()).apply()
    }

    fun getAffirmations(): List<String> {
        val raw = prefs.getString(KEY_AFFIRMATIONS, "[]") ?: "[]"
        val arr = JSONArray(raw)
        return buildList {
            for (i in 0 until arr.length()) {
                val item = arr.optString(i).trim()
                if (item.isNotEmpty()) add(item)
            }
        }
    }

    fun saveAffirmations(affirmations: List<String>) {
        prefs.edit().putString(KEY_AFFIRMATIONS, JSONArray(affirmations).toString()).apply()
    }

    fun getCurrentAffirmation(): String {
        val list = getAffirmations()
        if (list.isEmpty()) return "My focus belongs to my future."
        val idx = prefs.getInt(KEY_ACTIVE_AFFIRMATION_INDEX, 0).mod(list.size)
        return list[idx]
    }

    fun cycleAffirmation(): String {
        val list = getAffirmations()
        if (list.isEmpty()) return "My focus belongs to my future."
        val next = (prefs.getInt(KEY_ACTIVE_AFFIRMATION_INDEX, 0) + 1).mod(list.size)
        prefs.edit().putInt(KEY_ACTIVE_AFFIRMATION_INDEX, next).apply()
        return list[next]
    }

    fun addCustomAffirmation(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        val updated = listOf(trimmed) + getAffirmations()
        saveAffirmations(updated)
        prefs.edit().putInt(KEY_ACTIVE_AFFIRMATION_INDEX, 0).apply()
    }

    companion object {
        private const val PREFS_NAME = "kiosk_self_improvement_prefs"
        private const val KEY_INITIALIZED = "initialized"
        private const val KEY_CLEAN_STREAK_DAYS = "clean_streak_days"
        private const val KEY_HABITS = "habits_json"
        private const val KEY_TASKS = "tasks_json"
        private const val KEY_GOALS = "goals_json"
        private const val KEY_NOTES = "notes_json"
        private const val KEY_AFFIRMATIONS = "affirmations_json"
        private const val KEY_ACTIVE_AFFIRMATION_INDEX = "active_affirmation_idx"
    }
}
