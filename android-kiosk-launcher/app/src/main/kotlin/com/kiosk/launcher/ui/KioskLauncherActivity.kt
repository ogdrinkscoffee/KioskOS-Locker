/**
 * Copyright (c) 2026 [Your Name / Studio Name]. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, reverse-engineering,
 * modification, or redistribution of this file is strictly prohibited.
 */
package com.kiosk.launcher.ui

import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.InstalledAppInfo
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.databinding.ActivityKioskLauncherBinding
import com.kiosk.launcher.databinding.ItemKioskAppBinding
import com.kiosk.launcher.sync.CloudSyncManager

/**
 * Main Kiosk Home Launcher Activity.
 * Declared with HOME + DEFAULT categories in AndroidManifest.xml.
 * Supports Multi-App Grid, Single-App Auto-Launch, and Locked Kiosk Browser modes,
 * timed Admin unlock countdown controls, dynamic status bar visibility, and
 * runtime orientation/font-scale recovery without resetting kiosk lockdown.
 */
class KioskLauncherActivity : AppCompatActivity() {

    private lateinit var binding: ActivityKioskLauncherBinding
    private lateinit var prefs: KioskPreferences
    private lateinit var adapter: KioskAppsAdapter
    private var pinDialog: androidx.appcompat.app.AlertDialog? = null

    private val unlockTickHandler = Handler(Looper.getMainLooper())
    private val unlockTickRunnable = object : Runnable {
        override fun run() {
            if (isFinishing || isDestroyed) return
            val expired = DevicePolicyHelper.reconcileAdminUnlockTimeout(this@KioskLauncherActivity)
            updateUnlockTimerBanner()
            if (expired) {
                Toast.makeText(
                    this@KioskLauncherActivity,
                    R.string.toast_unlock_expired,
                    Toast.LENGTH_LONG
                ).show()
                ensureLauncherLockTask()
                applySystemBarVisibility()
                updatePolicyStatusBanner()
            } else if (prefs.isSettingsAndUninstallUnlocked()) {
                unlockTickHandler.postDelayed(this, 1_000L)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityKioskLauncherBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = KioskPreferences(this)
        applyKeepScreenAwakeFlag()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Kiosk Home cannot be exited via system Back button
            }
        })

        setupGrid()
        setupAdminTrigger()
        setupUnlockBannerControls()
        applySystemBarVisibility()
        handleBlockedPackageIntent(intent)
    }

    override fun onDestroy() {
        unlockTickHandler.removeCallbacks(unlockTickRunnable)
        pinDialog?.dismiss()
        pinDialog = null
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleBlockedPackageIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        val expired = DevicePolicyHelper.reconcileAdminUnlockTimeout(this)
        if (expired) {
            Toast.makeText(this, R.string.toast_unlock_expired, Toast.LENGTH_LONG).show()
        }
        DevicePolicyHelper.enforceKioskPolicies(this)
        applyKeepScreenAwakeFlag()
        ensureLauncherLockTask()
        applySystemBarVisibility()
        binding.kioskHeaderTitle.text = prefs.getKioskTitle(getString(R.string.kiosk_home_title))
        refreshAllowedApps()
        updatePolicyStatusBanner()
        updateUnlockTimerBanner()
        startUnlockTickIfNeeded()
        autoLaunchDedicatedModeIfConfigured()
        CloudSyncManager.triggerSyncIfEnabled(this) { outcome ->
            if (outcome is CloudSyncManager.SyncOutcome.Success && outcome.pulledRemoteDeviceSettings) {
                runOnUiThread {
                    if (!isFinishing && !isDestroyed) {
                        binding.kioskHeaderTitle.text = prefs.getKioskTitle(getString(R.string.kiosk_home_title))
                        applySystemBarVisibility()
                        refreshAllowedApps()
                        updatePolicyStatusBanner()
                        updateUnlockTimerBanner()
                    }
                }
            }
        }
    }

    override fun onPause() {
        unlockTickHandler.removeCallbacks(unlockTickRunnable)
        super.onPause()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val spanCount = calculateGridSpanCount(newConfig)
        (binding.appsRecyclerView.layoutManager as? GridLayoutManager)?.spanCount = spanCount
        applySystemBarVisibility()
    }

    private fun applyKeepScreenAwakeFlag() {
        if (prefs.isKeepScreenAwake()) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    private fun applySystemBarVisibility() {
        val shouldHideStatusBar = !prefs.isSettingsAndUninstallUnlocked() && prefs.isStatusBarDisabled()
        WindowCompat.setDecorFitsSystemWindows(window, !shouldHideStatusBar)
        WindowInsetsControllerCompat(window, binding.root).apply {
            if (shouldHideStatusBar) {
                hide(WindowInsetsCompat.Type.statusBars())
                systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } else {
                show(WindowInsetsCompat.Type.statusBars())
            }
        }
    }

    private fun startUnlockTickIfNeeded() {
        unlockTickHandler.removeCallbacks(unlockTickRunnable)
        if (prefs.isSettingsAndUninstallUnlocked()) {
            unlockTickHandler.postDelayed(unlockTickRunnable, 1_000L)
        }
    }

    private fun setupUnlockBannerControls() {
        binding.unlockSubtract1mButton.setOnClickListener {
            val stillUnlocked = prefs.adjustAdminUnlockTime(-1)
            DevicePolicyHelper.enforceKioskPolicies(this)
            ensureLauncherLockTask()
            applySystemBarVisibility()
            updatePolicyStatusBanner()
            updateUnlockTimerBanner()
            if (!stillUnlocked) {
                Toast.makeText(this, R.string.toast_unlock_expired, Toast.LENGTH_SHORT).show()
            }
        }
        binding.unlockAdd1mButton.setOnClickListener {
            prefs.adjustAdminUnlockTime(1)
            DevicePolicyHelper.enforceKioskPolicies(this)
            updateUnlockTimerBanner()
            startUnlockTickIfNeeded()
        }
        binding.unlockReopenAdminButton.setOnClickListener {
            if (prefs.isSettingsAndUninstallUnlocked()) {
                startActivity(Intent(this, AdminSettingsActivity::class.java))
            } else {
                openAdminWithPinPrompt()
            }
        }
        binding.unlockLockNowButton.setOnClickListener {
            DevicePolicyHelper.setAdminUnlockState(this, unlocked = false)
            ensureLauncherLockTask()
            applySystemBarVisibility()
            updatePolicyStatusBanner()
            updateUnlockTimerBanner()
        }
    }

    private fun updateUnlockTimerBanner() {
        val remainingSec = prefs.getAdminUnlockRemainingSeconds()
        if (remainingSec > 0) {
            binding.unlockTimerBanner.visibility = View.VISIBLE
            binding.unlockTimerText.text = getString(
                R.string.unlock_timer_active_format,
                remainingSec / 60,
                remainingSec % 60
            )
        } else {
            binding.unlockTimerBanner.visibility = View.GONE
        }
    }

    private fun autoLaunchDedicatedModeIfConfigured() {
        if (prefs.isPanicLockActive() || prefs.isSettingsAndUninstallUnlocked()) return
        when (prefs.getKioskMode()) {
            KioskPreferences.MODE_SINGLE_APP -> {
                val targetPkg = prefs.getSingleAppPackage()
                if (!targetPkg.isNullOrBlank() &&
                    targetPkg != packageName &&
                    prefs.getTimeOrScheduleBlockReason(targetPkg) == null
                ) {
                    DevicePolicyHelper.launchPackageInKioskMode(this, targetPkg)
                }
            }
            KioskPreferences.MODE_KIOSK_BROWSER -> {
                if (prefs.getTimeOrScheduleBlockReason(KioskPreferences.KIOSK_BROWSER_PACKAGE) == null) {
                    startActivity(Intent(this, KioskBrowserActivity::class.java))
                }
            }
        }
    }

    private fun setupGrid() {
        adapter = KioskAppsAdapter(
            remainingStatusProvider = { pkg -> formatTileTimeStatus(pkg) },
            onAppClick = { appInfo -> launchAllowedApp(appInfo) }
        )
        binding.appsRecyclerView.layoutManager =
            GridLayoutManager(this, calculateGridSpanCount(resources.configuration))
        binding.appsRecyclerView.adapter = adapter
    }

    private fun setupAdminTrigger() {
        binding.openSelfImprovementButton.setOnClickListener {
            startActivity(Intent(this, SelfImprovementActivity::class.java))
        }
        binding.openKioskBrowserButton.setOnClickListener {
            val blockReason = prefs.getTimeOrScheduleBlockReason(KioskPreferences.KIOSK_BROWSER_PACKAGE)
            if (blockReason != null) {
                prefs.incrementBlockedAttemptsToday()
                Toast.makeText(this, blockReason, Toast.LENGTH_LONG).show()
                updatePolicyStatusBanner()
            } else {
                startActivity(Intent(this, KioskBrowserActivity::class.java))
            }
        }
        binding.adminSettingsButton.setOnClickListener {
            if (prefs.isSettingsAndUninstallUnlocked()) {
                startActivity(Intent(this, AdminSettingsActivity::class.java))
            } else {
                openAdminWithPinPrompt()
            }
        }
        binding.homePanicButton.setOnClickListener {
            val mins = DevicePolicyHelper.triggerEmergencyPanic(this)
            ensureLauncherLockTask()
            applySystemBarVisibility()
            refreshAllowedApps()
            updatePolicyStatusBanner()
            updateUnlockTimerBanner()
            Toast.makeText(
                this,
                getString(R.string.toast_panic_activated, mins),
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun openAdminWithPinPrompt() {
        pinDialog?.dismiss()
        pinDialog = PinPromptDialog.show(
            context = this,
            title = getString(R.string.admin_pin_prompt_title),
            subtitle = getString(R.string.admin_pin_prompt_subtitle)
        ) {
            startActivity(Intent(this, AdminSettingsActivity::class.java))
        }
    }

    private fun launchAllowedApp(appInfo: InstalledAppInfo) {
        val blockReason = DevicePolicyHelper.getLaunchBlockReason(this, appInfo.packageName)
        if (blockReason != null) {
            prefs.incrementBlockedAttemptsToday()
            prefs.recordBypassAttempt("Blocked app launch: ${appInfo.packageName}", points = 5)
            Toast.makeText(this, "${appInfo.label}: $blockReason", Toast.LENGTH_LONG).show()
            updatePolicyStatusBanner()
            refreshAllowedApps()
            return
        }
        val launched = DevicePolicyHelper.launchPackageInKioskMode(this, appInfo.packageName)
        if (!launched) {
            Toast.makeText(
                this,
                getString(R.string.toast_blocked_by_kiosk_policy, appInfo.label),
                Toast.LENGTH_SHORT
            ).show()
        }
    }

    private fun formatTileTimeStatus(packageName: String): String? {
        val blockReason = prefs.getTimeOrScheduleBlockReason(packageName)
        val remainingSec = prefs.getAppRemainingSeconds(packageName)
        if (blockReason != null) {
            return if (remainingSec != null && remainingSec <= 0) {
                getString(R.string.label_limit_reached)
            } else {
                getString(R.string.label_schedule_blocked)
            }
        }
        if (remainingSec != null) {
            val minsLeft = (remainingSec + 59) / 60
            return getString(R.string.label_minutes_left_today, minsLeft)
        }
        return null
    }

    private fun ensureLauncherLockTask() {
        if (prefs.isSettingsAndUninstallUnlocked()) {
            try {
                stopLockTask()
            } catch (_: IllegalStateException) {
            }
            return
        }
        if (DevicePolicyHelper.isDeviceOwner(this)) {
            DevicePolicyHelper.syncLockTaskPackages(this)
            try {
                startLockTask()
            } catch (_: IllegalStateException) {
            }
        }
    }

    private fun refreshAllowedApps() {
        prefs.ensureUsageDateCurrent()
        val allowedPackages = prefs.getAllowedPackages()
        val allLaunchable = InstalledAppsRepository.loadLaunchableApps(this)
        val filtered = allLaunchable.filter { app ->
            app.packageName in allowedPackages && !app.isSystemRestricted
        }
        adapter.submitList(filtered)
        binding.emptyKioskState.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
    }

    private fun updatePolicyStatusBanner() {
        val isDeviceOwner = DevicePolicyHelper.isDeviceOwner(this)
        val modeLabel = when (prefs.getKioskMode()) {
            KioskPreferences.MODE_SINGLE_APP -> "Single-App"
            KioskPreferences.MODE_KIOSK_BROWSER -> "Kiosk Browser"
            else -> "Multi-App"
        }
        val statusExtras = buildList {
            if (prefs.isSettingsAndUninstallUnlocked()) {
                val rem = prefs.getAdminUnlockRemainingSeconds()
                add("Admin Unlocked ${(rem + 59) / 60}m")
            }
            if (prefs.isPanicLockActive()) {
                add("Panic ${prefs.getPanicLockRemainingMinutes()}m")
            }
            if (prefs.isFocusBlockActive()) {
                add("Focus ${prefs.getFocusBlockRemainingMinutes()}m")
            }
            if (prefs.isDowntimeActiveNow()) {
                add("Quiet Hours")
            }
            val blocked = prefs.getBlockedAttemptsToday()
            if (blocked > 0) {
                add("$blocked blocked")
            }
        }
        val suffix = if (statusExtras.isEmpty()) modeLabel else "$modeLabel · ${statusExtras.joinToString(" · ")}"
        binding.deviceOwnerStatusText.text = if (isDeviceOwner) {
            getString(R.string.status_device_owner_active, suffix)
        } else {
            getString(R.string.status_device_owner_inactive, suffix)
        }
    }

    private fun handleBlockedPackageIntent(intent: Intent?) {
        val panicMins = intent?.getIntExtra(EXTRA_PANIC_TRIGGERED, 0) ?: 0
        if (panicMins > 0) {
            intent?.removeExtra(EXTRA_PANIC_TRIGGERED)
            Toast.makeText(
                this,
                getString(R.string.toast_panic_activated, panicMins),
                Toast.LENGTH_LONG
            ).show()
        }
        val blockedPkg = intent?.getStringExtra(EXTRA_BLOCKED_PACKAGE) ?: return
        val blockedReason = intent.getStringExtra(EXTRA_BLOCKED_REASON)
        intent.removeExtra(EXTRA_BLOCKED_PACKAGE)
        intent.removeExtra(EXTRA_BLOCKED_REASON)
        Toast.makeText(
            this,
            blockedReason ?: getString(R.string.toast_settings_blocked, blockedPkg),
            Toast.LENGTH_LONG
        ).show()
    }

    private fun calculateGridSpanCount(config: Configuration): Int {
        return when {
            config.screenWidthDp >= 900 -> 5
            config.screenWidthDp >= 600 -> 4
            config.orientation == Configuration.ORIENTATION_LANDSCAPE -> 4
            else -> 2
        }
    }

    private class KioskAppsAdapter(
        private val remainingStatusProvider: (String) -> String?,
        private val onAppClick: (InstalledAppInfo) -> Unit
    ) : RecyclerView.Adapter<KioskAppsAdapter.AppViewHolder>() {

        private var items: List<InstalledAppInfo> = emptyList()

        fun submitList(newItems: List<InstalledAppInfo>) {
            items = newItems
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AppViewHolder {
            val itemBinding = ItemKioskAppBinding.inflate(
                LayoutInflater.from(parent.context),
                parent,
                false
            )
            return AppViewHolder(itemBinding)
        }

        override fun onBindViewHolder(holder: AppViewHolder, position: Int) {
            holder.bind(items[position], remainingStatusProvider, onAppClick)
        }

        override fun getItemCount(): Int = items.size

        class AppViewHolder(
            private val itemBinding: ItemKioskAppBinding
        ) : RecyclerView.ViewHolder(itemBinding.root) {

            fun bind(
                app: InstalledAppInfo,
                remainingStatusProvider: (String) -> String?,
                onClick: (InstalledAppInfo) -> Unit
            ) {
                val iconView: ImageView = itemBinding.appIcon
                val labelView: TextView = itemBinding.appLabel
                val packageView: TextView = itemBinding.appPackage

                labelView.text = app.label
                packageView.text = app.packageName
                if (app.icon != null) {
                    iconView.setImageDrawable(app.icon)
                } else {
                    iconView.setImageResource(android.R.drawable.sym_def_app_icon)
                }

                val limitStatus = remainingStatusProvider(app.packageName)
                if (limitStatus != null) {
                    itemBinding.appTimeLimitStatus.visibility = View.VISIBLE
                    itemBinding.appTimeLimitStatus.text = limitStatus
                } else {
                    itemBinding.appTimeLimitStatus.visibility = View.GONE
                }

                itemBinding.root.setOnClickListener { onClick(app) }
            }
        }
    }

    companion object {
        const val EXTRA_BLOCKED_PACKAGE = "com.kiosk.launcher.EXTRA_BLOCKED_PACKAGE"
        const val EXTRA_BLOCKED_REASON = "com.kiosk.launcher.EXTRA_BLOCKED_REASON"
        const val EXTRA_PANIC_TRIGGERED = "com.kiosk.launcher.EXTRA_PANIC_TRIGGERED"
    }
}
