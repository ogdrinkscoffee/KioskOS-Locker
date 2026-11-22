package com.kiosk.launcher.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Rect
import android.os.BatteryManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.selfimprovement.SelfImprovementRepository
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class KioskLauncherActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var policy: DevicePolicyHelper
    private lateinit var apps: InstalledAppsRepository
    private lateinit var focus: SelfImprovementRepository
    private val adapter = KioskAppAdapter { open(it) }

    private lateinit var clock: TextView
    private lateinit var dateLabel: TextView
    private lateinit var batteryLabel: TextView
    private lateinit var ownerPill: TextView
    private lateinit var panicBanner: TextView
    private lateinit var modeBannerRow: View
    private lateinit var modeBannerText: TextView
    private lateinit var modeActionButton: Button
    private lateinit var streakValue: TextView
    private lateinit var streakMeta: TextView
    private lateinit var appCount: TextView
    private lateinit var emptyApps: TextView
    private lateinit var grid: RecyclerView

    /** Bumped per scan so a slow, stale result can't overwrite a newer one. */
    private var appsRequest = 0
    private var lastLoadedApps: List<AppEntry> = emptyList()
    private var hasAutoLaunchedMode = false

    private val handler = Handler(Looper.getMainLooper())
    private val clockTick = object : Runnable {
        override fun run() {
            renderClock()
            renderPanicBanner()
            handler.postDelayed(this, 20_000L)
        }
    }
    private var batteryReceiver: BroadcastReceiver? = null

    private val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    private val dateFormat = SimpleDateFormat("EEE, d MMM", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = KioskPreferences(this)
        policy = DevicePolicyHelper(this)
        apps = InstalledAppsRepository(this)
        focus = SelfImprovementRepository(this)

        setContentView(R.layout.activity_kiosk_launcher)
        hideSystemBars()

        clock = findViewById(R.id.clock)
        dateLabel = findViewById(R.id.dateLabel)
        batteryLabel = findViewById(R.id.batteryLabel)
        ownerPill = findViewById(R.id.ownerPill)
        panicBanner = findViewById(R.id.panicBanner)
        modeBannerRow = findViewById(R.id.modeBannerRow)
        modeBannerText = findViewById(R.id.modeBannerText)
        modeActionButton = findViewById(R.id.modeActionButton)
        streakValue = findViewById(R.id.streakValue)
        streakMeta = findViewById(R.id.streakMeta)
        appCount = findViewById(R.id.appCount)
        emptyApps = findViewById(R.id.emptyApps)

        grid = findViewById(R.id.appGrid)
        grid.layoutManager = GridLayoutManager(this, gridColumns())
        grid.adapter = adapter
        grid.addItemDecoration(GridSpacing(this))

        findViewById<View>(R.id.markCleanDay).setOnClickListener {
            val logged = prefs.markTodayClean()
            toast(getString(if (logged) R.string.streak_logged_today else R.string.streak_already_logged))
            renderStreak()
        }
        findViewById<View>(R.id.focusButton).setOnClickListener {
            startActivity(Intent(this, SelfImprovementActivity::class.java))
        }
        findViewById<View>(R.id.adminButton).setOnClickListener {
            PinGate.prompt(this, getString(R.string.pin_title_admin)) {
                startActivity(Intent(this, AdminSettingsActivity::class.java))
            }
        }
        // True 1-tap Emergency Panic Button: wipes clipboard, closes/locks apps, pins dashboard
        findViewById<View>(R.id.panicButton).setOnClickListener {
            panic()
        }

        policy.setAsHomeLauncher()
    }

    override fun onResume() {
        super.onResume()
        // Returning to Kiosk Home always ends any temporary System Settings admin unlock window.
        if (prefs.isAdminTemporarilyUnlocked()) {
            prefs.adminUnlockedUntilMs = 0L
            policy.applyPolicy()
        }
        renderAll()
    }

    override fun onStart() {
        super.onStart()
        registerBattery()
        handler.post(clockTick)
    }

    override fun onStop() {
        super.onStop()
        handler.removeCallbacks(clockTick)
        batteryReceiver?.let { receiver -> runCatching { unregisterReceiver(receiver) } }
        batteryReceiver = null
    }

    // -------------------------------------------------------------------- render
    private fun renderAll() {
        renderClock()
        renderOwnerPill()
        renderPanicBanner()
        renderStreak()
        renderApps()
    }

    private fun renderClock() {
        clock.text = timeFormat.format(Date())
        dateLabel.text = dateFormat.format(Date())
    }

    private fun renderOwnerPill() {
        val isOwner = policy.isDeviceOwner
        ownerPill.setText(if (isOwner) R.string.pill_device_owner else R.string.pill_preview)
    }

    private fun renderPanicBanner() {
        val mins = prefs.panicRemainingMinutes()
        if (mins > 0) {
            panicBanner.visibility = View.VISIBLE
            panicBanner.text = getString(R.string.panic_banner_fmt, mins)
        } else {
            panicBanner.visibility = View.GONE
        }
    }

    private fun renderModeBanner(visibleApps: List<AppEntry>) {
        if (prefs.isPanicLocked()) {
            modeBannerRow.visibility = View.GONE
            return
        }
        when (prefs.kioskMode) {
            KioskPreferences.MODE_BROWSER -> {
                modeBannerRow.visibility = View.VISIBLE
                modeBannerText.setText(R.string.mode_browser_banner)
                modeActionButton.setText(R.string.open_kiosk_browser)
                modeActionButton.setOnClickListener {
                    startActivity(Intent(this, KioskBrowserActivity::class.java))
                }
                if (!hasAutoLaunchedMode) {
                    hasAutoLaunchedMode = true
                    startActivity(Intent(this, KioskBrowserActivity::class.java))
                }
            }
            KioskPreferences.MODE_SINGLE -> {
                val pinned = visibleApps.firstOrNull()
                if (pinned != null) {
                    modeBannerRow.visibility = View.VISIBLE
                    modeBannerText.text = getString(R.string.mode_single_banner_fmt, pinned.label)
                    modeActionButton.setText(R.string.open_single_app)
                    modeActionButton.setOnClickListener { open(pinned) }
                    if (!hasAutoLaunchedMode) {
                        hasAutoLaunchedMode = true
                        open(pinned)
                    }
                } else {
                    modeBannerRow.visibility = View.GONE
                }
            }
            else -> {
                modeBannerRow.visibility = View.GONE
                hasAutoLaunchedMode = false
            }
        }
    }

    private fun renderStreak() {
        streakValue.text = prefs.streak.toString()
        val habits = focus.habits()
        val done = habits.count { it.doneDay == focus.today() }
        streakMeta.text = getString(R.string.streak_meta_fmt, prefs.bestStreak, done, habits.size)
    }

    private fun renderApps() {
        val request = ++appsRequest
        apps.launchableAsync { all ->
            if (request != appsRequest || isFinishing || isDestroyed) return@launchableAsync
            lastLoadedApps = all
            renderAppGrid(all)
        }
    }

    private fun renderAppGrid(all: List<AppEntry>) {
        val visible = all.filter { prefs.isAllowed(it.packageName) }
        adapter.submit(visible)
        appCount.text = if (prefs.allowAllApps) {
            getString(R.string.apps_count_all_fmt, visible.size)
        } else {
            getString(R.string.apps_count_allowed_fmt, visible.size, all.size)
        }

        renderModeBanner(visible)

        val empty = visible.isEmpty()
        grid.visibility = if (empty) View.GONE else View.VISIBLE
        emptyApps.visibility = if (empty) View.VISIBLE else View.GONE
        if (empty) {
            emptyApps.setText(
                if (all.isEmpty()) R.string.no_launchable_apps else R.string.no_allowlisted_apps
            )
        }
    }

    // ------------------------------------------------------------------- actions
    private fun open(entry: AppEntry) {
        if (prefs.isPanicLocked()) {
            toast(getString(R.string.panic_app_blocked))
            return
        }
        if (!prefs.isAllowed(entry.packageName)) {
            toast(getString(R.string.app_not_allowed_fmt, entry.label))
            return
        }
        if (!apps.launch(entry.packageName)) {
            toast(getString(R.string.cannot_open_app_fmt, entry.label))
        }
    }

    private fun panic() {
        policy.wipeClipboard()
        prefs.triggerPanicLockdown()
        policy.applyPolicy()
        renderPanicBanner()
        renderModeBanner(lastLoadedApps.filter { prefs.isAllowed(it.packageName) })
        toast(getString(R.string.panic_toast))
    }

    // -------------------------------------------------------------------- chrome
    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        val root = findViewById<View>(R.id.root)
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

    private fun registerBattery() {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val level = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
                val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
                if (level >= 0 && scale > 0) batteryLabel.text = "${level * 100 / scale}%"
            }
        }
        batteryReceiver = receiver
        runCatching {
            ContextCompat.registerReceiver(
                this,
                receiver,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED),
                ContextCompat.RECEIVER_NOT_EXPORTED
            )
        }
    }

    private fun gridColumns(): Int =
        (resources.configuration.screenWidthDp / 104).coerceIn(3, 6)

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private class GridSpacing(context: Context) : RecyclerView.ItemDecoration() {
        private val gap = (6 * context.resources.displayMetrics.density).toInt()

        override fun getItemOffsets(
            outRect: Rect,
            view: View,
            parent: RecyclerView,
            state: RecyclerView.State
        ) {
            outRect.set(gap, gap, gap, gap)
        }
    }
}
