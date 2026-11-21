package com.kiosk.launcher.selfimprovement

data class Habit(
    val id: String,
    val title: String,
    /** Epoch day the habit was last completed, 0 when never. */
    val doneDay: Long
)

data class Task(val id: String, val title: String, val done: Boolean)

data class Goal(val id: String, val title: String, val progress: Int)

data class Note(
    val id: String,
    val title: String,
    val body: String,
    val created: Long
)
