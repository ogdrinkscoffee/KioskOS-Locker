package com.kiosk.launcher.ui

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ClipDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Space
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.AppPasswordPolicy
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.data.LockScreenConfig
import com.kiosk.launcher.data.LockScreenConfig.LockAccent
import com.kiosk.launcher.data.LockScreenConfig.LockCardStyle
import com.kiosk.launcher.data.LockScreenConfig.LockClockStyle
import com.kiosk.launcher.data.LockScreenConfig.LockCornerStyle
import com.kiosk.launcher.data.LockScreenConfig.LockTheme
import com.kiosk.launcher.data.LockScreenConfig.LockWidgetSize
import com.kiosk.launcher.data.LockScreenConfig.LockWidgetSlot
import com.kiosk.launcher.data.LockScreenConfig.LockWidgetType
import com.kiosk.launcher.data.LockScreenShortcuts
import com.kiosk.launcher.schedule.KioskSchedule
import com.kiosk.launcher.schedule.ScheduleParse
import com.kiosk.launcher.selfimprovement.SelfImprovementRepository
import com.kiosk.launcher.selfimprovement.TaskFilters
import com.kiosk.launcher.selfimprovement.TaskPriorities
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

class KioskLockScreenActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var policy: DevicePolicyHelper
    private lateinit var apps: InstalledAppsRepository
    private lateinit var focus: SelfImprovementRepository

    private lateinit var lockRoot: View
    private lateinit var lockGlowTop: View
    private lateinit var lockGlowBottom: View
    private lateinit var lockContent: View
    private lateinit var lockStatusPillContainer: View
    private lateinit var lockStatusDot: View
    private lateinit var lockStatusPill: TextView
    private lateinit var lockCustomizeButton: ImageButton
    private lateinit var lockClockSection: LinearLayout
    private lateinit var lockClock: TextView
    private lateinit var lockClockStacked: View
    private lateinit var lockClockHours: TextView
    private lateinit var lockClockMinutes: TextView
    private lateinit var lockDate: TextView
    private lateinit var lockSecondsTag: TextView
    private lateinit var lockWidgetsContainer: LinearLayout
    private lateinit var quickDockSection: View
    private lateinit var quickAppsGrid: RecyclerView
    private lateinit var unlockButton: MaterialButton

    private lateinit var quickAdapter: LockQuickAppAdapter
    private var timeReceiver: BroadcastReceiver? = null
    private var batteryReceiver: BroadcastReceiver? = null
    private var latestBatteryIntent: Intent? = null
    private var isPreviewMode = false
    private var unlocking = false

    private var swipeDownY = 0f
    private var swipeDownX = 0f
    private var swipeDragging = false
    private var swipeThresholdPx = 0f
    private var swipeStartSlopPx = 0f

    private val handler = Handler(Looper.getMainLooper())
    private val secondTick = object : Runnable {
        override fun run() {
            if (!isShowing || !prefs.lockShowSeconds) return
            renderClock()
            handler.postDelayed(this, 1000L)
        }
    }

    private val time24Format = SimpleDateFormat("HH:mm", Locale.getDefault())
    private val time12Format = SimpleDateFormat("h:mm a", Locale.getDefault())
    private val hour24Format = SimpleDateFormat("HH", Locale.getDefault())
    private val hour12Format = SimpleDateFormat("hh", Locale.getDefault())
    private val minuteFormat = SimpleDateFormat("mm", Locale.getDefault())
    private val secondFormat = SimpleDateFormat(":ss", Locale.getDefault())
    private val dateFormat = SimpleDateFormat("EEEE, d MMMM", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = KioskPreferences(this)
        policy = DevicePolicyHelper(this)
        apps = InstalledAppsRepository(this)
        focus = SelfImprovementRepository(this)
        isPreviewMode = intent?.getBooleanExtra(EXTRA_PREVIEW, false) == true

        if (!isPreviewMode && (!prefs.customLockScreenEnabled || prefs.isAdminTemporarilyUnlocked() || !prefs.isKioskActiveNow())) {
            finish()
            return
        }

        configureLockWindow()
        setContentView(R.layout.activity_kiosk_lock_screen)
        setupInsetsAndSystemBars()

        lockRoot = findViewById(R.id.lockRoot)
        lockGlowTop = findViewById(R.id.lockGlowTop)
        lockGlowBottom = findViewById(R.id.lockGlowBottom)
        lockContent = findViewById(R.id.lockContent)
        lockStatusPillContainer = findViewById(R.id.lockStatusPillContainer)
        lockStatusDot = findViewById(R.id.lockStatusDot)
        lockStatusPill = findViewById(R.id.lockStatusPill)
        lockCustomizeButton = findViewById(R.id.lockCustomizeButton)
        lockClockSection = findViewById(R.id.lockClockSection)
        lockClock = findViewById(R.id.lockClock)
        lockClockStacked = findViewById(R.id.lockClockStacked)
        lockClockHours = findViewById(R.id.lockClockHours)
        lockClockMinutes = findViewById(R.id.lockClockMinutes)
        lockDate = findViewById(R.id.lockDate)
        lockSecondsTag = findViewById(R.id.lockSecondsTag)
        lockWidgetsContainer = findViewById(R.id.lockWidgetsContainer)
        quickDockSection = findViewById(R.id.quickDockSection)
        quickAppsGrid = findViewById(R.id.quickAppsGrid)
        unlockButton = findViewById(R.id.unlockButton)

        swipeThresholdPx = dp(76).toFloat()
        swipeStartSlopPx = dp(20).toFloat()

        quickAdapter = LockQuickAppAdapter(
            isProtected = { pkg -> AppPasswordPolicy.requiresPassword(pkg, prefs.passwordProtectedPackages()) },
            cardBackgroundProvider = { buildCardDrawable() },
            onClick = { onQuickLaunchTap(it) }
        )
        quickAppsGrid.layoutManager = LinearLayoutManager(this, RecyclerView.HORIZONTAL, false)
        quickAppsGrid.adapter = quickAdapter

        unlockButton.setOnClickListener {
            unlockToLauncher()
        }

        lockCustomizeButton.setOnClickListener {
            openCustomizer()
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isPreviewMode) finish()
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        isPreviewMode = intent.getBooleanExtra(EXTRA_PREVIEW, false)
    }

    override fun onStart() {
        super.onStart()
        isShowing = true
        registerReceivers()
    }

    override fun onResume() {
        super.onResume()
        if (!isPreviewMode && (!prefs.customLockScreenEnabled || prefs.isAdminTemporarilyUnlocked() || !prefs.isKioskActiveNow())) {
            finish()
            return
        }
        isShowing = true
        syncSystemBars()
        if (!isPreviewMode) {
            policy.setTemporaryStatusBarDisabled(true)
        }
        latestBatteryIntent = runCatching {
            registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        }.getOrNull()
        renderLockScreen()
        restartSecondTicker()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) syncSystemBars()
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(secondTick)
        if (!isPreviewMode) {
            policy.setTemporaryStatusBarDisabled(false)
        }
    }

    override fun onStop() {
        super.onStop()
        isShowing = false
        handler.removeCallbacks(secondTick)
        unregisterReceivers()
    }

    override fun onDestroy() {
        super.onDestroy()
        isShowing = false
        handler.removeCallbacks(secondTick)
        unregisterReceivers()
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (!::lockContent.isInitialized || unlocking) {
            return super.dispatchTouchEvent(ev)
        }
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swipeDownY = ev.rawY
                swipeDownX = ev.rawX
                swipeDragging = false
            }
            MotionEvent.ACTION_MOVE -> {
                val dy = ev.rawY - swipeDownY
                val dx = ev.rawX - swipeDownX
                if (!swipeDragging && dy < -swipeStartSlopPx && abs(dy) > abs(dx) * 1.35f) {
                    swipeDragging = true
                }
                if (swipeDragging) {
                    lockContent.translationY = dy.coerceAtMost(0f)
                    lockContent.alpha = (1f - (abs(dy) / (swipeThresholdPx * 2.2f))).coerceIn(0.35f, 1f)
                    return true
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (swipeDragging) {
                    val dy = ev.rawY - swipeDownY
                    swipeDragging = false
                    if (ev.actionMasked == MotionEvent.ACTION_UP && dy <= -swipeThresholdPx) {
                        unlockToLauncher()
                    } else {
                        lockContent.animate()
                            .translationY(0f)
                            .alpha(1f)
                            .setDuration(180L)
                            .start()
                    }
                    return true
                }
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    private fun openCustomizer() {
        val launchSheet = {
            LockScreenCustomizerSheet(this, prefs) {
                renderLockScreen()
                restartSecondTicker()
            }.show()
        }
        if (isPreviewMode) {
            launchSheet()
        } else {
            PinGate.prompt(this, getString(R.string.pin_title_admin)) {
                launchSheet()
            }
        }
    }

    private fun restartSecondTicker() {
        handler.removeCallbacks(secondTick)
        if (isShowing && prefs.lockShowSeconds) {
            handler.postDelayed(secondTick, 1000L)
        }
    }

    private fun configureLockWindow() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        if (prefs.keyguardDisabled && Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            @Suppress("DEPRECATION")
            window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun setupInsetsAndSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        syncSystemBars()
        val root = findViewById<View>(R.id.lockRoot)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
            view.setPadding(cutout.left, cutout.top, cutout.right, nav.bottom + cutout.bottom)
            insets
        }
    }

    private fun syncSystemBars() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun renderLockScreen() {
        applyVisualTheme()
        renderClock()
        renderWidgets()
        renderQuickLaunchDock()
    }

    private fun applyVisualTheme() {
        val theme = LockTheme.fromId(prefs.lockTheme)
        val accent = LockAccent.fromId(prefs.lockAccent)
        val panicActive = prefs.isPanicLocked()

        lockRoot.background = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(theme.startArgb, theme.centerArgb, theme.endArgb)
        )

        lockGlowTop.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            gradientType = GradientDrawable.RADIAL_GRADIENT
            gradientRadius = dp(170).toFloat()
            colors = intArrayOf(theme.glowTopArgb, Color.TRANSPARENT)
        }
        lockGlowBottom.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            gradientType = GradientDrawable.RADIAL_GRADIENT
            gradientRadius = dp(160).toFloat()
            colors = intArrayOf(theme.glowBottomArgb, Color.TRANSPARENT)
        }

        val dotColor = if (panicActive) 0xFFF87171.toInt() else accent.colorArgb
        lockStatusDot.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(dotColor)
        }
        lockStatusPill.setText(if (panicActive) R.string.lock_pill_panic else R.string.lock_pill_active)
        lockStatusPillContainer.background = GradientDrawable().apply {
            cornerRadius = dp(999).toFloat()
            setColor(0x1EFFFFFF)
            setStroke(dp(1), withAlpha(dotColor, 0x66))
        }

        lockCustomizeButton.visibility =
            if (prefs.lockShowCustomizeButton || isPreviewMode) View.VISIBLE else View.GONE
        lockCustomizeButton.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(0x1EFFFFFF)
            setStroke(dp(1), 0x3DFFFFFF)
        }

        unlockButton.backgroundTintList = ColorStateList.valueOf(withAlpha(accent.colorArgb, 0x26))
        unlockButton.strokeColor = ColorStateList.valueOf(withAlpha(accent.colorArgb, 0x70))
    }

    private fun renderClock() {
        val now = Date()
        val accent = LockAccent.fromId(prefs.lockAccent)
        val style = LockClockStyle.fromId(prefs.lockClockStyle)
        val use24 = prefs.lockClock24Hour
        val showSeconds = prefs.lockShowSeconds

        when (style) {
            LockClockStyle.STACKED -> {
                lockClockSection.gravity = Gravity.CENTER_HORIZONTAL
                lockClock.visibility = View.GONE
                lockClockStacked.visibility = View.VISIBLE
                lockClockHours.text = (if (use24) hour24Format else hour12Format).format(now)
                lockClockMinutes.text = minuteFormat.format(now)
                lockClockMinutes.setTextColor(accent.colorArgb)
            }
            LockClockStyle.BOLD -> {
                lockClockSection.gravity = Gravity.CENTER_HORIZONTAL
                lockClockStacked.visibility = View.GONE
                lockClock.visibility = View.VISIBLE
                lockClock.typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
                lockClock.textSize = 62f
                lockClock.letterSpacing = -0.04f
                lockClock.text = (if (use24) time24Format else time12Format).format(now)
            }
            LockClockStyle.COMPACT -> {
                lockClockSection.gravity = Gravity.START
                lockClockStacked.visibility = View.GONE
                lockClock.visibility = View.VISIBLE
                lockClock.typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
                lockClock.textSize = 46f
                lockClock.letterSpacing = -0.02f
                lockClock.text = (if (use24) time24Format else time12Format).format(now)
            }
            LockClockStyle.EDITORIAL -> {
                lockClockSection.gravity = Gravity.CENTER_HORIZONTAL
                lockClockStacked.visibility = View.GONE
                lockClock.visibility = View.VISIBLE
                lockClock.typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
                lockClock.textSize = 66f
                lockClock.letterSpacing = -0.03f
                lockClock.text = (if (use24) time24Format else time12Format).format(now)
            }
        }

        lockDate.text = dateFormat.format(now)
        if (showSeconds) {
            lockSecondsTag.visibility = View.VISIBLE
            lockSecondsTag.text = secondFormat.format(now)
            lockSecondsTag.setTextColor(accent.colorArgb)
        } else {
            lockSecondsTag.visibility = View.GONE
        }
    }

    private fun renderWidgets() {
        lockWidgetsContainer.removeAllViews()
        val slots = prefs.lockWidgetSlots()
        val rows = LockScreenConfig.buildWidgetRows(slots)
        if (rows.isEmpty()) return

        val accent = LockAccent.fromId(prefs.lockAccent)
        val inflater = LayoutInflater.from(this)

        rows.forEachIndexed { rowIndex, rowSlots ->
            val rowView = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                isBaselineAligned = false
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = if (rowIndex == 0) 0 else dp(10)
                }
            }

            if (rowSlots.size == 2) {
                rowSlots.forEachIndexed { colIndex, slot ->
                    val card = inflater.inflate(R.layout.item_lock_widget_card, rowView, false)
                    card.layoutParams = LinearLayout.LayoutParams(
                        0,
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        1f
                    ).apply {
                        if (colIndex == 1) marginStart = dp(10)
                    }
                    bindWidgetCard(card, slot, accent)
                    rowView.addView(card)
                }
            } else {
                val slot = rowSlots.first()
                val card = inflater.inflate(R.layout.item_lock_widget_card, rowView, false)
                if (slot.size.spanColumns == 1) {
                    // Single Small widget preserves its exact 50% width so Small size stays consistent.
                    card.layoutParams = LinearLayout.LayoutParams(
                        0,
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        1f
                    )
                    bindWidgetCard(card, slot, accent)
                    rowView.addView(card)
                    rowView.addView(Space(this).apply {
                        layoutParams = LinearLayout.LayoutParams(
                            0,
                            LinearLayout.LayoutParams.MATCH_PARENT,
                            1f
                        ).apply { marginStart = dp(10) }
                    })
                } else {
                    card.layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    )
                    bindWidgetCard(card, slot, accent)
                    rowView.addView(card)
                }
            }
            lockWidgetsContainer.addView(rowView)
        }
    }

    private fun bindWidgetCard(card: View, slot: LockWidgetSlot, accent: LockAccent) {
        val root = card.findViewById<LinearLayout>(R.id.widgetCardRoot)
        val icon = card.findViewById<ImageView>(R.id.widgetIcon)
        val title = card.findViewById<TextView>(R.id.widgetTitle)
        val badge = card.findViewById<TextView>(R.id.widgetBadge)
        val value = card.findViewById<TextView>(R.id.widgetValue)
        val detail = card.findViewById<TextView>(R.id.widgetDetail)
        val progress = card.findViewById<ProgressBar>(R.id.widgetProgress)
        val footer = card.findViewById<TextView>(R.id.widgetFooter)

        root.background = buildCardDrawable()
        root.minimumHeight = dp(slot.size.minHeightDp)
        val pad = dp(
            when (slot.size) {
                LockWidgetSize.SMALL -> 13
                LockWidgetSize.MEDIUM -> 14
                LockWidgetSize.LARGE -> 16
            }
        )
        root.setPadding(pad, pad, pad, pad)

        icon.setImageResource(LockScreenCustomizerSheet.widgetIconRes(slot.type))
        icon.imageTintList = ColorStateList.valueOf(accent.colorArgb)
        title.setText(LockScreenCustomizerSheet.widgetTitleRes(slot.type))

        value.textSize = when (slot.size) {
            LockWidgetSize.SMALL -> 16f
            LockWidgetSize.MEDIUM -> 18f
            LockWidgetSize.LARGE -> 21f
        }
        value.maxLines = when (slot.size) {
            LockWidgetSize.SMALL -> 1
            LockWidgetSize.MEDIUM -> if (slot.type == LockWidgetType.NOTE) 2 else 1
            LockWidgetSize.LARGE -> if (slot.type == LockWidgetType.NOTE) 4 else 2
        }
        detail.maxLines = when (slot.size) {
            LockWidgetSize.SMALL -> 1
            LockWidgetSize.MEDIUM -> 2
            LockWidgetSize.LARGE -> 3
        }

        badge.visibility = View.GONE
        progress.visibility = View.GONE
        footer.visibility = View.GONE

        fun showBadge(text: String, color: Int = accent.colorArgb) {
            badge.visibility = View.VISIBLE
            badge.text = text
            badge.setTextColor(color)
            badge.background = GradientDrawable().apply {
                cornerRadius = dp(999).toFloat()
                setColor(withAlpha(color, 0x26))
                setStroke(dp(1), withAlpha(color, 0x55))
            }
        }

        fun showProgress(percent: Int, color: Int = accent.colorArgb) {
            progress.visibility = View.VISIBLE
            progress.progress = percent.coerceIn(0, 100)
            styleProgressBar(progress, color)
        }

        fun showFooter(text: String) {
            if (text.isBlank()) return
            footer.visibility = View.VISIBLE
            footer.text = text
        }

        when (slot.type) {
            LockWidgetType.BATTERY -> bindBatteryWidget(slot.size, value, detail, ::showBadge, ::showProgress, ::showFooter)
            LockWidgetType.STREAK -> bindStreakWidget(slot.size, value, detail, ::showBadge, ::showProgress, ::showFooter)
            LockWidgetType.HABITS -> bindHabitsWidget(slot.size, value, detail, ::showBadge, ::showProgress, ::showFooter)
            LockWidgetType.TASKS -> bindTasksWidget(slot.size, value, detail, ::showBadge, ::showProgress, ::showFooter)
            LockWidgetType.FOCUS -> bindFocusWidget(slot.size, value, detail, ::showBadge, ::showProgress, ::showFooter)
            LockWidgetType.GOALS -> bindGoalsWidget(slot.size, value, detail, ::showBadge, ::showProgress, ::showFooter)
            LockWidgetType.SCHEDULE -> bindScheduleWidget(slot.size, value, detail, ::showBadge, ::showFooter)
            LockWidgetType.SHIELD -> bindShieldWidget(slot.size, value, detail, ::showBadge, ::showFooter)
            LockWidgetType.NOTE -> bindNoteWidget(slot.size, value, detail, ::showFooter)
        }

        root.setOnClickListener { view ->
            view.animate()
                .scaleX(0.97f)
                .scaleY(0.97f)
                .setDuration(75L)
                .withEndAction {
                    view.animate().scaleX(1f).scaleY(1f).setDuration(110L).start()
                }
                .start()
            if (isPreviewMode) {
                openCustomizer()
            }
        }
    }

    private fun bindBatteryWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showBadge: (String) -> Unit,
        showProgress: (Int) -> Unit,
        showFooter: (String) -> Unit
    ) {
        val info = readBatteryInfo(latestBatteryIntent)
        if (info.percent >= 0) {
            value.text = "${info.percent}%"
            detail.setText(if (info.charging) R.string.lock_battery_charging else R.string.lock_battery_discharging)
            showBadge(if (info.charging) getString(R.string.lock_badge_charging) else getString(R.string.lock_badge_ready))
            showProgress(info.percent)
            if (size == LockWidgetSize.LARGE) {
                val pluggedLabel = info.sourceLabel.ifBlank { getString(R.string.lock_battery_source_battery) }
                showFooter(getString(R.string.lock_battery_footer_fmt, pluggedLabel, info.tempC))
            }
        } else {
            value.setText(R.string.lock_battery_unknown)
            detail.setText(R.string.lock_battery_discharging)
        }
    }

    private fun bindStreakWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showBadge: (String) -> Unit,
        showProgress: (Int) -> Unit,
        showFooter: (String) -> Unit
    ) {
        val streak = prefs.streak
        val best = prefs.bestStreak
        val loggedToday = prefs.lastCleanDay == prefs.today()
        val urges = focus.urgeVictories
        value.text = getString(R.string.lock_widget_streak_value_fmt, streak)
        detail.text = getString(R.string.lock_widget_streak_best_urges_fmt, best, urges)
        showBadge(getString(if (loggedToday) R.string.lock_badge_logged else R.string.lock_badge_today))
        val nextMilestone = when {
            streak < 7 -> 7
            streak < 30 -> 30
            streak < 90 -> 90
            else -> 365
        }
        val pct = ((streak * 100f) / nextMilestone).toInt().coerceIn(0, 100)
        if (size != LockWidgetSize.SMALL) {
            showProgress(pct)
        }
        if (size == LockWidgetSize.LARGE) {
            showFooter(getString(R.string.lock_streak_milestone_fmt, streak, nextMilestone))
        }
    }

    private fun bindHabitsWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showBadge: (String) -> Unit,
        showProgress: (Int) -> Unit,
        showFooter: (String) -> Unit
    ) {
        val allHabits = focus.habits()
        val progress = focus.todayHabitProgress()
        val today = focus.today()
        val pct = if (progress.total > 0) (progress.completed * 100) / progress.total else 0

        if (progress.total == 0) {
            value.setText(R.string.lock_habits_none_value)
            detail.setText(R.string.lock_habits_none_detail)
            return
        }
        value.text = getString(R.string.lock_habits_value_fmt, progress.completed, progress.total)
        val pending = allHabits.filter { !it.days.contains(today) }
        detail.text = if (pending.isEmpty()) {
            getString(R.string.lock_habits_all_done)
        } else {
            getString(R.string.lock_habits_next_fmt, pending.first().title)
        }
        showBadge("$pct%")
        showProgress(pct)
        if (size == LockWidgetSize.LARGE && pending.size > 1) {
            showFooter(pending.drop(1).take(2).joinToString(" · ") { it.title })
        }
    }

    private fun bindTasksWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showBadge: (String) -> Unit,
        showProgress: (Int) -> Unit,
        showFooter: (String) -> Unit
    ) {
        val all = focus.tasks()
        val active = all.filter { !it.done }
        val completed = all.size - active.size
        val pct = if (all.isNotEmpty()) (completed * 100) / all.size else 0

        if (all.isEmpty()) {
            value.setText(R.string.lock_tasks_none_value)
            detail.setText(R.string.lock_tasks_none_detail)
            return
        }
        value.text = getString(R.string.lock_tasks_open_fmt, active.size)
        val prioritized = active.sortedBy {
            when (it.priority) {
                TaskPriorities.HIGH -> 0
                TaskPriorities.MEDIUM -> 1
                else -> 2
            }
        }
        val topTask = prioritized.firstOrNull()
        detail.text = if (topTask == null) {
            getString(R.string.lock_tasks_all_done)
        } else if (topTask.dueTime.isNotBlank()) {
            "${topTask.title} · ${topTask.dueTime}"
        } else {
            topTask.title
        }
        val highCount = active.count { it.priority == TaskPriorities.HIGH }
        if (highCount > 0) {
            showBadge(getString(R.string.lock_tasks_high_badge_fmt, highCount))
        } else {
            showBadge("$completed/${all.size}")
        }
        if (size != LockWidgetSize.SMALL) showProgress(pct)
        if (size == LockWidgetSize.LARGE && prioritized.size > 1) {
            showFooter(prioritized.drop(1).take(2).joinToString(" · ") { it.title })
        }
    }

    private fun bindFocusWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showBadge: (String) -> Unit,
        showProgress: (Int) -> Unit,
        showFooter: (String) -> Unit
    ) {
        val minutes = focus.todayFocusMinutes()
        val sessions = focus.todayFocusSessionsCount()
        val dailyTarget = 60
        val pct = ((minutes * 100f) / dailyTarget).toInt().coerceIn(0, 100)

        value.text = getString(R.string.lock_focus_minutes_fmt, minutes)
        detail.text = getString(R.string.lock_focus_sessions_fmt, sessions)
        showBadge("${pct}%")
        showProgress(pct)
        if (size == LockWidgetSize.LARGE) {
            showFooter(
                if (minutes >= dailyTarget) getString(R.string.lock_focus_goal_met)
                else getString(R.string.lock_focus_goal_remaining_fmt, dailyTarget - minutes)
            )
        }
    }

    private fun bindGoalsWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showBadge: (String) -> Unit,
        showProgress: (Int) -> Unit,
        showFooter: (String) -> Unit
    ) {
        val goals = focus.goals()
        val avgProgress = focus.goalProgress()
        if (goals.isEmpty()) {
            value.setText(R.string.lock_goals_none_value)
            detail.setText(R.string.lock_goals_none_detail)
            return
        }
        val topGoal = goals.first()
        value.text = topGoal.title
        val doneMilestones = topGoal.milestones.count { it.done }
        detail.text = if (topGoal.milestones.isNotEmpty()) {
            getString(R.string.lock_goals_milestones_fmt, doneMilestones, topGoal.milestones.size)
        } else {
            getString(R.string.lock_goals_count_fmt, goals.size)
        }
        showBadge("${topGoal.progressPercent}%")
        showProgress(if (topGoal.milestones.isNotEmpty()) topGoal.progressPercent else avgProgress)
        if (size == LockWidgetSize.LARGE && topGoal.targetDate.isNotBlank()) {
            showFooter(getString(R.string.goal_target_fmt, topGoal.targetDate))
        }
    }

    private fun bindScheduleWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showBadge: (String) -> Unit,
        showFooter: (String) -> Unit
    ) {
        val now = System.currentTimeMillis()
        if (!prefs.scheduleEnabled) {
            value.setText(R.string.lock_schedule_always_on)
            detail.text = getString(R.string.lock_schedule_apps_fmt, prefs.allowedPackagesNow(now).size)
            showBadge(getString(R.string.lock_badge_24_7))
            return
        }
        val active = prefs.isWithinKioskHours(now)
        value.setText(if (active) R.string.lock_schedule_kiosk_hours else R.string.lock_schedule_normal_hours)
        val parsed = prefs.scheduleWindowsParsed() as? ScheduleParse.Parsed
        val nextFlip = parsed?.let { KioskSchedule.nextChangeAt(it.windows, now) }
        detail.text = if (nextFlip != null) {
            val formatted = (if (prefs.lockClock24Hour) time24Format else time12Format).format(Date(nextFlip))
            getString(R.string.lock_schedule_next_flip_fmt, formatted)
        } else {
            getString(R.string.lock_schedule_no_flip)
        }
        showBadge(getString(if (active) R.string.lock_badge_active else R.string.lock_badge_paused))
        if (size == LockWidgetSize.LARGE) {
            showFooter(getString(R.string.lock_schedule_apps_fmt, prefs.allowedPackagesNow(now).size))
        }
    }

    private fun bindShieldWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showBadge: (String) -> Unit,
        showFooter: (String) -> Unit
    ) {
        val owner = policy.isDeviceOwner
        val warnings = prefs.tamperWarningsCount
        val protectedCount = prefs.passwordProtectedPackages().size
        value.setText(if (owner) R.string.lock_shield_enforced else R.string.lock_shield_preview)
        detail.text = getString(R.string.lock_shield_detail_fmt, protectedCount, warnings)
        showBadge(getString(if (owner) R.string.lock_badge_owner else R.string.lock_badge_preview))
        if (size == LockWidgetSize.LARGE) {
            val guardState = getString(
                if (prefs.guardEnabled) R.string.lock_shield_guard_on else R.string.lock_shield_guard_off
            )
            val browserState = getString(
                if (prefs.blockShortFormFeeds) R.string.lock_shield_feeds_blocked else R.string.lock_shield_feeds_open
            )
            showFooter("$guardState · $browserState")
        }
    }

    private fun bindNoteWidget(
        size: LockWidgetSize,
        value: TextView,
        detail: TextView,
        showFooter: (String) -> Unit
    ) {
        val customNote = prefs.lockScreenNote
        val why = focus.whyIStarted
        val content = customNote.ifBlank { why }.ifBlank { getString(R.string.lock_widget_note_default) }
        if (size == LockWidgetSize.SMALL) {
            value.text = content
            detail.setText(if (customNote.isNotBlank()) R.string.lock_note_label else R.string.lock_widget_note_title_card)
        } else {
            value.setText(if (customNote.isNotBlank()) R.string.lock_note_label else R.string.lock_widget_note_title_card)
            detail.text = content
            if (size == LockWidgetSize.LARGE && customNote.isNotBlank() && why.isNotBlank() && why != customNote) {
                showFooter(why)
            }
        }
    }

    private fun buildCardDrawable(): Drawable {
        val cardStyle = LockCardStyle.fromId(prefs.lockCardStyle)
        val cornerStyle = LockCornerStyle.fromId(prefs.lockCornerStyle)
        val accent = LockAccent.fromId(prefs.lockAccent)

        val fillColor = when (cardStyle) {
            LockCardStyle.TINTED -> withAlpha(accent.colorArgb, 0x22)
            LockCardStyle.SOLID -> 0xCC121A2A.toInt()
            LockCardStyle.OUTLINE -> 0x0AFFFFFF
            LockCardStyle.FROSTED -> 0x1DFFFFFF
        }
        val strokeColor = when (cardStyle) {
            LockCardStyle.TINTED -> withAlpha(accent.colorArgb, 0x66)
            LockCardStyle.SOLID -> 0x2BFFFFFF
            LockCardStyle.OUTLINE -> 0x55FFFFFF
            LockCardStyle.FROSTED -> 0x34FFFFFF
        }

        return GradientDrawable().apply {
            cornerRadius = dp(cornerStyle.radiusDp).toFloat()
            setColor(fillColor)
            setStroke(dp(1), strokeColor)
        }
    }

    private fun styleProgressBar(bar: ProgressBar, accentColor: Int) {
        val radius = dp(999).toFloat()
        val track = GradientDrawable().apply {
            cornerRadius = radius
            setColor(0x28FFFFFF)
        }
        val fill = GradientDrawable().apply {
            cornerRadius = radius
            setColor(accentColor)
        }
        val clip = ClipDrawable(fill, Gravity.START, ClipDrawable.HORIZONTAL)
        val layers = LayerDrawable(arrayOf(track, clip)).apply {
            setId(0, android.R.id.background)
            setId(1, android.R.id.progress)
        }
        bar.progressDrawable = layers
    }

    private data class BatteryInfo(
        val percent: Int,
        val charging: Boolean,
        val sourceLabel: String,
        val tempC: Int
    )

    private fun readBatteryInfo(intent: Intent?): BatteryInfo {
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val plugged = intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
        val tempTenths = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        val sourceLabel = when (plugged) {
            BatteryManager.BATTERY_PLUGGED_AC -> getString(R.string.lock_battery_source_ac)
            BatteryManager.BATTERY_PLUGGED_USB -> getString(R.string.lock_battery_source_usb)
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> getString(R.string.lock_battery_source_wireless)
            else -> getString(R.string.lock_battery_source_battery)
        }
        val percent = if (level >= 0 && scale > 0) {
            level * 100 / scale
        } else {
            val bm = getSystemService(BatteryManager::class.java)
            bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        }
        return BatteryInfo(
            percent = if (percent in 0..100) percent else -1,
            charging = charging,
            sourceLabel = sourceLabel,
            tempC = if (tempTenths > 0) tempTenths / 10 else 0
        )
    }

    private fun renderQuickLaunchDock() {
        val configured = prefs.lockScreenQuickApps()
        val filteredPackages = AppPasswordPolicy.filterQuickLaunchPackages(
            selectedPackages = configured,
            allowAllApps = prefs.allowAllApps,
            allowedPackages = prefs.allowedPackagesNow(),
            panicLocked = prefs.isPanicLocked(),
            callingPackages = policy.callingPackages()
        )
        if (filteredPackages.isEmpty()) {
            quickDockSection.visibility = View.GONE
            quickAdapter.submit(emptyList())
            return
        }
        apps.launchableAsync { installed ->
            if (isFinishing || isDestroyed) return@launchableAsync
            val byPkg = installed.associateBy { it.packageName }
            val resolvedPackages = LockScreenShortcuts.resolve(filteredPackages, byPkg.keys)
            val dockEntries = resolvedPackages.mapNotNull { byPkg[it] }
            if (dockEntries.isEmpty()) {
                quickDockSection.visibility = View.GONE
                quickAdapter.submit(emptyList())
            } else {
                quickDockSection.visibility = View.VISIBLE
                quickAdapter.submit(dockEntries)
            }
        }
    }

    private fun onQuickLaunchTap(entry: AppEntry) {
        if (prefs.isPanicLocked()) {
            Toast.makeText(this, R.string.panic_app_blocked, Toast.LENGTH_SHORT).show()
            return
        }
        if (!prefs.isAllowed(entry.packageName)) {
            Toast.makeText(this, getString(R.string.app_not_allowed_fmt, entry.label), Toast.LENGTH_SHORT).show()
            return
        }
        if (AppPasswordPolicy.requiresPassword(entry.packageName, prefs.passwordProtectedPackages())) {
            PinGate.promptAppPassword(this, entry.label) {
                unlockAndLaunch(entry)
            }
            return
        }
        unlockAndLaunch(entry)
    }

    private fun unlockToLauncher() {
        if (unlocking) return
        unlocking = true
        prefs.lockScreenPending = false
        dismissSystemKeyguardIfPossible()
        if (!isPreviewMode) {
            policy.setTemporaryStatusBarDisabled(false)
            startActivity(
                Intent(this, KioskLauncherActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            )
        }
        finish()
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
    }

    private fun unlockAndLaunch(entry: AppEntry) {
        if (unlocking) return
        unlocking = true
        prefs.lockScreenPending = false
        dismissSystemKeyguardIfPossible()
        if (!isPreviewMode) {
            policy.setTemporaryStatusBarDisabled(false)
        }
        if (!apps.launch(entry.packageName)) {
            unlocking = false
            Toast.makeText(this, getString(R.string.cannot_open_app_fmt, entry.label), Toast.LENGTH_SHORT).show()
            return
        }
        finish()
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
    }

    private fun dismissSystemKeyguardIfPossible() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val km = getSystemService(KeyguardManager::class.java)
            if (km != null && km.isKeyguardLocked) {
                runCatching { km.requestDismissKeyguard(this, null) }
            }
        }
    }

    private fun registerReceivers() {
        if (timeReceiver == null) {
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    renderClock()
                }
            }
            timeReceiver = receiver
            runCatching {
                ContextCompat.registerReceiver(
                    this,
                    receiver,
                    IntentFilter(Intent.ACTION_TIME_TICK),
                    ContextCompat.RECEIVER_EXPORTED
                )
            }
        }

        if (batteryReceiver == null) {
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    latestBatteryIntent = intent
                    renderWidgets()
                }
            }
            batteryReceiver = receiver
            runCatching {
                ContextCompat.registerReceiver(
                    this,
                    receiver,
                    IntentFilter(Intent.ACTION_BATTERY_CHANGED),
                    ContextCompat.RECEIVER_EXPORTED
                )
            }
        }
    }

    private fun unregisterReceivers() {
        timeReceiver?.let { receiver -> runCatching { unregisterReceiver(receiver) } }
        timeReceiver = null
        batteryReceiver?.let { receiver -> runCatching { unregisterReceiver(receiver) } }
        batteryReceiver = null
    }

    private fun withAlpha(color: Int, alphaByte: Int): Int =
        (color and 0x00FFFFFF) or ((alphaByte and 0xFF) shl 24)

    companion object {
        const val EXTRA_PREVIEW = "preview"

        @Volatile
        var isShowing: Boolean = false
            private set

        fun launch(context: Context, preview: Boolean = false) {
            val intent = Intent(context, KioskLockScreenActivity::class.java)
                .addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
                .putExtra(EXTRA_PREVIEW, preview)
            runCatching { context.startActivity(intent) }
        }
    }
}
