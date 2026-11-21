package com.kiosk.launcher.ui

import android.graphics.Paint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.checkbox.MaterialCheckBox
import com.google.android.material.chip.ChipGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.selfimprovement.SelfImprovementRepository
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

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

    private lateinit var habitsEmpty: View
    private lateinit var tasksEmpty: View
    private lateinit var goalsEmpty: View
    private lateinit var notesEmpty: View

    private lateinit var timerText: TextView
    private lateinit var timerBar: LinearProgressIndicator

    private var totalSeconds = 25 * 60
    private var secondsLeft = 25 * 60
    private var running = false

    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            if (!running) return
            secondsLeft -= 1
            if (secondsLeft <= 0) {
                secondsLeft = 0
                running = false
                toast("Focus session complete")
            }
            renderTimer()
            if (running) handler.postDelayed(this, 1_000L)
        }
    }

    private val dateFormat = SimpleDateFormat("d MMM", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_self_improvement)

        prefs = KioskPreferences(this)
        repo = SelfImprovementRepository(this)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
        toolbar.setNavigationOnClickListener { finish() }

        overviewSection = findViewById(R.id.overviewSection)
        habitsSection = findViewById(R.id.habitsSection)
        tasksSection = findViewById(R.id.tasksSection)
        goalsSection = findViewById(R.id.goalsSection)
        notesSection = findViewById(R.id.notesSection)

        habitsContainer = findViewById(R.id.habitsContainer)
        tasksContainer = findViewById(R.id.tasksContainer)
        goalsContainer = findViewById(R.id.goalsContainer)
        notesContainer = findViewById(R.id.notesContainer)

        habitsEmpty = findViewById(R.id.habitsEmpty)
        tasksEmpty = findViewById(R.id.tasksEmpty)
        goalsEmpty = findViewById(R.id.goalsEmpty)
        notesEmpty = findViewById(R.id.notesEmpty)

        timerText = findViewById(R.id.timerText)
        timerBar = findViewById(R.id.timerBar)

        val chips = findViewById<ChipGroup>(R.id.sectionChips)
        chips.setOnCheckedStateChangeListener { _, checkedIds ->
            showSection(checkedIds.firstOrNull() ?: R.id.chipOverview)
        }

        findViewById<View>(R.id.timerStart).setOnClickListener {
            if (secondsLeft <= 0) secondsLeft = totalSeconds
            if (!running) {
                running = true
                handler.removeCallbacks(ticker)
                handler.postDelayed(ticker, 1_000L)
            }
        }
        findViewById<View>(R.id.timerPause).setOnClickListener { running = false }
        findViewById<View>(R.id.timerReset).setOnClickListener {
            running = false
            secondsLeft = totalSeconds
            renderTimer()
        }
        findViewById<View>(R.id.siMarkClean).setOnClickListener {
            if (prefs.markTodayClean()) toast("Clean day logged") else toast("Already logged today")
            renderOverview()
        }

        findViewById<View>(R.id.habitAdd).setOnClickListener {
            val input = findViewById<EditText>(R.id.habitInput)
            repo.addHabit(input.text.toString())
            input.setText("")
            renderHabits()
            renderOverview()
        }
        findViewById<View>(R.id.taskAdd).setOnClickListener {
            val input = findViewById<EditText>(R.id.taskInput)
            repo.addTask(input.text.toString())
            input.setText("")
            renderTasks()
            renderOverview()
        }
        findViewById<View>(R.id.goalAdd).setOnClickListener {
            val input = findViewById<EditText>(R.id.goalInput)
            repo.addGoal(input.text.toString())
            input.setText("")
            renderGoals()
            renderOverview()
        }
        findViewById<View>(R.id.noteAdd).setOnClickListener { addNote() }

        showSection(R.id.chipOverview)
        renderAll()
    }

    override fun onDestroy() {
        handler.removeCallbacks(ticker)
        super.onDestroy()
    }

    // --------------------------------------------------------------------- render
    private fun renderAll() {
        renderOverview()
        renderHabits()
        renderTasks()
        renderGoals()
        renderNotes()
    }

    private fun renderOverview() {
        val habits = repo.habits()
        val done = habits.count { it.doneDay == repo.today() }

        findViewById<TextView>(R.id.siStreakValue).text = prefs.streak.toString()
        findViewById<TextView>(R.id.siStreakMeta).text =
            "Best ${prefs.bestStreak}d · ${prefs.lastCleanDayText()}"

        val affirmation = affirmations[(repo.today() % affirmations.size).toInt()]
        findViewById<TextView>(R.id.affirmationText).text = affirmation

        findViewById<TextView>(R.id.statHabits).text = "$done/${habits.size}"
        findViewById<TextView>(R.id.statTasks).text = repo.openTasks().toString()
        findViewById<TextView>(R.id.statGoals).text = "${repo.goalProgress()}%"

        renderTimer()
    }

    private fun renderTimer() {
        val minutes = secondsLeft / 60
        val seconds = secondsLeft % 60
        timerText.text = String.format(Locale.US, "%02d:%02d", minutes, seconds)
        timerBar.progress = ((totalSeconds - secondsLeft) * 100 / totalSeconds)
    }

    private fun renderHabits() {
        habitsContainer.removeAllViews()
        val habits = repo.habits()
        habitsEmpty.visibility = if (habits.isEmpty()) View.VISIBLE else View.GONE
        val today = repo.today()

        habits.forEach { habit ->
            val row = layoutInflater.inflate(R.layout.item_check_row, habitsContainer, false)
            val check = row.findViewById<MaterialCheckBox>(R.id.rowCheck)
            val title = row.findViewById<TextView>(R.id.rowTitle)
            val done = habit.doneDay == today

            title.text = habit.title
            check.isChecked = done
            strike(title, done)

            check.setOnCheckedChangeListener { _, checked ->
                repo.setHabitDone(habit.id, checked)
                strike(title, checked)
                renderOverview()
            }
            row.findViewById<View>(R.id.rowDelete).setOnClickListener {
                repo.removeHabit(habit.id)
                renderHabits()
                renderOverview()
            }
            habitsContainer.addView(row)
        }
    }

    private fun renderTasks() {
        tasksContainer.removeAllViews()
        val tasks = repo.tasks()
        tasksEmpty.visibility = if (tasks.isEmpty()) View.VISIBLE else View.GONE

        tasks.forEach { task ->
            val row = layoutInflater.inflate(R.layout.item_check_row, tasksContainer, false)
            val check = row.findViewById<MaterialCheckBox>(R.id.rowCheck)
            val title = row.findViewById<TextView>(R.id.rowTitle)

            title.text = task.title
            check.isChecked = task.done
            strike(title, task.done)

            check.setOnCheckedChangeListener { _, checked ->
                repo.setTaskDone(task.id, checked)
                strike(title, checked)
                renderOverview()
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
            val row = layoutInflater.inflate(R.layout.item_goal_row, goalsContainer, false)
            row.findViewById<TextView>(R.id.goalTitle).text = goal.title
            row.findViewById<TextView>(R.id.goalPercent).text = "${goal.progress}%"
            row.findViewById<LinearProgressIndicator>(R.id.goalProgress).progress = goal.progress

            row.findViewById<View>(R.id.goalStep).setOnClickListener {
                repo.stepGoal(goal.id, 10)
                renderGoals()
                renderOverview()
            }
            row.findViewById<View>(R.id.goalDelete).setOnClickListener {
                repo.removeGoal(goal.id)
                renderGoals()
                renderOverview()
            }
            goalsContainer.addView(row)
        }
    }

    private fun renderNotes() {
        notesContainer.removeAllViews()
        val notes = repo.notes()
        notesEmpty.visibility = if (notes.isEmpty()) View.VISIBLE else View.GONE

        notes.forEach { note ->
            val row = layoutInflater.inflate(R.layout.item_note_row, notesContainer, false)
            row.findViewById<TextView>(R.id.noteTitle).text = note.title
            row.findViewById<TextView>(R.id.noteBody).text = note.body
            row.findViewById<TextView>(R.id.noteDate).text = dateFormat.format(Date(note.created))
            row.findViewById<View>(R.id.noteDelete).setOnClickListener {
                repo.removeNote(note.id)
                renderNotes()
            }
            notesContainer.addView(row)
        }
    }

    // -------------------------------------------------------------------- helpers
    private fun showSection(chipId: Int) {
        overviewSection.visibility = if (chipId == R.id.chipOverview) View.VISIBLE else View.GONE
        habitsSection.visibility = if (chipId == R.id.chipHabits) View.VISIBLE else View.GONE
        tasksSection.visibility = if (chipId == R.id.chipTasks) View.VISIBLE else View.GONE
        goalsSection.visibility = if (chipId == R.id.chipGoals) View.VISIBLE else View.GONE
        notesSection.visibility = if (chipId == R.id.chipNotes) View.VISIBLE else View.GONE
    }

    private fun addNote() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(8), dp(24), 0)
        }
        val title = EditText(this).apply {
            hint = "Title"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        val body = EditText(this).apply {
            hint = "Note"
            minLines = 3
            gravity = Gravity.TOP
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        }
        container.addView(title)
        container.addView(body)

        MaterialAlertDialogBuilder(this)
            .setTitle("New note")
            .setView(container)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                repo.addNote(title.text.toString(), body.text.toString())
                renderNotes()
            }
            .show()
    }

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

    private fun KioskPreferences.lastCleanDayText(): String {
        if (lastCleanDay == 0L) return "no clean day logged yet"
        return if (lastCleanDay == today()) "logged today" else "last logged earlier"
    }

    companion object {
        private val affirmations = listOf(
            "My attention belongs to my real-world goals, not to an algorithm.",
            "I choose the quiet rep over the cheap spike.",
            "Every clean day is a vote for the person I am becoming.",
            "Boredom is a doorway, not an emergency.",
            "I keep my promises to myself, especially the small ones.",
            "The phone is a tool. I decide when it is used."
        )
    }
}
