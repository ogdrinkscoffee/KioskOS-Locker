package com.kiosk.launcher.ui

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
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
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.AppPasswordPolicy
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.data.LockScreenShortcuts
import com.kiosk.launcher.selfimprovement.SelfImprovementRepository
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

class KioskLockScreenActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var policy: DevicePolicyHelper
    private lateinit var apps: InstalledAppsRepository
    private lateinit var focus: SelfImprovementRepository

    private lateinit var lockContent: View
    private lateinit var lockStatusPill: TextView
    private lateinit var lockClock: TextView
    private lateinit var lockDate: TextView
    private lateinit var lockTopWidgetsRow: View
    private lateinit var batteryWidgetCard: View
    private lateinit var lockBatteryValue: TextView
    private lateinit var statsWidgetCard: View
    private lateinit var lockStreakValue: TextView
    private lateinit var lockStatsDetail: TextView
    private lateinit var noteWidgetCard: View
    private lateinit var lockNoteText: TextView
    private lateinit var quickDockSection: View
    private lateinit var quickAppsGrid: RecyclerView

    private lateinit var quickAdapter: LockQuickAppAdapter
    private var timeReceiver: BroadcastReceiver? = null
    private var batteryReceiver: BroadcastReceiver? = null
    private var isPreviewMode = false
    private var unlocking = false

    private var swipeDownY = 0f
    private var swipeDownX = 0f
    private var swipeDragging = false
    private var swipeThresholdPx = 0f
    private var swipeStartSlopPx = 0f

    private val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
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

        lockContent = findViewById(R.id.lockContent)
        lockStatusPill = findViewById(R.id.lockStatusPill)
        lockClock = findViewById(R.id.lockClock)
        lockDate = findViewById(R.id.lockDate)
        lockTopWidgetsRow = findViewById(R.id.lockTopWidgetsRow)
        batteryWidgetCard = findViewById(R.id.batteryWidgetCard)
        lockBatteryValue = findViewById(R.id.lockBatteryValue)
        statsWidgetCard = findViewById(R.id.statsWidgetCard)
        lockStreakValue = findViewById(R.id.lockStreakValue)
        lockStatsDetail = findViewById(R.id.lockStatsDetail)
        noteWidgetCard = findViewById(R.id.noteWidgetCard)
        lockNoteText = findViewById(R.id.lockNoteText)
        quickDockSection = findViewById(R.id.quickDockSection)
        quickAppsGrid = findViewById(R.id.quickAppsGrid)

        swipeThresholdPx = dp(76).toFloat()
        swipeStartSlopPx = dp(20).toFloat()

        quickAdapter = LockQuickAppAdapter(
            isProtected = { pkg -> AppPasswordPolicy.requiresPassword(pkg, prefs.passwordProtectedPackages()) },
            onClick = { onQuickLaunchTap(it) }
        )
        quickAppsGrid.layoutManager = LinearLayoutManager(this, RecyclerView.HORIZONTAL, false)
        quickAppsGrid.adapter = quickAdapter

        findViewById<View>(R.id.unlockButton).setOnClickListener {
            unlockToLauncher()
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
        renderLockScreen()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) syncSystemBars()
    }

    override fun onPause() {
        super.onPause()
        if (!isPreviewMode) {
            policy.setTemporaryStatusBarDisabled(false)
        }
    }

    override fun onStop() {
        super.onStop()
        isShowing = false
        unregisterReceivers()
    }

    override fun onDestroy() {
        super.onDestroy()
        isShowing = false
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
        val panicActive = prefs.isPanicLocked()
        lockStatusPill.setText(if (panicActive) R.string.lock_pill_panic else R.string.lock_pill_active)
        renderClock()
        renderBatteryFromIntent(
            runCatching { registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) }.getOrNull()
        )
        renderWidgets()
        renderQuickLaunchDock()
    }

    private fun renderClock() {
        val now = Date()
        lockClock.text = timeFormat.format(now)
        lockDate.text = dateFormat.format(now)
    }

    private fun renderBatteryFromIntent(intent: Intent?) {
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        if (level >= 0 && scale > 0) {
            val pct = level * 100 / scale
            lockBatteryValue.text = getString(
                if (charging) R.string.lock_battery_charging_fmt else R.string.lock_battery_unplugged_fmt,
                pct
            )
            return
        }
        val bm = getSystemService(BatteryManager::class.java)
        val capacity = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        if (capacity in 0..100) {
            lockBatteryValue.text = getString(R.string.lock_battery_unplugged_fmt, capacity)
        } else {
            lockBatteryValue.setText(R.string.lock_battery_unknown)
        }
    }

    private fun renderWidgets() {
        val showBattery = prefs.lockWidgetBattery
        val showStats = prefs.lockWidgetStats
        val showNote = prefs.lockWidgetNote

        batteryWidgetCard.visibility = if (showBattery) View.VISIBLE else View.GONE
        statsWidgetCard.visibility = if (showStats) View.VISIBLE else View.GONE
        (statsWidgetCard.layoutParams as? LinearLayout.LayoutParams)?.let { params ->
            params.marginStart = if (showBattery) dp(10) else 0
            statsWidgetCard.layoutParams = params
        }
        lockTopWidgetsRow.visibility = if (showBattery || showStats) View.VISIBLE else View.GONE

        if (showStats) {
            val habits = focus.todayHabitProgress()
            val focusMinutes = focus.todayFocusMinutes()
            lockStreakValue.text = getString(R.string.lock_widget_streak_value_fmt, prefs.streak)
            lockStatsDetail.text = getString(
                R.string.lock_widget_streak_detail_fmt,
                habits.completed,
                habits.total,
                focusMinutes
            )
        }

        noteWidgetCard.visibility = if (showNote) View.VISIBLE else View.GONE
        if (showNote) {
            val noteText = prefs.lockScreenNote.ifBlank { focus.whyIStarted }
                .ifBlank { getString(R.string.lock_widget_note_default) }
            lockNoteText.text = noteText
        }
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
                    renderBatteryFromIntent(intent)
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
