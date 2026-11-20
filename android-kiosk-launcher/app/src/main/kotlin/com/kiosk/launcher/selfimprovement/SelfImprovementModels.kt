package com.kiosk.launcher.selfimprovement

data class KioskHabit(
    val id: String,
    val title: String,
    val category: String,
    val completedDates: Set<String>
)

data class KioskTask(
    val id: String,
    val title: String,
    val priority: String,
    val completed: Boolean
)

data class KioskGoalMilestone(
    val id: String,
    val title: String,
    val done: Boolean
)

data class KioskGoal(
    val id: String,
    val title: String,
    val category: String,
    val targetDate: String,
    val whyItMatters: String,
    val milestones: List<KioskGoalMilestone>
) {
    val progressPercent: Int
        get() = if (milestones.isEmpty()) 0 else (milestones.count { it.done } * 100) / milestones.size
}

data class KioskNote(
    val id: String,
    val title: String,
    val notebook: String,
    val fontFamily: String,
    val fontSizeSp: Int,
    val htmlContent: String,
    val updatedAtMillis: Long
)
