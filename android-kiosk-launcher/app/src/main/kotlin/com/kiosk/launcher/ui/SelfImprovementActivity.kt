package com.kiosk.launcher.ui

import android.app.DatePickerDialog
import android.app.Dialog
import android.graphics.Paint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.checkbox.MaterialCheckBox
import com.google.android.material.chip.ChipGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.selfimprovement.HabitCategories
import com.kiosk.launcher.selfimprovement.GoalCategories
import com.kiosk.launcher.selfimprovement.Note
import com.kiosk.launcher.selfimprovement.Notebooks
import com.kiosk.launcher.selfimprovement.SelfImprovementRepository
import com.kiosk.launcher.selfimprovement.TaskFilters
import com.kiosk.launcher.selfimprovement.TaskPriorities
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.min

/**
 * The Focus & Growth workspace. Mirrors the self-improvement features of the
 * Ironclad OS web app (streak, urge grounding, focus timer, habits with history,
 * prioritised tasks, milestone goals, notebook notes and 30-day analytics)
 * and adapts its column width to phones and tablets.
 */
class SelfImprovementActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var repo: SelfImprovementRepository

    private lateinit var overviewSection: View
    private lateinit var habitsSection: View
    private lateinit var tasksSection: View
    private lateinit var goalsSection: View
    private lateinit var notesSection: View

    private lateinit var habitsContainer: LinearLayout
    private lateinit var tasksContainer: LinearLayout
    private lateinit var goalsContainer: LinearLayout
    private lateinit var notesContainer: LinearLayout

    private lateinit var habitsEmpty: TextView
    private lateinit var tasksEmpty: TextView
    private lateinit var goalsEmpty: TextView
    private lateinit var notesEmpty: TextView

    private lateinit var timerText: TextView
    private lateinit var focusTodayLabel: TextView
    private lateinit var timerBar: LinearProgressIndicator
    private lateinit var focusIntentionInput: EditText
    private lateinit var timerStartButton: MaterialButton

    private lateinit var urgePanel: View
    private lateinit var urgeCountdown: TextView
    private lateinit var whyInput: EditText

    private lateinit var taskCountLabel: TextView
    private lateinit var noteSearch: EditText
    private lateinit var noteNotebook: Spinner

    private lateinit var cleanChart: GrowthChartView
    private lateinit var habitChart: GrowthChartView

    private var totalSeconds = 25 * 60
    private var secondsLeft = 25 * 60
    private var running = false

    private var urgeSecondsLeft = URGE_SECONDS
    private var urgeRunning = false

    private var taskFilter = TaskFilters.ALL
    private var noteNotebookFilter = ""
    private var noteQuery = ""
    private var selectedSectionId = R.id.chipOverview

    private var focusDialog: Dialog? = null

    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            if (!running) return
            secondsLeft -= 1
            if (secondsLeft <= 0) {
                secondsLeft = 0
                running = false
                val completedMins = (totalSeconds / 60).coerceAtLeast(1)
                repo.recordFocusSession(completedMins)
                toast(getString(R.string.focus_complete_toast, completedMins))
                renderFocusToday()
                timerStartButton.text = getString(R.string.timer_start)
            }
            renderTimer()
            if (running) handler.postDelayed(this, 1_000L)
        }
    }

    private val urgeTicker = object : Runnable {
        override fun run() {
            if (!urgeRunning) return
            urgeSecondsLeft = (urgeSecondsLeft - 1).coerceAtLeast(0)
            renderUrgeCountdown()
            if (urgeSecondsLeft <= 0) {
                urgeRunning = false
                return
            }
            handler.postDelayed(this, 1_000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_self_improvement)

        prefs = KioskPreferences(this)
        repo = SelfImprovementRepository(this)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
        toolbar.setNavigationOnClickListener { finish() }

        bindViews()
        applyResponsiveWidth()

        if (savedInstanceState != null) {
            totalSeconds = savedInstanceState.getInt(STATE_TOTAL, totalSeconds)
            secondsLeft = savedInstanceState.getInt(STATE_LEFT, secondsLeft)
            running = savedInstanceState.getBoolean(STATE_RUNNING, false)
            urgeSecondsLeft = savedInstanceState.getInt(STATE_URGE_LEFT, urgeSecondsLeft)
            selectedSectionId = savedInstanceState.getInt(STATE_SECTION, R.id.chipOverview)
            if (savedInstanceState.getBoolean(STATE_URGE_OPEN, false)) {
                openUrgePanel(reset = false)
            }
        }
        // The intention field restores its own text; only seed the default when empty.
        if (focusIntentionInput.text.isNullOrBlank()) {
            focusIntentionInput.setText(getString(R.string.focus_deep_work))
        }
        if (running) {
            handler.postDelayed(ticker, 1_000L)
            timerStartButton.text = getString(R.string.timer_pause)
        }

        wireOverview()
        wireHabits()
        wireTasks()
        wireGoals()
        wireNotes()

        val sectionChips = findViewById<ChipGroup>(R.id.sectionChips)
        sectionChips.setOnCheckedStateChangeListener { _, checkedIds ->
            showSection(checkedIds.firstOrNull() ?: R.id.chipOverview)
        }
        // The chip row and the visible section must agree after a restore.
        val restoredSection = selectedSectionId
            .takeIf { sectionChips.findViewById<View>(it) != null }
            ?: R.id.chipOverview
        sectionChips.check(restoredSection)
        showSection(restoredSection)
        renderAll()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt(STATE_TOTAL, totalSeconds)
        outState.putInt(STATE_LEFT, secondsLeft)
        outState.putBoolean(STATE_RUNNING, running)
        outState.putInt(STATE_URGE_LEFT, urgeSecondsLeft)
        outState.putInt(STATE_SECTION, selectedSectionId)
        outState.putBoolean(STATE_URGE_OPEN, urgePanel.visibility == View.VISIBLE)
    }

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        handler.removeCallbacks(urgeTicker)
        focusDialog?.dismiss()
        focusDialog = null
        super.onDestroy()
    }

    // --------------------------------------------------------------------- setup
    private fun bindViews() {
        overviewSection = findViewById(R.id.overviewSection)
        habitsSection = findViewById(R.id.habitsSection)
        tasksSection = findViewById(R.id.tasksSection)
        goalsSection = findViewById(R.id.goalsSection)
        notesSection = findViewById(R.id.notesSection)

        habitsContainer = findViewById(R.id.habitsContainer)
        tasksContainer = findViewById(R.id.tasksContainer)
        goalsContainer = findViewById(R.id.goalsContainer)
        notesContainer = findViewById(R.id.notesContainer)

        habitsEmpty = findViewById<TextView>(R.id.habitsEmpty)
        tasksEmpty = findViewById<TextView>(R.id.tasksEmpty)
        goalsEmpty = findViewById<TextView>(R.id.goalsEmpty)
        notesEmpty = findViewById<TextView>(R.id.notesEmpty)

        timerText = findViewById(R.id.timerText)
        focusTodayLabel = findViewById(R.id.focusTodayLabel)
        timerBar = findViewById(R.id.timerBar)
        timerStartButton = findViewById(R.id.timerStart)
        focusIntentionInput = findViewById(R.id.focusIntentionInput)

        urgePanel = findViewById(R.id.siUrgePanel)
        urgeCountdown = findViewById(R.id.siUrgeCountdown)
        whyInput = findViewById(R.id.siWhyInput)

        taskCountLabel = findViewById(R.id.taskCountLabel)
        noteSearch = findViewById(R.id.noteSearch)
        noteNotebook = findViewById(R.id.noteNotebook)

        cleanChart = findViewById(R.id.cleanChart)
        habitChart = findViewById(R.id.habitChart)
        habitChart.barMode = true
        habitChart.fixedMax = 100f

        whyInput.setText(repo.whyIStarted)
        setUpNotebookSpinner()
    }

    /**
     * Keeps the content column readable on tablets: the layout is a single
     * column on phones and a centered, wider column on 600dp+ screens.
     */
    private fun applyResponsiveWidth() {
        val content = findViewById<View>(R.id.siContent)
        content.post {
            // Measure the scrolling parent rather than the display so the column
            // also fits split-screen and freeform windows.
            val parent = content.parent as? View ?: return@post
            val available = parent.width - parent.paddingStart - parent.paddingEnd
            if (available <= 0) return@post
            val maxWidth = resources.getDimensionPixelSize(R.dimen.si_max_content_width)
            content.layoutParams = (content.layoutParams as ViewGroup.MarginLayoutParams).apply {
                width = min(maxWidth, available)
            }
        }
    }

    private fun wireOverview() {
        findViewById<View>(R.id.siMarkClean).setOnClickListener {
            val logged = repo.markCleanDay()
            toast(getString(if (logged) R.string.streak_logged_today else R.string.streak_already_logged))
            renderOverview()
            renderCharts()
        }

        findViewById<View>(R.id.siResetStreak).setOnClickListener { confirmResetStreak() }

        findViewById<View>(R.id.siUrgePauseToggle).setOnClickListener { toggleUrgePanel() }
        findViewById<View>(R.id.siUrgeClose).setOnClickListener { closeUrgePanel() }
        findViewById<View>(R.id.siLogVictory).setOnClickListener {
            repo.logUrgeVictory()
            toast(getString(R.string.urge_logged))
            closeUrgePanel()
            renderOverview()
        }

        findViewById<View>(R.id.siWhySave).setOnClickListener {
            repo.whyIStarted = whyInput.text.toString()
            toast(getString(R.string.reminder_saved))
        }

        findViewById<View>(R.id.preset15m).setOnClickListener { selectFocusPreset(15) }
        findViewById<View>(R.id.preset25m).setOnClickListener { selectFocusPreset(25) }
        findViewById<View>(R.id.preset45m).setOnClickListener { selectFocusPreset(45) }
        findViewById<View>(R.id.preset60m).setOnClickListener { selectFocusPreset(60) }

        findViewById<View>(R.id.timerStart).setOnClickListener {
            if (secondsLeft <= 0) secondsLeft = totalSeconds
            running = !running
            timerStartButton.text =
                getString(if (running) R.string.timer_pause else R.string.timer_start)
            if (running) {
                handler.removeCallbacks(ticker)
                handler.postDelayed(ticker, 1_000L)
            }
            renderTimer()
        }
        findViewById<View>(R.id.timerPause).setOnClickListener {
            running = false
            timerStartButton.text = getString(R.string.timer_start)
            renderTimer()
        }
        findViewById<View>(R.id.timerReset).setOnClickListener {
            running = false
            timerStartButton.text = getString(R.string.timer_start)
            secondsLeft = totalSeconds
            renderTimer()
        }
        findViewById<View>(R.id.timerComplete).setOnClickListener { completeFocusEarly() }
        findViewById<View>(R.id.focusFullscreen).setOnClickListener { openFocusDialog() }
    }

    private fun wireHabits() {
        findViewById<View>(R.id.habitAdd).setOnClickListener {
            val input = findViewById<EditText>(R.id.habitInput)
            val spinner = findViewById<Spinner>(R.id.habitCategory)
            val category = HabitCategories.ALL.getOrElse(spinner.selectedItemPosition) {
                HabitCategories.RECOVERY
            }
            if (input.text.isBlank()) {
                toast(getString(R.string.habit_title_required))
                return@setOnClickListener
            }
            repo.addHabit(input.text.toString(), category)
            input.setText("")
            renderHabits()
            renderOverview()
            renderCharts()
        }
    }

    private fun wireTasks() {
        findViewById<View>(R.id.taskAdd).setOnClickListener {
            val input = findViewById<EditText>(R.id.taskInput)
            val prioritySpinner = findViewById<Spinner>(R.id.taskPriority)
            val timeInput = findViewById<EditText>(R.id.taskTime)
            if (input.text.isBlank()) {
                toast(getString(R.string.task_title_required))
                return@setOnClickListener
            }
            val priority = TaskPriorities.ALL.getOrElse(prioritySpinner.selectedItemPosition) {
                TaskPriorities.MEDIUM
            }
            repo.addTask(input.text.toString(), priority, timeInput.text.toString())
            input.setText("")
            timeInput.setText("")
            renderTasks()
            renderOverview()
        }

        findViewById<ChipGroup>(R.id.taskFilterChips).setOnCheckedStateChangeListener { _, ids ->
            taskFilter = when (ids.firstOrNull()) {
                R.id.chipTaskActive -> TaskFilters.ACTIVE
                R.id.chipTaskCompleted -> TaskFilters.COMPLETED
                else -> TaskFilters.ALL
            }
            renderTasks()
        }
    }

    private fun wireGoals() {
        findViewById<View>(R.id.goalAdd).setOnClickListener { showGoalDialog() }
    }

    private fun wireNotes() {
        findViewById<View>(R.id.noteAdd).setOnClickListener { showNoteDialog(null) }
        noteSearch.addTextChangedListener(object : SimpleTextWatcher() {
            override fun onTextChanged(text: String) {
                noteQuery = text
                renderNotes()
            }
        })
    }

    private fun setUpNotebookSpinner() {
        val labels = mutableListOf(getString(R.string.filter_all))
        labels.addAll(Notebooks.ALL)
        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, labels)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        noteNotebook.adapter = adapter
        noteNotebook.onItemSelectedListener = object : SimpleItemSelectedListener() {
            override fun onSelected(position: Int) {
                noteNotebookFilter = Notebooks.ALL.getOrNull(position - 1) ?: ""
                renderNotes()
            }
        }
    }

    // -------------------------------------------------------------------- render
    private fun renderAll() {
        renderOverview()
        renderHabits()
        renderTasks()
        renderGoals()
        renderNotes()
        renderCharts()
        renderTimer()
    }

    private fun renderOverview() {
        val progress = repo.todayHabitProgress()
        findViewById<TextView>(R.id.siStreakValue).text = prefs.streak.toString()
        findViewById<TextView>(R.id.siStreakMeta).text =
            getString(R.string.streak_meta_si_fmt, prefs.bestStreak, lastCleanDayText())
        findViewById<TextView>(R.id.siUrgeStat).text =
            getString(R.string.urge_stat_fmt, repo.urgeVictories)

        findViewById<TextView>(R.id.statHabits).text = "${progress.completed}/${progress.total}"
        findViewById<TextView>(R.id.statTasks).text = repo.openTasks().toString()
        findViewById<TextView>(R.id.statGoals).text = "${repo.goalProgress()}%"
        findViewById<TextView>(R.id.statUrges).text = repo.urgeVictories.toString()

        renderFocusToday()
    }

    private fun renderFocusToday() {
        focusTodayLabel.text = getString(
            R.string.focus_today_fmt,
            repo.todayFocusMinutes(),
            repo.todayFocusSessionsCount()
        )
    }

    private fun renderTimer() {
        timerText.text = String.format(Locale.US, "%02d:%02d", secondsLeft / 60, secondsLeft % 60)
        timerBar.progress = if (totalSeconds > 0) {
            (totalSeconds - secondsLeft) * 100 / totalSeconds
        } else {
            0
        }
        focusDialog?.findViewById<TextView>(R.id.focusDialogTimer)?.text = timerText.text
        focusDialog?.findViewById<TextView>(R.id.focusDialogIntention)?.text = getString(
            R.string.focus_mode_label_fmt,
            focusIntentionInput.text.toString().ifBlank { getString(R.string.focus_deep_work) }
        )
        focusDialog?.findViewById<MaterialButton>(R.id.focusDialogToggle)?.text =
            getString(if (running) R.string.timer_pause else R.string.timer_start)
    }

    private fun renderCharts() {
        val days = repo.last30Days()
        val labels = days.map { dayLabel(it.day) }
        cleanChart.labels = labels
        cleanChart.values = days.map { it.cleanStreakDay.toFloat() }
        habitChart.labels = labels
        habitChart.values = days.map { it.habitPercent.toFloat() }

        findViewById<TextView>(R.id.cleanChartCaption).text =
            getString(R.string.chart_current_fmt, prefs.streak)
        findViewById<TextView>(R.id.habitChartCaption).text =
            getString(R.string.chart_avg_fmt, days.sumOf { it.habitPercent } / days.size)
    }

    private fun renderHabits() {
        habitsContainer.removeAllViews()
        val habits = repo.habits()
        habitsEmpty.visibility = if (habits.isEmpty()) View.VISIBLE else View.GONE
        val end = repo.today()
        val days = (6 downTo 0).map { end - it }

        habits.forEach { habit ->
            val row = layoutInflater.inflate(R.layout.item_habit_row, habitsContainer, false)
            row.findViewById<TextView>(R.id.rowTitle).text = habit.title
            row.findViewById<TextView>(R.id.rowMeta).text =
                getString(R.string.habit_meta_fmt, habit.category, repo.habitStreak(habit))

            val daysRow = row.findViewById<LinearLayout>(R.id.rowDays)
            days.forEach { day ->
                val done = habit.days.contains(day)
                val toggle = TextView(this).apply {
                    text = dayOfMonth(day).toString()
                    gravity = Gravity.CENTER
                    setTextColor(
                        ContextCompat.getColor(
                            this@SelfImprovementActivity,
                            if (done) R.color.white else R.color.text_secondary
                        )
                    )
                    setTextSize(
                        TypedValue.COMPLEX_UNIT_PX,
                        resources.getDimension(R.dimen.si_day_cell_text)
                    )
                    setBackgroundResource(if (done) R.drawable.bg_day_on else R.drawable.bg_day_off)
                    contentDescription = getString(
                        R.string.habit_day_desc_fmt,
                        habit.title,
                        dayLabel(day)
                    )
                    isClickable = true
                    setOnClickListener {
                        repo.toggleHabitDay(habit.id, day)
                        renderHabits()
                        renderOverview()
                        renderCharts()
                    }
                }
                val params = LinearLayout.LayoutParams(
                    0,
                    resources.getDimensionPixelSize(R.dimen.si_day_cell_height),
                    1f
                ).apply {
                    marginEnd = resources.getDimensionPixelSize(R.dimen.si_day_cell_gap)
                }
                daysRow.addView(toggle, params)
            }

            row.findViewById<View>(R.id.rowDelete).setOnClickListener {
                repo.removeHabit(habit.id)
                renderHabits()
                renderOverview()
                renderCharts()
            }
            habitsContainer.addView(row)
        }
    }

    private fun renderTasks() {
        tasksContainer.removeAllViews()
        val all = repo.tasks()
        val visible = repo.tasks(taskFilter)
        tasksEmpty.visibility = if (visible.isEmpty()) View.VISIBLE else View.GONE
        tasksEmpty.text = getString(
            if (all.isEmpty()) R.string.tasks_empty else R.string.tasks_empty_filter
        )
        taskCountLabel.text = getString(
            R.string.task_count_fmt,
            repo.completedTasks(),
            all.size
        )

        visible.forEach { task ->
            val row = layoutInflater.inflate(R.layout.item_task_row, tasksContainer, false)
            val check = row.findViewById<MaterialCheckBox>(R.id.rowCheck)
            val title = row.findViewById<TextView>(R.id.rowTitle)
            val meta = row.findViewById<TextView>(R.id.rowMeta)

            title.text = task.title
            meta.text = getString(
                R.string.task_meta_fmt,
                task.priority,
                if (task.dueTime.isBlank()) "" else " · ${task.dueTime}"
            )
            check.isChecked = task.done
            strike(title, task.done)

            check.setOnCheckedChangeListener { _, checked ->
                repo.setTaskDone(task.id, checked)
                strike(title, checked)
                renderOverview()
                renderTasks()
            }
            row.findViewById<View>(R.id.rowDelete).setOnClickListener {
                repo.removeTask(task.id)
                renderTasks()
                renderOverview()
            }
            tasksContainer.addView(row)
        }
    }

    private fun renderGoals() {
        goalsContainer.removeAllViews()
        val goals = repo.goals()
        goalsEmpty.visibility = if (goals.isEmpty()) View.VISIBLE else View.GONE

        goals.forEach { goal ->
            val card = layoutInflater.inflate(R.layout.item_goal_card, goalsContainer, false)
            card.findViewById<TextView>(R.id.goalMeta).text =
                getString(R.string.goal_meta_fmt, goal.category, goal.targetDate)
            card.findViewById<TextView>(R.id.goalTitle).text = goal.title
            val why = card.findViewById<TextView>(R.id.goalWhy)
            if (goal.why.isBlank()) {
                why.visibility = View.GONE
            } else {
                why.text = goal.why
            }
            card.findViewById<TextView>(R.id.goalPercent).text = "${goal.progressPercent}%"
            card.findViewById<LinearProgressIndicator>(R.id.goalProgress).progress =
                goal.progressPercent

            val milestones = card.findViewById<LinearLayout>(R.id.goalMilestones)
            goal.milestones.forEach { milestone ->
                val row = layoutInflater.inflate(R.layout.item_milestone_row, milestones, false)
                val check = row.findViewById<MaterialCheckBox>(R.id.msCheck)
                val title = row.findViewById<TextView>(R.id.msTitle)
                title.text = milestone.title
                check.isChecked = milestone.done
                strike(title, milestone.done)
                check.setOnCheckedChangeListener { _, _ ->
                    repo.toggleMilestone(goal.id, milestone.id)
                    renderGoals()
                    renderOverview()
                }
                milestones.addView(row)
            }

            val milestoneInput = card.findViewById<EditText>(R.id.goalMilestoneInput)
            card.findViewById<View>(R.id.goalMilestoneAdd).setOnClickListener {
                if (milestoneInput.text.isBlank()) return@setOnClickListener
                repo.addMilestone(goal.id, milestoneInput.text.toString())
                renderGoals()
                renderOverview()
            }
            card.findViewById<View>(R.id.goalDelete).setOnClickListener {
                repo.removeGoal(goal.id)
                renderGoals()
                renderOverview()
            }
            goalsContainer.addView(card)
        }
    }

    private fun renderNotes() {
        notesContainer.removeAllViews()
        val notes = repo.notes(noteNotebookFilter, noteQuery)
        notesEmpty.visibility = if (notes.isEmpty()) View.VISIBLE else View.GONE

        notes.forEach { note ->
            val card = layoutInflater.inflate(R.layout.item_note_card, notesContainer, false)
            card.findViewById<TextView>(R.id.noteTitle).text = note.title
            card.findViewById<TextView>(R.id.noteMeta).text =
                getString(R.string.note_meta_fmt, note.notebook, dayLabel(note.updatedDay))
            val body = card.findViewById<TextView>(R.id.noteBody)
            if (note.body.isBlank()) {
                body.visibility = View.GONE
            } else {
                body.text = note.body
            }

            val pin = card.findViewById<ImageButton>(R.id.notePin)
            pin.setImageResource(
                if (note.pinned) android.R.drawable.star_on else android.R.drawable.star_off
            )
            pin.imageTintList = ContextCompat.getColorStateList(
                this,
                if (note.pinned) R.color.accent else R.color.text_secondary
            )
            pin.setOnClickListener {
                repo.toggleNotePinned(note.id)
                renderNotes()
            }

            card.setOnClickListener { showNoteDialog(note) }
            card.findViewById<View>(R.id.noteDelete).setOnClickListener {
                repo.removeNote(note.id)
                renderNotes()
            }
            notesContainer.addView(card)
        }
    }

    // ------------------------------------------------------------------ sections
    private fun showSection(chipId: Int) {
        selectedSectionId = chipId
        overviewSection.visibility = if (chipId == R.id.chipOverview) View.VISIBLE else View.GONE
        habitsSection.visibility = if (chipId == R.id.chipHabits) View.VISIBLE else View.GONE
        tasksSection.visibility = if (chipId == R.id.chipTasks) View.VISIBLE else View.GONE
        goalsSection.visibility = if (chipId == R.id.chipGoals) View.VISIBLE else View.GONE
        notesSection.visibility = if (chipId == R.id.chipNotes) View.VISIBLE else View.GONE
    }

    // -------------------------------------------------------------- focus helpers
    private fun selectFocusPreset(minutes: Int) {
        running = false
        handler.removeCallbacks(ticker)
        totalSeconds = minutes * 60
        secondsLeft = totalSeconds
        timerStartButton.text = getString(R.string.timer_start)
        renderTimer()
    }

    private fun completeFocusEarly() {
        running = false
        handler.removeCallbacks(ticker)
        val elapsedMinutes = ((totalSeconds - secondsLeft) / 60).takeIf { it > 0 }
            ?: (totalSeconds / 60)
        repo.recordFocusSession(elapsedMinutes)
        secondsLeft = totalSeconds
        timerStartButton.text = getString(R.string.timer_start)
        renderTimer()
        renderFocusToday()
        toast(getString(R.string.focus_logged_fmt, elapsedMinutes))
    }

    private fun openFocusDialog() {
        val dialog = Dialog(this, android.R.style.Theme_NoTitleBar_Fullscreen)
        dialog.setContentView(R.layout.dialog_focus)
        dialog.window?.setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        dialog.window?.setBackgroundDrawableResource(R.color.brand)
        dialog.findViewById<MaterialButton>(R.id.focusDialogToggle)?.setOnClickListener {
            if (secondsLeft <= 0) secondsLeft = totalSeconds
            running = !running
            if (running) {
                handler.removeCallbacks(ticker)
                handler.postDelayed(ticker, 1_000L)
            }
            timerStartButton.text =
                getString(if (running) R.string.timer_pause else R.string.timer_start)
            renderTimer()
        }
        dialog.findViewById<MaterialButton>(R.id.focusDialogComplete)?.setOnClickListener {
            completeFocusEarly()
            dialog.dismiss()
        }
        dialog.findViewById<MaterialButton>(R.id.focusDialogExit)?.setOnClickListener {
            dialog.dismiss()
        }
        dialog.setOnDismissListener { focusDialog = null }
        focusDialog = dialog
        renderTimer()
        dialog.show()
    }

    // ---------------------------------------------------------------- urge reset
    private fun toggleUrgePanel() {
        if (urgePanel.visibility == View.VISIBLE) {
            closeUrgePanel()
        } else {
            openUrgePanel(reset = true)
        }
    }

    /** Shows the grounding countdown, resuming a restored countdown when reset is false. */
    private fun openUrgePanel(reset: Boolean) {
        if (reset) urgeSecondsLeft = URGE_SECONDS
        urgePanel.visibility = View.VISIBLE
        renderUrgeCountdown()
        handler.removeCallbacks(urgeTicker)
        if (urgeSecondsLeft > 0) {
            urgeRunning = true
            handler.postDelayed(urgeTicker, 1_000L)
        }
    }

    private fun closeUrgePanel() {
        urgeRunning = false
        handler.removeCallbacks(urgeTicker)
        urgePanel.visibility = View.GONE
    }

    private fun renderUrgeCountdown() {
        urgeCountdown.text = String.format(
            Locale.US,
            "%02d:%02d",
            urgeSecondsLeft / 60,
            urgeSecondsLeft % 60
        )
    }

    private fun confirmResetStreak() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.reset_streak_title)
            .setMessage(R.string.reset_streak_message)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.confirm_reset) { _, _ ->
                repo.resetCleanStreak()
                toast(getString(R.string.reset_streak_done))
                renderOverview()
                renderCharts()
            }
            .show()
    }

    // ------------------------------------------------------------------ dialogs
    private fun showGoalDialog() {
        val view = layoutInflater.inflate(R.layout.dialog_goal, null)
        val titleInput = view.findViewById<EditText>(R.id.goalTitleInput)
        val categorySpinner = view.findViewById<Spinner>(R.id.goalCategory)
        val targetButton = view.findViewById<MaterialButton>(R.id.goalTargetButton)
        val whyInput = view.findViewById<EditText>(R.id.goalWhyInput)
        val milestonesInput = view.findViewById<EditText>(R.id.goalMilestonesInput)

        var targetDate = formatDate(offsetDate(30))
        targetButton.text = getString(R.string.goal_target_fmt, targetDate)
        targetButton.setOnClickListener {
            val calendar = Calendar.getInstance()
            DatePickerDialog(this, { _, year, month, day ->
                val picked = Calendar.getInstance().apply {
                    set(year, month, day)
                }
                targetDate = formatDate(picked.time)
                targetButton.text = getString(R.string.goal_target_fmt, targetDate)
            }, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH))
                .show()
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.create_goal)
            .setView(view)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.save) { _, _ ->
                if (titleInput.text.isBlank()) {
                    toast(getString(R.string.goal_title_required))
                    return@setPositiveButton
                }
                val category = GoalCategories.ALL.getOrElse(categorySpinner.selectedItemPosition) {
                    GoalCategories.RECOVERY
                }
                repo.addGoal(
                    titleInput.text.toString(),
                    category,
                    targetDate,
                    whyInput.text.toString(),
                    milestonesInput.text.toString().split("\n")
                )
                renderGoals()
                renderOverview()
            }
            .show()
    }

    private fun showNoteDialog(existing: Note?) {
        val view = layoutInflater.inflate(R.layout.dialog_note, null)
        val titleInput = view.findViewById<EditText>(R.id.noteTitleInput)
        val notebookSpinner = view.findViewById<Spinner>(R.id.noteNotebookInput)
        val bodyInput = view.findViewById<EditText>(R.id.noteBodyInput)

        if (existing != null) {
            titleInput.setText(existing.title)
            bodyInput.setText(existing.body)
            Notebooks.ALL.indexOf(existing.notebook).takeIf { it >= 0 }?.let {
                notebookSpinner.setSelection(it)
            }
        } else if (noteNotebookFilter.isNotBlank()) {
            Notebooks.ALL.indexOf(noteNotebookFilter).takeIf { it >= 0 }?.let {
                notebookSpinner.setSelection(it)
            }
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(if (existing == null) R.string.new_note_title else R.string.edit_note_title)
            .setView(view)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.save) { _, _ ->
                val notebook = Notebooks.ALL.getOrElse(notebookSpinner.selectedItemPosition) {
                    Notebooks.DIARY
                }
                if (existing == null) {
                    repo.addNote(
                        titleInput.text.toString(),
                        bodyInput.text.toString(),
                        notebook,
                        getString(R.string.note_untitled)
                    )
                } else {
                    repo.updateNote(
                        existing.id,
                        titleInput.text.toString(),
                        bodyInput.text.toString(),
                        notebook,
                        existing.pinned,
                        getString(R.string.note_untitled)
                    )
                }
                renderNotes()
                renderOverview()
            }
            .show()
    }

    // ------------------------------------------------------------------ helpers
    private fun strike(view: TextView, done: Boolean) {
        view.paintFlags = if (done) {
            view.paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
        } else {
            view.paintFlags and Paint.STRIKE_THRU_TEXT_FLAG.inv()
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun dayLabel(day: Long): String =
        SimpleDateFormat("MM-dd", Locale.US).format(epochDayToDate(day))

    private fun dayOfMonth(day: Long): Int {
        val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        calendar.timeInMillis = day * 86_400_000L
        return calendar.get(Calendar.DAY_OF_MONTH)
    }

    private fun epochDayToDate(day: Long): Date {
        val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        calendar.timeInMillis = day * 86_400_000L
        return calendar.time
    }

    private fun offsetDate(days: Int): Date =
        Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, days) }.time

    private fun formatDate(date: Date): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)

    private fun lastCleanDayText(): String {
        if (prefs.lastCleanDay == 0L) return getString(R.string.clean_never)
        return getString(
            if (prefs.lastCleanDay == prefs.today()) R.string.clean_today else R.string.clean_earlier
        )
    }

    companion object {
        private const val STATE_TOTAL = "si_total_seconds"
        private const val STATE_LEFT = "si_seconds_left"
        private const val STATE_RUNNING = "si_running"
        private const val STATE_URGE_LEFT = "si_urge_left"
        private const val STATE_URGE_OPEN = "si_urge_open"
        private const val STATE_SECTION = "si_section"
        private const val URGE_SECONDS = 60
    }
}
