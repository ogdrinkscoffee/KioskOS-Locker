/**
 * Copyright (c) 2026 [Your Name / Studio Name]. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, reverse-engineering,
 * modification, or redistribution of this file is strictly prohibited.
 */
package com.kiosk.launcher.ui

import android.content.res.Configuration
import android.graphics.Typeface
import android.os.Bundle
import android.os.CountDownTimer
import android.text.Spannable
import android.text.style.StyleSpan
import android.util.TypedValue
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.text.HtmlCompat
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.databinding.ActivitySelfImprovementBinding
import com.kiosk.launcher.selfimprovement.KioskHabit
import com.kiosk.launcher.selfimprovement.KioskNote
import com.kiosk.launcher.selfimprovement.KioskTask
import com.kiosk.launcher.selfimprovement.SelfImprovementRepository
import com.kiosk.launcher.sync.CloudSyncManager
import java.time.LocalDate
import java.util.UUID

/**
 * Built-in Self-Improvement Hub running inside the locked Kiosk task.
 * Provides:
 * - Clean Streak & Recovery Check-In (quitting porn & social media)
 * - Habit & Task Tracker
 * - Notion-style Rich Notes & Diary Editor (bold, italic, font family, font size, table insertion)
 */
class SelfImprovementActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySelfImprovementBinding
    private lateinit var repo: SelfImprovementRepository
    private var activeNoteId: String? = null
    private var currentFontFamily: String = "sans"
    private var currentFontSizeSp: Int = 16
    private var focusTimer: CountDownTimer? = null
    private var focusRemainingMillis: Long = 25 * 60 * 1000L
    private var focusRunning: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySelfImprovementBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repo = SelfImprovementRepository(this)
        if (DevicePolicyHelper.isDeviceOwner(this)) {
            try {
                startLockTask()
            } catch (_: IllegalStateException) {
            }
        }

        setupSectionTabs()
        setupStreakControls()
        setupFocusTimerControls()
        setupHabitAndTaskControls()
        setupRichNoteEditor()
        refreshAllSections()
    }

    override fun onDestroy() {
        focusTimer?.cancel()
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // Preserves rich note edits and active tab state across rotation/font-scale changes
    }

    private fun setupSectionTabs() {
        binding.tabTrackerButton.setOnClickListener { showSection(showNotes = false) }
        binding.tabNotesButton.setOnClickListener { showSection(showNotes = true) }
        binding.closeSelfImprovementButton.setOnClickListener { finish() }
        showSection(showNotes = false)
    }

    private fun showSection(showNotes: Boolean) {
        binding.trackerSection.visibility = if (showNotes) View.GONE else View.VISIBLE
        binding.notesSection.visibility = if (showNotes) View.VISIBLE else View.GONE
    }

    private fun setupStreakControls() {
        binding.nextAffirmationButton.setOnClickListener {
            binding.dailyAffirmationText.text = repo.cycleAffirmation()
        }

        binding.logCleanDayButton.setOnClickListener {
            val updated = repo.getCleanStreakDays() + 1
            repo.setCleanStreakDays(updated)
            refreshStreakBanner()
            CloudSyncManager.triggerSyncIfEnabled(this)
            Toast.makeText(this, getString(R.string.toast_clean_day_logged, updated), Toast.LENGTH_SHORT).show()
        }
        binding.resetStreakButton.setOnClickListener {
            repo.setCleanStreakDays(0)
            refreshStreakBanner()
            CloudSyncManager.triggerSyncIfEnabled(this)
            Toast.makeText(this, R.string.toast_streak_reset, Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupFocusTimerControls() {
        updateFocusTimerDisplay()
        binding.focusStartPauseButton.setOnClickListener {
            if (focusRunning) {
                focusTimer?.cancel()
                focusRunning = false
                binding.focusStartPauseButton.setText(R.string.action_start_focus)
            } else {
                focusRunning = true
                binding.focusStartPauseButton.setText(R.string.action_pause_focus)
                focusTimer = object : CountDownTimer(focusRemainingMillis, 1000L) {
                    override fun onTick(millisUntilFinished: Long) {
                        focusRemainingMillis = millisUntilFinished
                        updateFocusTimerDisplay()
                    }

                    override fun onFinish() {
                        focusRunning = false
                        focusRemainingMillis = 25 * 60 * 1000L
                        binding.focusStartPauseButton.setText(R.string.action_start_focus)
                        updateFocusTimerDisplay()
                        Toast.makeText(
                            this@SelfImprovementActivity,
                            R.string.toast_focus_complete,
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }.start()
            }
        }
        binding.focusResetButton.setOnClickListener {
            focusTimer?.cancel()
            focusRunning = false
            focusRemainingMillis = 25 * 60 * 1000L
            binding.focusStartPauseButton.setText(R.string.action_start_focus)
            updateFocusTimerDisplay()
        }
    }

    private fun updateFocusTimerDisplay() {
        val totalSeconds = (focusRemainingMillis / 1000L).toInt().coerceAtLeast(0)
        val mins = totalSeconds / 60
        val secs = totalSeconds % 60
        binding.focusTimerValue.text = getString(R.string.focus_timer_format, mins, secs)
    }

    private fun setupHabitAndTaskControls() {
        binding.addHabitButton.setOnClickListener {
            val title = binding.newHabitInput.text?.toString()?.trim().orEmpty()
            if (title.isEmpty()) return@setOnClickListener
            val updated = repo.getHabits() + KioskHabit(
                id = UUID.randomUUID().toString(),
                title = title,
                category = "Recovery",
                completedDates = emptySet()
            )
            repo.saveHabits(updated)
            binding.newHabitInput.text?.clear()
            refreshTrackerSummary()
            CloudSyncManager.triggerSyncIfEnabled(this)
        }

        binding.addTaskButton.setOnClickListener {
            val title = binding.newTaskInput.text?.toString()?.trim().orEmpty()
            if (title.isEmpty()) return@setOnClickListener
            val updated = repo.getTasks() + KioskTask(
                id = UUID.randomUUID().toString(),
                title = title,
                priority = "High",
                completed = false
            )
            repo.saveTasks(updated)
            binding.newTaskInput.text?.clear()
            refreshTrackerSummary()
            CloudSyncManager.triggerSyncIfEnabled(this)
        }
    }

    private fun setupRichNoteEditor() {
        binding.boldButton.setOnClickListener { applyStyleSpan(Typeface.BOLD) }
        binding.italicButton.setOnClickListener { applyStyleSpan(Typeface.ITALIC) }

        binding.fontCycleButton.setOnClickListener {
            currentFontFamily = when (currentFontFamily) {
                "sans" -> "serif"
                "serif" -> "mono"
                else -> "sans"
            }
            applyEditorTypography()
        }

        binding.fontSizeIncreaseButton.setOnClickListener {
            currentFontSizeSp = (currentFontSizeSp + 2).coerceAtMost(28)
            applyEditorTypography()
        }

        binding.fontSizeDecreaseButton.setOnClickListener {
            currentFontSizeSp = (currentFontSizeSp - 2).coerceAtLeast(12)
            applyEditorTypography()
        }

        binding.insertTableButton.setOnClickListener {
            val editable = binding.noteBodyInput.text ?: return@setOnClickListener
            val cursor = binding.noteBodyInput.selectionStart.coerceAtLeast(0)
            val tableTemplate = "\n| Column 1 | Column 2 |\n| --- | --- |\n| Entry | Status |\n"
            editable.insert(cursor, tableTemplate)
        }

        binding.saveNoteButton.setOnClickListener {
            saveActiveNote()
            Toast.makeText(this, R.string.toast_note_saved, Toast.LENGTH_SHORT).show()
        }
    }

    private fun applyStyleSpan(style: Int) {
        val editable = binding.noteBodyInput.text ?: return
        val start = binding.noteBodyInput.selectionStart
        val end = binding.noteBodyInput.selectionEnd
        if (start >= 0 && end > start) {
            editable.setSpan(StyleSpan(style), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    private fun applyEditorTypography() {
        binding.noteBodyInput.typeface = when (currentFontFamily) {
            "serif" -> Typeface.SERIF
            "mono" -> Typeface.MONOSPACE
            else -> Typeface.SANS_SERIF
        }
        binding.noteBodyInput.setTextSize(TypedValue.COMPLEX_UNIT_SP, currentFontSizeSp.toFloat())
        binding.fontCycleButton.text = getString(R.string.label_font_cycle, currentFontFamily, currentFontSizeSp)
    }

    private fun saveActiveNote() {
        val title = binding.noteTitleInput.text?.toString()?.trim().orEmpty().ifEmpty { "Untitled Note" }
        val html = HtmlCompat.toHtml(
            binding.noteBodyInput.text ?: return,
            HtmlCompat.TO_HTML_PARAGRAPH_LINES_CONSECUTIVE
        )
        val notes = repo.getNotes().toMutableList()
        val id = activeNoteId ?: UUID.randomUUID().toString()
        val updatedNote = KioskNote(
            id = id,
            title = title,
            notebook = "Diary & Goals",
            fontFamily = currentFontFamily,
            fontSizeSp = currentFontSizeSp,
            htmlContent = html,
            updatedAtMillis = System.currentTimeMillis()
        )
        val existingIdx = notes.indexOfFirst { it.id == id }
        if (existingIdx >= 0) {
            notes[existingIdx] = updatedNote
        } else {
            notes.add(0, updatedNote)
        }
        activeNoteId = id
        repo.saveNotes(notes)
        CloudSyncManager.triggerSyncIfEnabled(this)
    }

    private fun refreshAllSections() {
        refreshStreakBanner()
        refreshTrackerSummary()
        val firstNote = repo.getNotes().firstOrNull()
        if (firstNote != null) {
            activeNoteId = firstNote.id
            currentFontFamily = firstNote.fontFamily
            currentFontSizeSp = firstNote.fontSizeSp
            binding.noteTitleInput.setText(firstNote.title)
            binding.noteBodyInput.setText(
                HtmlCompat.fromHtml(firstNote.htmlContent, HtmlCompat.FROM_HTML_MODE_COMPACT)
            )
            applyEditorTypography()
        }
    }

    private fun refreshStreakBanner() {
        binding.cleanStreakValue.text = getString(R.string.clean_streak_days_format, repo.getCleanStreakDays())
        binding.dailyAffirmationText.text = repo.getCurrentAffirmation()
    }

    private fun refreshTrackerSummary() {
        val today = LocalDate.now().toString()
        val habits = repo.getHabits()
        val tasks = repo.getTasks()
        val goals = repo.getGoals()
        val doneHabits = habits.count { today in it.completedDates }
        val doneTasks = tasks.count { it.completed }
        binding.trackerSummaryText.text = buildString {
            append("Habits today: $doneHabits / ${habits.size}\n")
            habits.forEach { append("• ${it.title} (${it.completedDates.size}d)\n") }
            append("\nTasks completed: $doneTasks / ${tasks.size}\n")
            tasks.forEach { append(if (it.completed) "✓ ${it.title}\n" else "○ ${it.title}\n") }
            if (goals.isNotEmpty()) {
                append("\nActive Goals: ${goals.size}\n")
                goals.forEach { append("• ${it.title} (${it.progressPercent}%)\n") }
            }
        }
    }
}
