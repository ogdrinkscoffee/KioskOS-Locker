/**
 * Copyright (c) 2026 [Your Name / Studio Name]. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, reverse-engineering,
 * modification, or redistribution of this file is strictly prohibited.
 */
package com.kiosk.launcher.ui

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.kiosk.launcher.BuildConfig
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.InstalledAppInfo
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.databinding.ActivityAdminSettingsBinding
import com.kiosk.launcher.databinding.ItemAdminAppToggleBinding
import com.kiosk.launcher.sync.CloudSyncManager
import com.kiosk.launcher.update.AppUpdater
import com.kiosk.launcher.update.UpdateResultReceiver
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Passcode-protected Admin Settings screen.
 * Supports:
 * 1. Multi-App, Single-App Dedicated, and Locked Kiosk Web Browser modes.
 * 2. BlockP / BlockerX style shields + Family Private DNS + Strict Time-Lock.
 * 3. Enterprise hardware lockdown (status bar, keyguard, camera, USB transfer, clock lock, screenshots, stay-awake).
 * 4. Timed temporary Settings & Uninstall unlock with -5m / -1m / +1m / +5m adjustments.
 * 5. In-App APK Updater checking KioskOS /api/apk/latest or GitHub releases/latest.
 * 6. Search, toggle, time-limit, Launch LockTask, or Uninstall any installed app on the device.
 */
class AdminSettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAdminSettingsBinding
    private lateinit var prefs: KioskPreferences
    private lateinit var adapter: AdminAppsAdapter
    private var allNonSystemApps: List<InstalledAppInfo> = emptyList()
    private var suppressSwitchCallbacks = false
    private var pendingReleaseManifest: KioskPreferences.ApkReleaseManifest? = null

    private val timerHandler = Handler(Looper.getMainLooper())
    private val timerRunnable = object : Runnable {
        override fun run() {
            if (isFinishing || isDestroyed) return
            val expired = DevicePolicyHelper.reconcileAdminUnlockTimeout(this@AdminSettingsActivity)
            refreshUnlockCountdownUi()
            if (expired) {
                syncSwitchesFromPrefs()
                refreshPolicyReadout()
                Toast.makeText(
                    this@AdminSettingsActivity,
                    R.string.toast_unlock_expired,
                    Toast.LENGTH_LONG
                ).show()
            }
            timerHandler.postDelayed(this, 1_000L)
        }
    }

    private val uninstallEventsReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == UpdateResultReceiver.ACTION_PACKAGE_UNINSTALLED_EVENT) {
                reloadInstalledApps()
                refreshPolicyReadout()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAdminSettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = KioskPreferences(this)

        setupKioskProfileControls()
        setupBlockerShieldControls()
        setupAppBlockScheduleControls()
        setupHardwarePolicySwitches()
        setupUnlockControls()
        setupApkUpdaterControls()
        setupCloudSyncControls()
        setupAppsList()
        setupPinUpdateForm()
        setupNavigationControls()
        setupTamperLogViewer()
        syncSwitchesFromPrefs()
        refreshPolicyReadout()
    }

    override fun onResume() {
        super.onResume()
        DevicePolicyHelper.reconcileAdminUnlockTimeout(this)
        ContextCompat.registerReceiver(
            this,
            uninstallEventsReceiver,
            IntentFilter(UpdateResultReceiver.ACTION_PACKAGE_UNINSTALLED_EVENT),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        syncSwitchesFromPrefs()
        reloadInstalledApps()
        refreshPolicyReadout()
        refreshUnlockCountdownUi()
        timerHandler.removeCallbacks(timerRunnable)
        timerHandler.postDelayed(timerRunnable, 1_000L)
    }

    override fun onPause() {
        timerHandler.removeCallbacks(timerRunnable)
        try {
            unregisterReceiver(uninstallEventsReceiver)
        } catch (_: IllegalArgumentException) {
        }
        super.onPause()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
    }

    private fun syncSwitchesFromPrefs() {
        suppressSwitchCallbacks = true
        try {
            binding.disablePornBrowsersSwitch.isChecked = prefs.isDisablePornOnBrowsers()
            binding.blockInAppBrowsersSwitch.isChecked = prefs.isBlockInAppBrowsers()
            binding.blockUnsupportedBrowsersSwitch.isChecked = prefs.isBlockUnsupportedBrowsers()
            binding.blockShortFormFeedsSwitch.isChecked = prefs.isBlockShortFormFeeds()
            binding.downtimeEnabledSwitch.isChecked = prefs.isDowntimeEnabled()

            binding.statusBarDisabledSwitch.isChecked = prefs.isStatusBarDisabled()
            binding.keyguardDisabledSwitch.isChecked = prefs.isKeyguardDisabled()
            binding.cameraDisabledSwitch.isChecked = prefs.isCameraDisabled()
            binding.usbBlockedSwitch.isChecked = prefs.isUsbTransferBlocked()
            binding.dateTimeLockedSwitch.isChecked = prefs.isDateTimeLocked()
            binding.screenCaptureDisabledSwitch.isChecked = prefs.isScreenCaptureDisabled()
            binding.keepAwakeSwitch.isChecked = prefs.isKeepScreenAwake()

            binding.unlockSettingsSwitch.isChecked = prefs.isSettingsAndUninstallUnlocked()
            binding.cloudSyncEnabledSwitch.isChecked = prefs.isCloudSyncEnabled()
        } finally {
            suppressSwitchCallbacks = false
        }
    }

    private fun setupKioskProfileControls() {
        when (prefs.getKioskMode()) {
            KioskPreferences.MODE_SINGLE_APP -> binding.modeSingleAppRadio.isChecked = true
            KioskPreferences.MODE_KIOSK_BROWSER -> binding.modeKioskBrowserRadio.isChecked = true
            else -> binding.modeMultiAppRadio.isChecked = true
        }
        binding.kioskTitleInput.setText(prefs.getKioskTitle(getString(R.string.kiosk_home_title)))
        binding.singleAppPackageInput.setText(prefs.getSingleAppPackage().orEmpty())
        binding.allowedDomainsInput.setText(prefs.getAllowedDomains().sorted().joinToString(", "))

        binding.saveKioskProfileButton.setOnClickListener {
            val selectedMode = when (binding.kioskModeRadioGroup.checkedRadioButtonId) {
                R.id.modeSingleAppRadio -> KioskPreferences.MODE_SINGLE_APP
                R.id.modeKioskBrowserRadio -> KioskPreferences.MODE_KIOSK_BROWSER
                else -> KioskPreferences.MODE_MULTI_APP
            }
            prefs.setKioskMode(selectedMode)
            prefs.setKioskTitle(binding.kioskTitleInput.text?.toString().orEmpty())
            val singlePkg = binding.singleAppPackageInput.text?.toString()?.trim().orEmpty()
            prefs.setSingleAppPackage(singlePkg.ifEmpty { null })

            val domains = binding.allowedDomainsInput.text
                ?.toString()
                .orEmpty()
                .split(',', '\n', ';')
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .toSet()
            prefs.setAllowedDomains(domains)

            DevicePolicyHelper.enforceKioskPolicies(this)
            CloudSyncManager.triggerSyncIfEnabled(this)
            refreshPolicyReadout()
            Toast.makeText(this, R.string.toast_kiosk_profile_saved, Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupBlockerShieldControls() {
        when (prefs.getFamilyDnsMode()) {
            KioskPreferences.DNS_CLEANBROWSING_ADULT -> binding.dnsCleanBrowsingRadio.isChecked = true
            KioskPreferences.DNS_OFF -> binding.dnsOffRadio.isChecked = true
            else -> binding.dnsCloudflareRadio.isChecked = true
        }

        binding.inAppBrowserWhitelistInput.setText(prefs.getInAppBrowserWhitelist().sorted().joinToString(", "))
        binding.blockedKeywordsInput.setText(prefs.getBlockedKeywords().sorted().joinToString(", "))

        val handleSwitch = { isEnabling: Boolean ->
            if (!isEnabling && prefs.isStrictShieldLocked()) {
                val mins = prefs.getStrictShieldRemainingMinutes()
                prefs.recordBypassAttempt("Attempted to disable shield during Strict Lock", points = 10)
                Toast.makeText(this, getString(R.string.error_strict_shield_locked, mins), Toast.LENGTH_LONG).show()
                refreshPolicyReadout()
                false
            } else {
                true
            }
        }

        binding.disablePornBrowsersSwitch.setOnCheckedChangeListener { buttonView, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            if (!handleSwitch(checked)) {
                buttonView.isChecked = true
                return@setOnCheckedChangeListener
            }
            prefs.setDisablePornOnBrowsers(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            recordAdminMutationAndHandleEscalation("disablePornOnBrowsers=$checked")
            refreshPolicyReadout()
        }

        binding.blockInAppBrowsersSwitch.setOnCheckedChangeListener { buttonView, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            if (!handleSwitch(checked)) {
                buttonView.isChecked = true
                return@setOnCheckedChangeListener
            }
            prefs.setBlockInAppBrowsers(checked)
            recordAdminMutationAndHandleEscalation("blockInAppBrowsers=$checked")
            refreshPolicyReadout()
        }

        binding.blockUnsupportedBrowsersSwitch.setOnCheckedChangeListener { buttonView, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            if (!handleSwitch(checked)) {
                buttonView.isChecked = true
                return@setOnCheckedChangeListener
            }
            prefs.setBlockUnsupportedBrowsers(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            recordAdminMutationAndHandleEscalation("blockUnsupportedBrowsers=$checked")
            refreshPolicyReadout()
        }

        binding.blockShortFormFeedsSwitch.setOnCheckedChangeListener { buttonView, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            if (!handleSwitch(checked)) {
                buttonView.isChecked = true
                return@setOnCheckedChangeListener
            }
            prefs.setBlockShortFormFeeds(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            recordAdminMutationAndHandleEscalation("blockShortFormFeeds=$checked")
            refreshPolicyReadout()
        }

        binding.lockShields1hButton.setOnClickListener {
            prefs.lockBlockerShieldsForMinutes(60)
            refreshPolicyReadout()
            Toast.makeText(this, getString(R.string.toast_strict_shield_activated, 60), Toast.LENGTH_SHORT).show()
        }

        binding.lockShields24hButton.setOnClickListener {
            prefs.lockBlockerShieldsForMinutes(1440)
            refreshPolicyReadout()
            Toast.makeText(this, getString(R.string.toast_strict_shield_activated, 1440), Toast.LENGTH_SHORT).show()
        }

        binding.saveBlockerShieldsButton.setOnClickListener {
            val selectedDns = when (binding.familyDnsRadioGroup.checkedRadioButtonId) {
                R.id.dnsCleanBrowsingRadio -> KioskPreferences.DNS_CLEANBROWSING_ADULT
                R.id.dnsOffRadio -> KioskPreferences.DNS_OFF
                else -> KioskPreferences.DNS_CLOUDFLARE_FAMILY
            }
            if (selectedDns == KioskPreferences.DNS_OFF && prefs.isStrictShieldLocked()) {
                val mins = prefs.getStrictShieldRemainingMinutes()
                Toast.makeText(this, getString(R.string.error_strict_shield_locked, mins), Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            prefs.setFamilyDnsMode(selectedDns)

            val whitelist = binding.inAppBrowserWhitelistInput.text
                ?.toString()
                .orEmpty()
                .split(',', '\n', ';')
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .toSet()
            prefs.setInAppBrowserWhitelist(whitelist)

            val keywords = binding.blockedKeywordsInput.text
                ?.toString()
                .orEmpty()
                .split(',', '\n', ';')
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .toSet()
            prefs.setBlockedKeywords(keywords)

            DevicePolicyHelper.enforceKioskPolicies(this)
            CloudSyncManager.triggerSyncIfEnabled(this)
            refreshPolicyReadout()
            Toast.makeText(this, R.string.toast_blocker_shields_saved, Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupAppBlockScheduleControls() {
        binding.downtimeStartInput.setText((prefs.getDowntimeStartMinutes() / 60).toString())
        binding.downtimeEndInput.setText((prefs.getDowntimeEndMinutes() / 60).toString())

        binding.focusBlock25mButton.setOnClickListener {
            prefs.startFocusBlockMinutes(25)
            DevicePolicyHelper.enforceKioskPolicies(this)
            refreshPolicyReadout()
            Toast.makeText(this, getString(R.string.toast_focus_block_started, 25), Toast.LENGTH_SHORT).show()
        }

        binding.focusBlock60mButton.setOnClickListener {
            prefs.startFocusBlockMinutes(60)
            DevicePolicyHelper.enforceKioskPolicies(this)
            refreshPolicyReadout()
            Toast.makeText(this, getString(R.string.toast_focus_block_started, 60), Toast.LENGTH_SHORT).show()
        }

        binding.focusBlockStopButton.setOnClickListener {
            if (prefs.isStrictShieldLocked()) {
                val mins = prefs.getStrictShieldRemainingMinutes()
                prefs.recordBypassAttempt("Attempted to stop Focus Lock during Strict Lock", points = 10)
                Toast.makeText(this, getString(R.string.error_strict_shield_locked, mins), Toast.LENGTH_LONG).show()
                refreshPolicyReadout()
                return@setOnClickListener
            }
            prefs.startFocusBlockMinutes(0)
            DevicePolicyHelper.enforceKioskPolicies(this)
            recordAdminMutationAndHandleEscalation("focusBlock=0")
            refreshPolicyReadout()
            Toast.makeText(this, R.string.toast_focus_block_cleared, Toast.LENGTH_SHORT).show()
        }

        binding.downtimeEnabledSwitch.setOnCheckedChangeListener { buttonView, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            if (!checked && prefs.isStrictShieldLocked()) {
                buttonView.isChecked = true
                val mins = prefs.getStrictShieldRemainingMinutes()
                prefs.recordBypassAttempt("Attempted to disable Quiet Hours during Strict Lock", points = 10)
                Toast.makeText(this, getString(R.string.error_strict_shield_locked, mins), Toast.LENGTH_LONG).show()
                refreshPolicyReadout()
                return@setOnCheckedChangeListener
            }
            prefs.setDowntimeEnabled(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            recordAdminMutationAndHandleEscalation("downtimeEnabled=$checked")
            refreshPolicyReadout()
        }

        binding.saveDowntimeButton.setOnClickListener {
            val startHour = binding.downtimeStartInput.text?.toString()?.toIntOrNull()?.coerceIn(0, 23) ?: 22
            val endHour = binding.downtimeEndInput.text?.toString()?.toIntOrNull()?.coerceIn(0, 23) ?: 6
            prefs.setDowntimeStartMinutes(startHour * 60)
            prefs.setDowntimeEndMinutes(endHour * 60)
            DevicePolicyHelper.enforceKioskPolicies(this)
            refreshPolicyReadout()
            Toast.makeText(this, R.string.toast_downtime_saved, Toast.LENGTH_SHORT).show()
        }
    }

    private fun setupHardwarePolicySwitches() {
        binding.statusBarDisabledSwitch.setOnCheckedChangeListener { _, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            prefs.setStatusBarDisabled(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            CloudSyncManager.triggerSyncIfEnabled(this)
            recordAdminMutationAndHandleEscalation("statusBarDisabled=$checked")
            refreshPolicyReadout()
        }

        binding.keyguardDisabledSwitch.setOnCheckedChangeListener { _, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            prefs.setKeyguardDisabled(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            CloudSyncManager.triggerSyncIfEnabled(this)
            recordAdminMutationAndHandleEscalation("keyguardDisabled=$checked")
            refreshPolicyReadout()
        }

        binding.cameraDisabledSwitch.setOnCheckedChangeListener { _, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            prefs.setCameraDisabled(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            CloudSyncManager.triggerSyncIfEnabled(this)
            recordAdminMutationAndHandleEscalation("cameraDisabled=$checked")
            refreshPolicyReadout()
        }

        binding.usbBlockedSwitch.setOnCheckedChangeListener { _, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            prefs.setUsbTransferBlocked(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            CloudSyncManager.triggerSyncIfEnabled(this)
            recordAdminMutationAndHandleEscalation("usbTransferBlocked=$checked")
            refreshPolicyReadout()
        }

        binding.dateTimeLockedSwitch.setOnCheckedChangeListener { _, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            prefs.setDateTimeLocked(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            CloudSyncManager.triggerSyncIfEnabled(this)
            recordAdminMutationAndHandleEscalation("dateTimeLocked=$checked")
            refreshPolicyReadout()
        }

        binding.screenCaptureDisabledSwitch.setOnCheckedChangeListener { _, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            prefs.setScreenCaptureDisabled(checked)
            DevicePolicyHelper.enforceKioskPolicies(this)
            CloudSyncManager.triggerSyncIfEnabled(this)
            recordAdminMutationAndHandleEscalation("screenCaptureDisabled=$checked")
            refreshPolicyReadout()
        }

        binding.keepAwakeSwitch.setOnCheckedChangeListener { _, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            prefs.setKeepScreenAwake(checked)
            CloudSyncManager.triggerSyncIfEnabled(this)
        }
    }

    private fun setupUnlockControls() {
        binding.unlockSettingsSwitch.setOnCheckedChangeListener { _, isChecked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            DevicePolicyHelper.setAdminUnlockState(this, unlocked = isChecked)
            recordAdminMutationAndHandleEscalation("adminUnlock=$isChecked")
            refreshPolicyReadout()
            refreshUnlockCountdownUi()
        }

        val adjustMinutes = { delta: Int ->
            val wasUnlocked = prefs.isSettingsAndUninstallUnlocked()
            val nowUnlocked = prefs.adjustAdminUnlockTime(delta)
            DevicePolicyHelper.enforceKioskPolicies(this)
            if (wasUnlocked && !nowUnlocked) {
                Toast.makeText(this, R.string.toast_unlock_expired, Toast.LENGTH_SHORT).show()
            }
            syncSwitchesFromPrefs()
            refreshPolicyReadout()
            refreshUnlockCountdownUi()
        }

        binding.unlockMinus5mButton.setOnClickListener { adjustMinutes(-5) }
        binding.unlockMinus1mButton.setOnClickListener { adjustMinutes(-1) }
        binding.unlockPlus1mButton.setOnClickListener { adjustMinutes(1) }
        binding.unlockPlus5mButton.setOnClickListener { adjustMinutes(5) }

        binding.openAndroidSettingsButton.setOnClickListener {
            if (!prefs.isSettingsAndUninstallUnlocked()) {
                Toast.makeText(this, R.string.error_unlock_required, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val settingsIntent = Intent(android.provider.Settings.ACTION_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(settingsIntent)
        }

        binding.returnKeepTimerButton.setOnClickListener {
            finish()
        }
    }

    private fun refreshUnlockCountdownUi() {
        val remainingSec = prefs.getAdminUnlockRemainingSeconds()
        if (remainingSec > 0) {
            binding.unlockTimerStatusText.text = getString(
                R.string.unlock_timer_active_format,
                remainingSec / 60,
                remainingSec % 60
            )
            binding.openAndroidSettingsButton.isEnabled = true
        } else {
            binding.unlockTimerStatusText.text = getString(
                R.string.unlock_timer_planned_format,
                prefs.getAdminUnlockDurationMinutes()
            )
            binding.openAndroidSettingsButton.isEnabled = false
        }
    }

    private fun setupApkUpdaterControls() {
        binding.apkCurrentVersionText.text = getString(
            R.string.apk_current_version_format,
            BuildConfig.VERSION_NAME,
            BuildConfig.VERSION_CODE
        )
        binding.apkManifestUrlInput.setText(prefs.getApkUpdateManifestUrl())

        binding.checkApkUpdateButton.setOnClickListener {
            val url = binding.apkManifestUrlInput.text?.toString()?.trim().orEmpty()
            prefs.setApkUpdateManifestUrl(url)
            binding.checkApkUpdateButton.isEnabled = false
            binding.installApkUpdateButton.isEnabled = false
            binding.apkUpdateStatusText.setText(R.string.status_apk_checking)

            AppUpdater.checkForUpdate(this, url) { result ->
                if (isFinishing || isDestroyed) return@checkForUpdate
                binding.checkApkUpdateButton.isEnabled = true
                when (result) {
                    is AppUpdater.CheckResult.UpdateAvailable -> {
                        pendingReleaseManifest = result.manifest
                        binding.installApkUpdateButton.isEnabled = true
                        binding.apkUpdateStatusText.text = getString(
                            R.string.status_apk_update_available,
                            result.manifest.versionName,
                            result.manifest.versionCode,
                            result.manifest.releaseNotes
                        ).trim()
                    }
                    is AppUpdater.CheckResult.UpToDate -> {
                        pendingReleaseManifest = result.manifest
                        binding.installApkUpdateButton.isEnabled = true
                        binding.apkUpdateStatusText.text = getString(
                            R.string.status_apk_up_to_date,
                            result.manifest.versionName,
                            result.manifest.versionCode
                        )
                    }
                    is AppUpdater.CheckResult.Failed -> {
                        pendingReleaseManifest = null
                        binding.installApkUpdateButton.isEnabled = false
                        binding.apkUpdateStatusText.text = result.errorMessage
                    }
                }
            }
        }

        binding.installApkUpdateButton.setOnClickListener {
            val manifest = pendingReleaseManifest ?: return@setOnClickListener
            binding.checkApkUpdateButton.isEnabled = false
            binding.installApkUpdateButton.isEnabled = false
            AppUpdater.downloadAndInstallApk(
                activity = this,
                manifest = manifest,
                onProgress = { progress ->
                    if (!isFinishing && !isDestroyed) {
                        binding.apkUpdateStatusText.text = progress
                    }
                },
                onComplete = { outcome ->
                    if (isFinishing || isDestroyed) return@downloadAndInstallApk
                    binding.checkApkUpdateButton.isEnabled = true
                    binding.installApkUpdateButton.isEnabled = true
                    when (outcome) {
                        is AppUpdater.InstallOutcome.SessionCommitted -> {
                            binding.apkUpdateStatusText.setText(R.string.toast_apk_session_started)
                            Toast.makeText(this, R.string.toast_apk_session_started, Toast.LENGTH_SHORT).show()
                        }
                        is AppUpdater.InstallOutcome.Failed -> {
                            binding.apkUpdateStatusText.text = outcome.errorMessage
                            Toast.makeText(
                                this,
                                getString(R.string.toast_apk_install_failed, outcome.errorMessage),
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }
            )
        }
    }

    private fun setupCloudSyncControls() {
        binding.cloudUidInput.setText(prefs.getCloudUid())
        binding.cloudDeviceIdInput.setText(prefs.getCloudDeviceId())
        binding.cloudRefreshTokenInput.setText(prefs.getCloudRefreshToken())

        binding.cloudSyncEnabledSwitch.setOnCheckedChangeListener { _, checked ->
            if (suppressSwitchCallbacks) return@setOnCheckedChangeListener
            prefs.setCloudSyncEnabled(checked)
            refreshPolicyReadout()
        }

        binding.saveAndSyncCloudButton.setOnClickListener {
            val enabled = binding.cloudSyncEnabledSwitch.isChecked
            val uid = binding.cloudUidInput.text?.toString().orEmpty().trim()
            val deviceId = binding.cloudDeviceIdInput.text?.toString().orEmpty().trim()
            val token = binding.cloudRefreshTokenInput.text?.toString().orEmpty().trim()

            prefs.setCloudSyncEnabled(enabled)
            if (uid.isNotEmpty()) prefs.setCloudUid(uid)
            if (deviceId.isNotEmpty()) prefs.setCloudDeviceId(deviceId)
            if (token.isNotEmpty()) prefs.setCloudRefreshToken(token)

            if (!enabled) {
                refreshPolicyReadout()
                Toast.makeText(this, R.string.toast_cloud_sync_saved, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            Toast.makeText(this, R.string.toast_cloud_sync_saved, Toast.LENGTH_SHORT).show()
            CloudSyncManager.triggerSyncIfEnabled(this) { outcome ->
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    when (outcome) {
                        is CloudSyncManager.SyncOutcome.Success -> {
                            val msgRes = if (outcome.pulledRemoteDeviceSettings || outcome.pulledRemoteGrowth) {
                                reloadInstalledApps()
                                syncSwitchesFromPrefs()
                                R.string.toast_cloud_sync_pulled
                            } else {
                                R.string.toast_cloud_sync_success
                            }
                            Toast.makeText(this, msgRes, Toast.LENGTH_LONG).show()
                        }
                        is CloudSyncManager.SyncOutcome.OfflineQueued -> {
                            Toast.makeText(this, R.string.toast_cloud_sync_offline_queued, Toast.LENGTH_LONG).show()
                        }
                        is CloudSyncManager.SyncOutcome.Failed -> {
                            Toast.makeText(this, outcome.errorMessage, Toast.LENGTH_LONG).show()
                        }
                        else -> Unit
                    }
                    refreshPolicyReadout()
                }
            }
        }
    }

    private fun setupAppsList() {
        adapter = AdminAppsAdapter(
            isAllowed = { pkg -> pkg in prefs.getAllowedPackages() },
            limitSummary = { pkg -> formatAdminAppLimitReadout(pkg) },
            onToggle = { app, allowed ->
                prefs.setPackageAllowed(app.packageName, allowed)
                DevicePolicyHelper.syncLockTaskPackages(this)
                CloudSyncManager.triggerSyncIfEnabled(this)
            },
            onSetTimeLimit = { app -> showTimeLimitPickerDialog(app) },
            onLaunchLockTask = { app ->
                if (app.packageName !in prefs.getAllowedPackages()) {
                    prefs.setPackageAllowed(app.packageName, true)
                    adapter.notifyDataSetChanged()
                    CloudSyncManager.triggerSyncIfEnabled(this)
                }
                val blockReason = DevicePolicyHelper.getLaunchBlockReason(this, app.packageName)
                if (blockReason != null && !prefs.isSettingsAndUninstallUnlocked()) {
                    Toast.makeText(this, "${app.label}: $blockReason", Toast.LENGTH_LONG).show()
                    return@AdminAppsAdapter
                }
                val launched = DevicePolicyHelper.launchPackageInKioskMode(this, app.packageName)
                if (!launched) {
                    Toast.makeText(
                        this,
                        getString(R.string.toast_unable_to_launch, app.label),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            },
            onUninstallApp = { app -> showUninstallConfirmationDialog(app) }
        )

        binding.adminAppsRecycler.layoutManager = LinearLayoutManager(this)
        binding.adminAppsRecycler.adapter = adapter

        binding.adminAppsSearchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                applyAppsFilter(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: Editable?) = Unit
        })

        reloadInstalledApps()
    }

    private fun showUninstallConfirmationDialog(app: InstalledAppInfo) {
        if (!prefs.isSettingsAndUninstallUnlocked()) {
            Toast.makeText(this, R.string.error_unlock_required, Toast.LENGTH_SHORT).show()
            return
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(getString(R.string.dialog_uninstall_title, app.label))
            .setMessage(getString(R.string.dialog_uninstall_message, app.label, app.packageName))
            .setPositiveButton(R.string.action_uninstall_app) { _, _ ->
                val started = DevicePolicyHelper.uninstallPackage(this, app.packageName)
                if (started) {
                    Toast.makeText(
                        this,
                        getString(R.string.toast_uninstall_started, app.label),
                        Toast.LENGTH_SHORT
                    ).show()
                } else {
                    Toast.makeText(
                        this,
                        getString(R.string.toast_uninstall_failed, app.packageName),
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun reloadInstalledApps() {
        allNonSystemApps = InstalledAppsRepository.loadLaunchableApps(this)
            .filter { !it.isSystemRestricted }
        applyAppsFilter(binding.adminAppsSearchInput.text?.toString().orEmpty())
    }

    private fun applyAppsFilter(query: String) {
        val trimmed = query.trim().lowercase()
        val filtered = if (trimmed.isEmpty()) {
            allNonSystemApps
        } else {
            allNonSystemApps.filter { app ->
                app.label.lowercase().contains(trimmed) ||
                    app.packageName.lowercase().contains(trimmed)
            }
        }
        adapter.submitList(filtered)
    }

    private fun setupPinUpdateForm() {
        binding.savePinButton.setOnClickListener {
            val currentPin = binding.currentPinInput.text?.toString().orEmpty()
            val newPin = binding.newPinInput.text?.toString().orEmpty()
            val confirmPin = binding.confirmPinInput.text?.toString().orEmpty()

            if (newPin != confirmPin) {
                Toast.makeText(this, R.string.error_pin_mismatch, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            when (prefs.changePin(currentPin, newPin)) {
                KioskPreferences.PinChangeResult.Success -> {
                    binding.currentPinInput.text?.clear()
                    binding.newPinInput.text?.clear()
                    binding.confirmPinInput.text?.clear()
                    CloudSyncManager.triggerSyncIfEnabled(this)
                    Toast.makeText(this, R.string.toast_pin_updated, Toast.LENGTH_SHORT).show()
                }
                KioskPreferences.PinChangeResult.InvalidCurrentPin -> {
                    Toast.makeText(this, R.string.error_invalid_pin, Toast.LENGTH_SHORT).show()
                }
                KioskPreferences.PinChangeResult.InvalidFormat -> {
                    Toast.makeText(this, R.string.error_pin_format, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun setupNavigationControls() {
        binding.returnToKioskButton.setOnClickListener {
            DevicePolicyHelper.setAdminUnlockState(this, unlocked = false)
            finish()
        }
    }

    private fun setupTamperLogViewer() {
        binding.viewTamperLogsButton.setOnClickListener {
            val logs = prefs.getTamperWarningLogs()
            val body = if (logs.isEmpty()) {
                getString(R.string.empty_tamper_logs)
            } else {
                logs.joinToString("\n\n")
            }
            MaterialAlertDialogBuilder(this)
                .setTitle(R.string.dialog_tamper_logs_title)
                .setMessage(body)
                .setPositiveButton(android.R.string.ok, null)
                .show()
        }
    }

    private fun recordAdminMutationAndHandleEscalation(actionName: String) {
        val res = prefs.recordAdminSettingMutation(actionName)
        if (res.warningIssued && res.warningMessage != null) {
            Toast.makeText(this, res.warningMessage, Toast.LENGTH_LONG).show()
        }
        if (res.triggeredExtraLockoutSeconds > 0) {
            DevicePolicyHelper.setAdminUnlockState(this, unlocked = false)
            Toast.makeText(
                this,
                getString(R.string.toast_tamper_lockout, res.triggeredExtraLockoutSeconds),
                Toast.LENGTH_LONG
            ).show()
            finish()
        }
    }

    private fun showTimeLimitPickerDialog(app: InstalledAppInfo) {
        val options = arrayOf(
            getString(R.string.limit_option_unlimited),
            getString(R.string.limit_option_5m),
            getString(R.string.limit_option_15m),
            getString(R.string.limit_option_30m),
            getString(R.string.limit_option_60m),
            getString(R.string.limit_option_120m),
            getString(R.string.limit_option_reset_usage)
        )
        val minuteValues = intArrayOf(0, 5, 15, 30, 60, 120, -1)

        MaterialAlertDialogBuilder(this)
            .setTitle(getString(R.string.dialog_app_limit_title, app.label))
            .setItems(options) { _, which ->
                val chosenMinutes = minuteValues[which]
                val currentLimit = prefs.getAppDailyLimitMinutes(app.packageName)
                if (chosenMinutes == -1) {
                    if (prefs.isStrictShieldLocked()) {
                        val mins = prefs.getStrictShieldRemainingMinutes()
                        Toast.makeText(this, getString(R.string.error_strict_shield_locked, mins), Toast.LENGTH_LONG).show()
                        return@setItems
                    }
                    prefs.resetAppDailyUsage(app.packageName)
                } else {
                    val isWeakeningLimit = currentLimit > 0 && (chosenMinutes == 0 || chosenMinutes > currentLimit)
                    if (isWeakeningLimit && prefs.isStrictShieldLocked()) {
                        val mins = prefs.getStrictShieldRemainingMinutes()
                        Toast.makeText(this, getString(R.string.error_strict_shield_locked, mins), Toast.LENGTH_LONG).show()
                        return@setItems
                    }
                    prefs.setAppDailyLimitMinutes(app.packageName, chosenMinutes)
                }
                DevicePolicyHelper.enforceKioskPolicies(this)
                adapter.notifyDataSetChanged()
                refreshPolicyReadout()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun formatAdminAppLimitReadout(packageName: String): String {
        val limit = prefs.getAppDailyLimitMinutes(packageName)
        if (limit <= 0) return getString(R.string.limit_option_unlimited)
        val usedMins = prefs.getAppDailyUsageSeconds(packageName) / 60
        return getString(R.string.admin_app_limit_readout, usedMins, limit)
    }

    private fun refreshPolicyReadout() {
        val isDeviceOwner = DevicePolicyHelper.isDeviceOwner(this)
        val unlocked = prefs.isSettingsAndUninstallUnlocked()
        val mode = prefs.getKioskMode()
        binding.policySummaryText.text = buildString {
            append(
                if (isDeviceOwner) {
                    "Device Owner: Active\n"
                } else {
                    "Device Owner: Not provisioned (run adb shell dpm set-device-owner)\n"
                }
            )
            append("Mode: $mode · StatusBarBlocked: ${prefs.isStatusBarDisabled()} · KeyguardDisabled: ${prefs.isKeyguardDisabled()} · DNS: ${prefs.getFamilyDnsMode()}\n")
            append("Restrictions: DISALLOW_SAFE_BOOT, DISALLOW_FACTORY_RESET, DISALLOW_ADD_USER")
            append(if (unlocked) " (DISALLOW_APPS_CONTROL lifted)" else ", DISALLOW_APPS_CONTROL")
        }
        binding.openAndroidSettingsButton.isEnabled = unlocked

        val strictRemaining = prefs.getStrictShieldRemainingMinutes()
        binding.strictShieldStatusText.text = if (strictRemaining > 0) {
            getString(R.string.status_strict_shield_active, strictRemaining)
        } else {
            getString(R.string.status_strict_shield_unlocked)
        }

        val focusRemaining = prefs.getFocusBlockRemainingMinutes()
        val blockedToday = prefs.getBlockedAttemptsToday()
        val limitedAppsCount = prefs.getAppTimeLimitMinutesMap().size
        binding.focusBlockStatusText.text = if (focusRemaining > 0) {
            getString(R.string.status_focus_block_active, focusRemaining, limitedAppsCount, blockedToday)
        } else {
            getString(R.string.status_focus_block_idle, limitedAppsCount, blockedToday)
        }

        val tamperLogs = prefs.getTamperWarningLogs()
        binding.viewTamperLogsButton.text = getString(R.string.action_view_tamper_logs, tamperLogs.size)

        binding.cloudSyncStatusText.text = when {
            !prefs.isCloudSyncEnabled() -> getString(R.string.status_cloud_sync_disabled)
            prefs.isCloudSyncDirty() -> getString(R.string.status_cloud_sync_dirty)
            prefs.getLastCloudSyncMs() > 0L -> {
                val fmt = SimpleDateFormat("HH:mm", Locale.US).format(Date(prefs.getLastCloudSyncMs()))
                getString(R.string.status_cloud_sync_synced, fmt)
            }
            else -> getString(R.string.status_cloud_sync_ready)
        }
    }

    private class AdminAppsAdapter(
        private val isAllowed: (String) -> Boolean,
        private val limitSummary: (String) -> String,
        private val onToggle: (InstalledAppInfo, Boolean) -> Unit,
        private val onSetTimeLimit: (InstalledAppInfo) -> Unit,
        private val onLaunchLockTask: (InstalledAppInfo) -> Unit,
        private val onUninstallApp: (InstalledAppInfo) -> Unit
    ) : RecyclerView.Adapter<AdminAppsAdapter.ViewHolder>() {

        private var items: List<InstalledAppInfo> = emptyList()

        fun submitList(list: List<InstalledAppInfo>) {
            items = list
            notifyDataSetChanged()
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val binding = ItemAdminAppToggleBinding.inflate(
                LayoutInflater.from(parent.context),
                parent,
                false
            )
            return ViewHolder(binding)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            holder.bind(
                items[position],
                isAllowed,
                limitSummary,
                onToggle,
                onSetTimeLimit,
                onLaunchLockTask,
                onUninstallApp
            )
        }

        override fun getItemCount(): Int = items.size

        class ViewHolder(
            private val itemBinding: ItemAdminAppToggleBinding
        ) : RecyclerView.ViewHolder(itemBinding.root) {

            fun bind(
                app: InstalledAppInfo,
                isAllowed: (String) -> Boolean,
                limitSummary: (String) -> String,
                onToggle: (InstalledAppInfo, Boolean) -> Unit,
                onSetTimeLimit: (InstalledAppInfo) -> Unit,
                onLaunchLockTask: (InstalledAppInfo) -> Unit,
                onUninstallApp: (InstalledAppInfo) -> Unit
            ) {
                itemBinding.adminAppTitle.text = app.label
                itemBinding.adminAppPackage.text = app.packageName
                itemBinding.adminAppLimitReadout.text = limitSummary(app.packageName)
                if (app.icon != null) {
                    itemBinding.adminAppIcon.setImageDrawable(app.icon)
                } else {
                    itemBinding.adminAppIcon.setImageResource(android.R.drawable.sym_def_app_icon)
                }

                itemBinding.adminAppSwitch.setOnCheckedChangeListener(null)
                itemBinding.adminAppSwitch.isChecked = isAllowed(app.packageName)
                itemBinding.adminAppSwitch.setOnCheckedChangeListener { _, checked ->
                    onToggle(app, checked)
                }

                itemBinding.setAppLimitButton.setOnClickListener {
                    onSetTimeLimit(app)
                }

                itemBinding.launchLockTaskButton.setOnClickListener {
                    onLaunchLockTask(app)
                }

                itemBinding.uninstallAppButton.setOnClickListener {
                    onUninstallApp(app)
                }
            }
        }
    }
}
