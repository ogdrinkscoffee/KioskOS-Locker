package com.kiosk.launcher.selfimprovement

/** Habit categories shared by the habit tracker and the website workspace. */
object HabitCategories {
    const val RECOVERY = "Recovery"
    const val DISCIPLINE = "Discipline"
    const val FOCUS = "Focus"
    const val HEALTH = "Health"
    val ALL = listOf(RECOVERY, DISCIPLINE, FOCUS, HEALTH)
}

object GoalCategories {
    const val RECOVERY = "Recovery"
    const val FITNESS = "Fitness"
    const val CAREER = "Career & Study"
    const val MINDSET = "Mindset"
    val ALL = listOf(RECOVERY, FITNESS, CAREER, MINDSET)
}

object TaskPriorities {
    const val HIGH = "High"
    const val MEDIUM = "Medium"
    const val LOW = "Low"
    val ALL = listOf(HIGH, MEDIUM, LOW)
}

object TaskFilters {
    const val ALL = "all"
    const val ACTIVE = "active"
    const val COMPLETED = "completed"
}

object Notebooks {
    const val DIARY = "Diary"
    const val GOALS = "Goals & Vision"
    const val URGE = "Urge Reflection"
    const val NOTES = "Notes"
    val ALL = listOf(DIARY, GOALS, URGE, NOTES)
}

data class Habit(
    val id: String,
    val title: String,
    val category: String,
    /** Local calendar epoch days this habit was completed. */
    val days: List<Long>
)

data class Task(
    val id: String,
    val title: String,
    val priority: String,
    val dueTime: String,
    val done: Boolean
)

data class Milestone(val id: String, val title: String, val done: Boolean)

data class Goal(
    val id: String,
    val title: String,
    val category: String,
    val targetDate: String,
    val why: String,
    val milestones: List<Milestone>
) {
    val progressPercent: Int
        get() = if (milestones.isEmpty()) 0
        else Math.round(milestones.count { it.done } * 100f / milestones.size)
}

data class Note(
    val id: String,
    val title: String,
    val body: String,
    val notebook: String,
    val pinned: Boolean,
    val updatedDay: Long
)

/** One day of the 30-day progress charts. */
data class DayProgress(
    val day: Long,
    val cleanStreakDay: Int,
    val habitPercent: Int
)

data class HabitProgress(val completed: Int, val total: Int)
