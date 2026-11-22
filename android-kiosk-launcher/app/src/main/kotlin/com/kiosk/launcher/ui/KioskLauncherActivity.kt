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
import android.provider.Settings
import android.view.View
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
    private lateinit var streakValue: TextView
    private lateinit var streakMeta: TextView
    private lateinit var appCount: TextView
    private lateinit var emptyApps: TextView
    private lateinit var grid: RecyclerView

    /** Bumped per scan so a slow, stale result can't overwrite a newer one. */
    private var appsRequest = 0

    private val handler = Handler(Looper.getMainLooper())
    private val clockTick = object : Runnable {
        override fun run() {
            renderClock()
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
        streakValue = findViewById(R.id.streakValue)
        streakMeta = findViewById(R.id.streakMeta)
        appCount = findViewById(R.id.appCount)
        emptyApps = findViewById(R.id.emptyApps)

        grid = findViewById(R.id.appGrid)
        grid.layoutManager = GridLayoutManager(this, gridColumns())
        grid.adapter = adapter
        grid.addItemDecoration(GridSpacing(this))

        findViewById<View>(R.id.markCleanDay).setOnClickListener {
            if (prefs.markTodayClean()) toast("Clean day logged") else toast("Already logged today")
            renderStreak()
        }
        findViewById<View>(R.id.focusButton).setOnClickListener {
            startActivity(Intent(this, SelfImprovementActivity::class.java))
        }
        findViewById<View>(R.id.adminButton).setOnClickListener {
            PinGate.prompt(this, "Admin access") {
                startActivity(Intent(this, AdminSettingsActivity::class.java))
            }
        }
        findViewById<View>(R.id.panicButton).setOnClickListener {
            PinGate.prompt(this, "Exit kiosk") { panic() }
        }

        policy.setAsHomeLauncher()
    }

    override fun onResume() {
        super.onResume()
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
        renderStreak()
        renderApps()
    }

    private fun renderClock() {
        clock.text = timeFormat.format(Date())
        dateLabel.text = dateFormat.format(Date())
    }

    private fun renderOwnerPill() {
        val isOwner = policy.isDeviceOwner
        ownerPill.text = if (isOwner) "Device owner" else "Preview"
    }

    private fun renderStreak() {
        streakValue.text = prefs.streak.toString()
        val habits = focus.habits()
        val done = habits.count { it.doneDay == focus.today() }
        streakMeta.text = "Best ${prefs.bestStreak}d · $done/${habits.size} habits today"
    }

    private fun renderApps() {
        val request = ++appsRequest
        apps.launchableAsync { all ->
            if (request != appsRequest || isFinishing || isDestroyed) return@launchableAsync
            renderAppGrid(all)
        }
    }

    private fun renderAppGrid(all: List<AppEntry>) {
        val visible = all.filter { prefs.isAllowed(it.packageName) }
        adapter.submit(visible)
        appCount.text = if (prefs.allowAllApps) "${visible.size} apps"
        else "${visible.size} of ${all.size} allowed"

        // Swapping visibility (instead of leaving both weighted views visible) stops the
        // grid from keeping half the screen when the empty state is showing.
        val empty = visible.isEmpty()
        grid.visibility = if (empty) View.GONE else View.VISIBLE
        emptyApps.visibility = if (empty) View.VISIBLE else View.GONE
        if (empty) {
            emptyApps.text = if (all.isEmpty()) {
                "No launchable apps found on this device."
            } else {
                "Nothing is allowlisted yet.\nOpen Admin and pick the apps this kiosk may run."
            }
        }
    }

    // ------------------------------------------------------------------- actions
    private fun open(entry: AppEntry) {
        if (!prefs.isAllowed(entry.packageName)) {
            toast("${entry.label} is not allowed")
            return
        }
        if (!apps.launch(entry.packageName)) toast("Can't open ${entry.label}")
    }

    private fun panic() {
        val locked = policy.isInLockTaskMode()
        if (locked) policy.stopKiosk(this)
        runCatching {
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        prefs.logPolicy("Panic: kiosk paused")
        toast(if (locked) "Kiosk paused" else "Opening system settings")
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
