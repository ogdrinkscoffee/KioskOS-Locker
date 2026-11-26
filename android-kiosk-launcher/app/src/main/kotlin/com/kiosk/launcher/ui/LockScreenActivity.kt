package com.kiosk.launcher.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.data.LockScreenShortcuts
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs

/**
 * Full-screen replacement for the Android lock screen: clock, date, a modular widget
 * area, an admin-picked quick-launch dock and a swipe-up unlock.
 *
 * Double-locking is avoided by the Admin toggle landing on
 * `DevicePolicyManager.setKeyguardDisabled`; the window flags below only make this surface
 * appear over a keyguard Android refused to disable (a device with a lock password).
 */
class LockScreenActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var apps: InstalledAppsRepository

    private lateinit var clock: TextView
    private lateinit var dateLabel: TextView
    private lateinit var batteryValue: TextView
    private lateinit var batteryDetail: TextView
    private lateinit var noteWidget: View
    private lateinit var noteValue: TextView
    private lateinit var quickLaunchLabel: TextView
    private lateinit var quickLaunchScroll: View
    private lateinit var quickLaunchRow: LinearLayout

    private val handler = Handler(Looper.getMainLooper())
    private var batteryReceiver: BroadcastReceiver? = null

    /** Bumped per scan so a slow, stale result cannot repaint the dock. */
    private var appsRequest = 0
    private var loadedShortcuts: List<AppEntry> = emptyList()

    /**
     * Admin's "Preview lock screen" button may open this on an install that is not a
     * kiosk yet. The activity is not exported, so the extra is not reachable from outside
     * the app and never bypasses the kiosk check for real screen wakes.
     */
    private var preview = false

    /** False when the activity finished in onCreate; lifecycle callbacks must not touch views. */
    private var uiReady = false

    private val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    private val dateFormat = SimpleDateFormat("EEEE, d MMMM", Locale.getDefault())

    private val clockTick = object : Runnable {
        override fun run() {
            renderClock()
            scheduleClock()
        }
    }

    private val gestures: GestureDetector by lazy {
        GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent): Boolean = true

            override fun onFling(
                e1: MotionEvent?,
                e2: MotionEvent,
                velocityX: Float,
                velocityY: Float
            ): Boolean {
                val start = e1 ?: return false
                val travelledUp = start.y - e2.y
                if (travelledUp < dp(72) || abs(velocityY) < 280f) return false
                unlock()
                return true
            }
        })
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = KioskPreferences(this)
        apps = InstalledAppsRepository(this)
        preview = intent?.getBooleanExtra(EXTRA_PREVIEW, false) == true
        if (!shouldLock()) {
            finish()
            return
        }

        setContentView(R.layout.activity_lock_screen)
        clock = findViewById(R.id.lockClock)
        dateLabel = findViewById(R.id.lockDate)
        batteryValue = findViewById(R.id.batteryValue)
        batteryDetail = findViewById(R.id.batteryDetail)
        noteWidget = findViewById(R.id.noteWidget)
        noteValue = findViewById(R.id.noteValue)
        quickLaunchLabel = findViewById(R.id.quickLaunchLabel)
        quickLaunchScroll = findViewById(R.id.quickLaunchScroll)
        quickLaunchRow = findViewById(R.id.quickLaunchRow)
        uiReady = true

        findViewById<View>(R.id.unlockButton).setOnClickListener { unlock() }

        applyLockWindow()
        // Back never leaves the lock screen: this surface has one exit, the unlock control.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = Unit
        })

        renderAll()
    }

    override fun onStart() {
        super.onStart()
        if (!uiReady) return
        registerBattery()
        renderClock()
        scheduleClock()
    }

    override fun onStop() {
        super.onStop()
        handler.removeCallbacks(clockTick)
        batteryReceiver?.let { receiver -> runCatching { unregisterReceiver(receiver) } }
        batteryReceiver = null
    }

    override fun onResume() {
        super.onResume()
        if (!uiReady || !shouldLock()) {
            finish()
            return
        }
        renderAll()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(clockTick)
    }

    /** Any touch can start the unlock swipe, including one that begins on a shortcut. */
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        gestures.onTouchEvent(ev)
        return super.dispatchTouchEvent(ev)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // A shade swipe briefly reveals the bars; put the kiosk surface back on top.
        if (hasFocus) syncSystemBars()
    }

    // -------------------------------------------------------------------- render
    private fun renderAll() {
        renderClock()
        renderWidgets()
        renderDock(loadedShortcuts)
        loadShortcuts()
    }

    private fun renderClock() {
        val now = Date()
        clock.text = timeFormat.format(now)
        dateLabel.text = dateFormat.format(now)
    }

    private fun renderWidgets() {
        val note = prefs.lockScreenNote
        noteWidget.visibility = if (note.isBlank()) View.GONE else View.VISIBLE
        noteValue.text = note
    }

    private fun loadShortcuts() {
        val request = ++appsRequest
        apps.launchableAsync { installed ->
            if (request != appsRequest || isFinishing || isDestroyed) return@launchableAsync
            val byPackage = installed.associateBy { it.packageName }
            loadedShortcuts = LockScreenShortcuts
                .resolve(prefs.quickLaunchPackages(), byPackage.keys)
                .mapNotNull { byPackage[it] }
            renderDock(loadedShortcuts)
        }
    }

    private fun renderDock(entries: List<AppEntry>) {
        // Panic lockdown keeps the clock and widgets but removes every launch route; an app
        // that is no longer allowed loses its shortcut the same way.
        val visible = if (prefs.isPanicLocked()) {
            emptyList()
        } else {
            entries.filter { prefs.isAllowed(it.packageName) }
        }
        quickLaunchRow.removeAllViews()
        val hasShortcuts = visible.isNotEmpty()
        quickLaunchLabel.visibility = if (hasShortcuts) View.VISIBLE else View.GONE
        quickLaunchScroll.visibility = if (hasShortcuts) View.VISIBLE else View.GONE

        visible.forEach { entry ->
            val item = layoutInflater.inflate(R.layout.item_lock_app, quickLaunchRow, false)
            item.findViewById<ImageView>(R.id.shortcutIcon).setImageDrawable(entry.icon)
            item.findViewById<TextView>(R.id.shortcutLabel).text = entry.label

            val locked = prefs.isAppProtected(entry.packageName)
            item.findViewById<ImageView>(R.id.shortcutLock).visibility =
                if (locked) View.VISIBLE else View.GONE
            item.contentDescription = if (locked) {
                getString(R.string.app_locked_content_desc_fmt, entry.label)
            } else {
                entry.label
            }
            item.setOnClickListener { openFromLock(entry) }
            quickLaunchRow.addView(item)
        }
    }

    private fun registerBattery() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                renderBattery(intent)
            }
        }
        batteryReceiver = receiver
        // Registering for the sticky battery broadcast delivers the current value at once.
        runCatching {
            ContextCompat.registerReceiver(
                this,
                receiver,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED),
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
        }
    }

    private fun renderBattery(intent: Intent?) {
        val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        batteryValue.text = if (level >= 0 && scale > 0) {
            "${level * 100 / scale}%"
        } else {
            getString(R.string.lock_battery_unknown)
        }
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        batteryDetail.setText(
            if (charging) R.string.lock_battery_charging else R.string.lock_battery_discharging
        )
    }

    /** Minute-aligned rather than a 1-second loop, so an idle lock screen stays cheap. */
    private fun scheduleClock() {
        handler.removeCallbacks(clockTick)
        val now = Calendar.getInstance()
        val next = Calendar.getInstance().apply {
            timeInMillis = now.timeInMillis
            add(Calendar.MINUTE, 1)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        handler.postDelayed(clockTick, (next.timeInMillis - now.timeInMillis).coerceAtLeast(1_000L))
    }

    // ------------------------------------------------------------------- actions
    private fun unlock() {
        prefs.lockScreenPending = false
        startActivity(
            Intent(this, KioskLauncherActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        )
        finish()
    }

    /** The same gate as the kiosk grid; a successful launch also unlocks. */
    private fun openFromLock(entry: AppEntry) {
        AppLaunchGate.open(this, entry, apps) {
            // Returning to Home must not show the lock screen again.
            prefs.lockScreenPending = false
            finish()
        }
    }

    private fun shouldLock(): Boolean {
        if (preview) return prefs.customLockScreen
        if (!prefs.customLockScreen) return false
        if (prefs.isAdminTemporarilyUnlocked()) return false
        return prefs.isKioskActiveNow() && DevicePolicyHelper(this).isDefaultLauncher
    }

    // -------------------------------------------------------------------- chrome
    private fun applyLockWindow() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }
        syncSystemBars()

        val root = findViewById<View>(R.id.lockRoot)
        val base = dp(20)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            view.setPadding(
                cutout.left + base,
                cutout.top + base,
                cutout.right + base,
                cutout.bottom + base
            )
            insets
        }
    }

    private fun syncSystemBars() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        // Bars may peek during a deliberate swipe but never stay: there is no shade to use.
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    companion object {
        /** Opens the lock screen from Admin even before the kiosk is active. */
        const val EXTRA_PREVIEW = "lock_screen_preview"
    }
}
