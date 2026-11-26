package com.kiosk.launcher.ui

import android.app.admin.DevicePolicyManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.switchmaterial.SwitchMaterial
import com.google.android.material.textfield.TextInputEditText
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.admin.KioskDeviceAdminReceiver
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.schedule.ScheduleController
import com.kiosk.launcher.schedule.ScheduleParse
import com.kiosk.launcher.update.UpdateInstaller
import com.kiosk.launcher.update.UpdateManager
import com.kiosk.launcher.update.UpdateManifest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AdminSettingsActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var policy: DevicePolicyHelper
    private lateinit var appRepo: InstalledAppsRepository
    private lateinit var updates: UpdateManager

    private lateinit var strongRestrictionsContainer: LinearLayout
    private lateinit var locksContainer: LinearLayout
    private lateinit var appsContainer: LinearLayout
    private lateinit var allowAllSwitch: SwitchMaterial
    private lateinit var modeGroup: MaterialButtonToggleGroup
    private lateinit var domainsInput: TextInputEditText
    private lateinit var blockedKeywordsInput: TextInputEditText
    private lateinit var clearPanicButton: View
    private lateinit var modeHint: TextView
    private lateinit var policyLog: TextView
    private lateinit var defaultLauncherSwitch: SwitchMaterial
    private lateinit var defaultLauncherDetail: TextView
    private lateinit var kioskStateDetail: TextView
    private lateinit var releaseOwnerButton: View
    private lateinit var appPinState: TextView
    private lateinit var appPinButton: MaterialButton
    private lateinit var clearAppPinButton: View
    private lateinit var lockScreenSwitch: SwitchMaterial
    private lateinit var lockNoteInput: TextInputEditText
    private lateinit var lockQuickLaunchDetail: TextView
    private lateinit var scheduleSwitch: SwitchMaterial
    private lateinit var scheduleWindowsInput: TextInputEditText
    private lateinit var scheduleHint: TextView
    private lateinit var allowListDayGroup: MaterialButtonToggleGroup
    private lateinit var allowListScopeHint: TextView

    /** Which list the allowlist rows edit once a schedule is on. */
    private var editingWeekendList = false

    /** Guards the schedule switch while it is synced to the stored state. */
    private var syncingScheduleSwitch = false

    /** Guards the lock screen switch while it is synced to the stored state. */
    private var syncingLockScreenSwitch = false

    private lateinit var adminWindowValue: TextView
    private lateinit var adminWindowHint: TextView
    private lateinit var updateStatus: TextView
    private lateinit var updateDetail: TextView
    private lateinit var updateProgress: LinearProgressIndicator
    private lateinit var updateCheckButton: View
    private lateinit var updateInstallButton: View
    private lateinit var updateFeedInput: TextInputEditText
    private lateinit var updateCustomSourceToggle: View
    private lateinit var updateCustomSourceContainer: View

    private var availableUpdate: UpdateManifest? = null
    private var availableUpdateFeedUrl: String? = null
    private var updateInProgress = false

    /** Guards the switch listener while it is being synced to the observed state. */
    private var syncingLauncherSwitch = false

    /** The system Home picker is open and its answer is not in yet. */
    private var pendingHomeRequest = false

    /** Bumped per scan so a slow, stale result can't repaint the list. */
    private var allowListRequest = 0
    private var loadedApps: List<AppEntry> = emptyList()

    private val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())

    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_admin_settings)

        prefs = KioskPreferences(this)
        policy = DevicePolicyHelper(this)
        appRepo = InstalledAppsRepository(this)
        updates = UpdateManager(this)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
        toolbar.setNavigationOnClickListener { finish() }

        strongRestrictionsContainer = findViewById(R.id.strongRestrictionsContainer)
        locksContainer = findViewById(R.id.locksContainer)
        appsContainer = findViewById(R.id.appsContainer)
        allowAllSwitch = findViewById(R.id.allowAllSwitch)
        modeGroup = findViewById(R.id.modeGroup)
        domainsInput = findViewById(R.id.domainsInput)
        blockedKeywordsInput = findViewById(R.id.blockedKeywordsInput)
        clearPanicButton = findViewById(R.id.clearPanicButton)
        modeHint = findViewById(R.id.modeHint)
        policyLog = findViewById(R.id.policyLog)
        defaultLauncherSwitch = findViewById(R.id.defaultLauncherSwitch)
        defaultLauncherDetail = findViewById(R.id.defaultLauncherDetail)
        scheduleSwitch = findViewById(R.id.scheduleSwitch)
        scheduleWindowsInput = findViewById(R.id.scheduleWindowsInput)
        scheduleHint = findViewById(R.id.scheduleHint)
        allowListDayGroup = findViewById(R.id.allowListDayGroup)
        allowListScopeHint = findViewById(R.id.allowListScopeHint)
        kioskStateDetail = findViewById(R.id.kioskStateDetail)
        releaseOwnerButton = findViewById(R.id.releaseOwnerButton)
        releaseOwnerButton.setOnClickListener { confirmReleaseOwner() }

        appPinState = findViewById(R.id.appPinState)
        appPinButton = findViewById(R.id.appPinButton)
        clearAppPinButton = findViewById(R.id.clearAppPinButton)
        lockScreenSwitch = findViewById(R.id.lockScreenSwitch)
        lockNoteInput = findViewById(R.id.lockNoteInput)
        lockQuickLaunchDetail = findViewById(R.id.lockQuickLaunchDetail)

        appPinButton.setOnClickListener { promptForAppPin() }
        clearAppPinButton.setOnClickListener { confirmClearAppPin() }
        findViewById<View>(R.id.lockNoteSave).setOnClickListener { saveLockScreenNote() }
        findViewById<View>(R.id.lockQuickLaunchButton).setOnClickListener { chooseQuickLaunchApps() }
        findViewById<View>(R.id.lockPreviewButton).setOnClickListener { previewLockScreen() }
        lockScreenSwitch.setOnCheckedChangeListener { _, checked ->
            if (syncingLockScreenSwitch) return@setOnCheckedChangeListener
            setCustomLockScreen(checked)
        }

        adminWindowValue = findViewById(R.id.adminWindowValue)
        adminWindowHint = findViewById(R.id.adminWindowHint)
        updateStatus = findViewById(R.id.updateStatus)
        updateDetail = findViewById(R.id.updateDetail)
        updateProgress = findViewById(R.id.updateProgress)
        updateCheckButton = findViewById(R.id.updateCheckButton)
        updateInstallButton = findViewById(R.id.updateInstallButton)
        updateFeedInput = findViewById(R.id.updateFeedInput)
        updateCustomSourceToggle = findViewById(R.id.updateCustomSourceToggle)
        updateCustomSourceContainer = findViewById(R.id.updateCustomSourceContainer)
        updateCustomSourceContainer.visibility =
            if (prefs.updateFeedUrl.isNotBlank()) View.VISIBLE else View.GONE
        updateCustomSourceToggle.setOnClickListener {
            updateCustomSourceContainer.visibility =
                if (updateCustomSourceContainer.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }

        findViewById<View>(R.id.adminWindowMinus).setOnClickListener { stepAdminWindow(-1) }
        findViewById<View>(R.id.adminWindowPlus).setOnClickListener { stepAdminWindow(1) }
        updateCheckButton.setOnClickListener { checkForUpdates(manual = true) }
        updateInstallButton.setOnClickListener { installAvailableUpdate() }
        findViewById<View>(R.id.updateFeedSave).setOnClickListener { saveUpdateFeed() }

        defaultLauncherSwitch.setOnCheckedChangeListener { _, checked ->
            if (syncingLauncherSwitch) return@setOnCheckedChangeListener
            if (checked) requestDefaultLauncher() else dropDefaultLauncher()
        }

        findViewById<View>(R.id.changePinButton).setOnClickListener { changePin() }
        findViewById<View>(R.id.copyCommandButton).setOnClickListener { copyProvisionCommand() }
        findViewById<View>(R.id.activateAdminButton).setOnClickListener { activateDeviceAdmin() }
        findViewById<View>(R.id.openSystemSettingsButton).setOnClickListener { openSystemSettings() }
        clearPanicButton.setOnClickListener {
            prefs.clearPanicLockdown()
            policy.applyPolicy()
            renderRecoveryState()
            renderPolicyLog()
            toast(getString(R.string.panic_cleared))
        }
        findViewById<View>(R.id.openBrowserButton).setOnClickListener {
            startActivity(Intent(this, KioskBrowserActivity::class.java))
        }
        findViewById<View>(R.id.diagnosticsButton).setOnClickListener {
            startActivity(Intent(this, DiagnosticsActivity::class.java))
        }
        findViewById<View>(R.id.domainsSave).setOnClickListener { saveBrowserFilters() }

        domainsInput.setText(prefs.domains().sorted().joinToString("\n"))
        blockedKeywordsInput.setText(prefs.blockedKeywords().sorted().joinToString("\n"))

        renderOwner()
        renderDefaultLauncher()
        renderRecoveryState()
        renderAdminWindow()
        renderUpdate()
        renderMode()
        renderStrongRestrictions()
        renderLocks()
        renderAllowList()
        renderSchedule()
        renderAppPin()
        renderLockScreen()

        modeGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            prefs.kioskMode = when (checkedId) {
                R.id.modeSingle -> KioskPreferences.MODE_SINGLE
                R.id.modeBrowser -> KioskPreferences.MODE_BROWSER
                else -> KioskPreferences.MODE_MULTI
            }
            policy.applyPolicy()
            modeHint.text = modeDescription(prefs.kioskMode)
        }

        allowAllSwitch.setOnCheckedChangeListener { _, checked ->
            prefs.allowAllApps = checked
            policy.applyPolicy()
            if (loadedApps.isEmpty()) renderAllowList() else renderAllowListRows(loadedApps)
        }

        scheduleSwitch.setOnCheckedChangeListener { _, checked -> setScheduleEnabled(checked) }
        findViewById<View>(R.id.scheduleSave).setOnClickListener { saveSchedule() }
        allowListDayGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            editingWeekendList = checkedId == R.id.allowListWeekends
            renderAllowListRows(loadedApps)
        }
    }

    override fun onResume() {
        super.onResume()
        // Adopt the opt-in only once Android really resolves Home to this app, so a
        // dismissed system prompt cannot leave an enabled kiosk that owns nothing.
        if (pendingHomeRequest) {
            pendingHomeRequest = false
            if (policy.isDefaultLauncher && prefs.kioskEnabled != true) {
                prefs.kioskEnabled = true
                prefs.logPolicy(getString(R.string.log_default_launcher_on))
            }
        }
        // Coming back from the system Home picker can change which policy applies.
        policy.applyPolicy()
        renderDefaultLauncher()
        renderRecoveryState()
        renderAdminWindow()
        scheduleAdminWindowTick()
        renderSchedule()
        renderPolicyLog()
        // Jumped here from the launcher's update banner: land on the right section.
        if (intent?.getIntExtra(EXTRA_UPDATE_VERSION, 0)?.let { it > 0 } == true) {
            intent?.removeExtra(EXTRA_UPDATE_VERSION)
            if (availableUpdate == null) checkForUpdates(manual = true)
        }
    }

    override fun onStop() {
        super.onStop()
        handler.removeCallbacks(adminWindowTick)
    }

    // ---------------------------------------------------------------- provisioning
    private fun renderOwner() {
        val status = findViewById<TextView>(R.id.ownerStatus)
        val detail = findViewById<TextView>(R.id.ownerDetail)

        if (policy.isDeviceOwner) {
            status.setText(R.string.owner_active_title)
            detail.setText(R.string.owner_active_detail)
        } else {
            status.setText(R.string.owner_preview_title)
            detail.text = getString(R.string.owner_preview_detail_fmt, DevicePolicyHelper.PROVISION_COMMAND)
        }
        // The way out only exists while this app really owns the device.
        releaseOwnerButton.visibility = if (policy.isDeviceOwner) View.VISIBLE else View.GONE
    }

    /**
     * Hands ownership back so this phone can be uninstalled without adb or a factory reset.
     * The system uninstaller is offered right after, because that is what this is for; the
     * app stays usable as an ordinary launcher if the admin chooses to keep it.
     */
    private fun confirmReleaseOwner() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.release_owner_confirm_title)
            .setMessage(R.string.release_owner_confirm_body)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.release_owner_confirm_action) { _, _ -> releaseOwner() }
            .show()
    }

    private fun releaseOwner() {
        if (policy.isInLockTaskMode()) policy.stopKiosk(this)
        val result = policy.relinquishDeviceOwner()
        renderOwner()
        renderDefaultLauncher()
        renderRecoveryState()
        renderPolicyLog()

        when (result) {
            DevicePolicyHelper.OwnershipRelease.RELEASED -> showReleasedDialog()
            DevicePolicyHelper.OwnershipRelease.NOT_OWNER ->
                toast(getString(R.string.release_owner_not_owner))
            DevicePolicyHelper.OwnershipRelease.FAILED ->
                MaterialAlertDialogBuilder(this)
                    .setTitle(R.string.release_owner_failed_title)
                    .setMessage(R.string.release_owner_failed_body)
                    .setPositiveButton(android.R.string.ok, null)
                    .show()
        }
    }

    private fun showReleasedDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.release_owner_done_title)
            .setMessage(R.string.release_owner_done_body)
            .setNegativeButton(R.string.release_owner_later, null)
            .setPositiveButton(R.string.release_owner_uninstall) { _, _ -> openUninstaller() }
            .show()
    }

    private fun openUninstaller() {
        val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName"))
        if (!runCatching { startActivity(intent); true }.getOrDefault(false)) {
            toast(getString(R.string.release_owner_uninstall_manual))
        }
    }

    // --------------------------------------------------------------- default home
    private fun renderDefaultLauncher() {
        val active = policy.isDefaultLauncher
        syncingLauncherSwitch = true
        defaultLauncherSwitch.isChecked = active
        syncingLauncherSwitch = false
        defaultLauncherDetail.text = getString(
            if (active) R.string.default_launcher_on else R.string.default_launcher_off
        )
        renderKioskState()
    }

    /** The explicit kiosk state, which survives a launcher change until Admin changes it. */
    private fun renderKioskState() {
        val enabled = prefs.kioskEnabled == true
        kioskStateDetail.setText(
            when {
                !enabled -> R.string.kiosk_state_off
                policy.isDefaultLauncher -> R.string.kiosk_state_on
                else -> R.string.kiosk_state_pending
            }
        )
    }

    private fun requestDefaultLauncher() {
        // A device owner can pin Home silently; anyone else confirms in the system prompt.
        if (policy.pinAsHomeLauncher()) {
            prefs.kioskEnabled = true
            prefs.logPolicy(getString(R.string.log_default_launcher_on))
            toast(getString(R.string.default_launcher_set))
            // Kiosk policy starts with Home ownership; apply it now instead of on reboot.
            policy.applyPolicy()
            renderDefaultLauncher()
            renderPolicyLog()
            return
        }
        // Keep the state off until the system picker confirms Home ownership.
        pendingHomeRequest = true
        if (!openDefaultLauncherSettings(policy.homePickerIntent())) {
            pendingHomeRequest = false
            toast(getString(R.string.default_launcher_manual))
            renderDefaultLauncher()
            return
        }
        toast(getString(R.string.default_launcher_confirm))
    }

    private fun dropDefaultLauncher() {
        prefs.kioskEnabled = false
        pendingHomeRequest = false
        if (policy.isInLockTaskMode()) policy.stopKiosk(this)
        val cleared = policy.clearHomeLauncher()
        // The recorded off state releases policy whether or not Home changes, so a
        // non-owner — or a launcher the user picked in system settings — is not left
        // restricted behind an "Off" label.
        policy.applyPolicy()
        renderDefaultLauncher()
        renderPolicyLog()
        if (cleared) {
            prefs.logPolicy(getString(R.string.log_default_launcher_off))
            toast(getString(R.string.default_launcher_cleared))
            return
        }
        // Home can only be changed by the user here, so show them where it lives — and
        // point at a different Home app, since this branch is the way back out.
        openDefaultLauncherSettings(Intent(Settings.ACTION_HOME_SETTINGS))
        toast(getString(R.string.default_launcher_manual_off))
    }

    private fun openDefaultLauncherSettings(intent: Intent): Boolean {
        if (policy.isInLockTaskMode()) {
            prefs.grantTemporaryAdminWindow(prefs.adminUnlockMinutes)
            policy.applyPolicy()
            policy.stopKiosk(this)
        }
        return runCatching { startActivity(intent); true }.getOrDefault(false) ||
            runCatching { startActivity(Intent(Settings.ACTION_HOME_SETTINGS)); true }.getOrDefault(false)
    }

    private fun renderRecoveryState() {
        clearPanicButton.visibility = if (prefs.isPanicLocked()) View.VISIBLE else View.GONE
    }

    private fun openSystemSettings() {
        // The window length is whatever the admin set with +/−; it also closes on its own
        // from the launcher, so it can no longer stay open indefinitely.
        prefs.grantTemporaryAdminWindow(prefs.adminUnlockMinutes)
        policy.applyPolicy()
        runCatching {
            if (policy.isInLockTaskMode()) policy.stopKiosk(this)
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        toast(getString(R.string.system_settings_unlocked_toast_fmt, prefs.adminUnlockMinutes))
        renderAdminWindow()
        renderPolicyLog()
    }

    // ------------------------------------------------------- temporary admin window
    private fun renderAdminWindow() {
        val minutes = prefs.adminUnlockMinutes
        adminWindowValue.text = getString(R.string.admin_window_value_fmt, minutes)
        val remaining = prefs.adminUnlockRemainingSeconds()
        adminWindowHint.text = if (remaining > 0) {
            getString(R.string.admin_window_remaining_fmt, (remaining + 59) / 60)
        } else {
            getString(R.string.admin_window_desc)
        }
    }

    /**
     * Keeps the hint honest while this screen stays open. The alarm and the launcher close the
     * window on their own; without this the hint kept advertising the remaining minutes after
     * the window had already ended, which reads as an unlock that never expires.
     */
    private fun scheduleAdminWindowTick() {
        handler.removeCallbacks(adminWindowTick)
        if (prefs.isAdminTemporarilyUnlocked()) handler.postDelayed(adminWindowTick, 5_000L)
    }

    private val adminWindowTick = object : Runnable {
        override fun run() {
            if (prefs.isAdminTemporarilyUnlocked()) {
                renderAdminWindow()
                handler.postDelayed(this, 5_000L)
                return
            }
            // The window ran out while this screen was open: close it here too, in case the
            // alarm was never delivered.
            if (prefs.adminUnlockedUntilMs == 0L) {
                renderAdminWindow()
                return
            }
            prefs.endTemporaryAdminWindow()
            policy.applyPolicy()
            renderAdminWindow()
            renderPolicyLog()
            toast(getString(R.string.admin_window_closed))
        }
    }

    private fun stepAdminWindow(direction: Int) {
        prefs.adminUnlockMinutes =
            prefs.adminUnlockMinutes + direction * KioskPreferences.ADMIN_UNLOCK_STEP_MINUTES
        renderAdminWindow()
    }

    private fun copyProvisionCommand() {
        val clipboard = getSystemService(ClipboardManager::class.java)
        clipboard?.setPrimaryClip(
            ClipData.newPlainText(
                getString(R.string.clipboard_label_provision),
                DevicePolicyHelper.PROVISION_COMMAND
            )
        )
        toast(getString(R.string.provision_copied))
    }

    private fun activateDeviceAdmin() {
        if (policy.isAdminActive) {
            toast(getString(R.string.admin_already_active))
            return
        }
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(
                DevicePolicyManager.EXTRA_DEVICE_ADMIN,
                ComponentName(this, KioskDeviceAdminReceiver::class.java)
            )
            .putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                getString(R.string.admin_explanation)
            )
        runCatching { startActivity(intent) }
    }

    // ---------------------------------------------------------------- in-app update
    private fun renderUpdate() {
        val installed = getString(
            R.string.update_installed_fmt,
            updates.installedVersionName(),
            updates.installedVersionCode()
        )
        updateFeedInput.setText(prefs.updateFeedUrl)

        val available = availableUpdate
        when {
            updateInProgress -> Unit
            available != null && updates.isUpdateAvailable(available) -> {
                updateStatus.setText(R.string.update_available_title)
                updateDetail.text = getString(
                    R.string.update_available_detail_fmt,
                    available.versionName,
                    available.versionCode,
                    available.sizeBytes / (1024 * 1024)
                )
                updateInstallButton.visibility = View.VISIBLE
            }
            else -> {
                updateStatus.text = installed
                updateDetail.setText(R.string.update_up_to_date)
                updateInstallButton.visibility = View.GONE
            }
        }
        updateProgress.visibility = View.GONE
        updateCheckButton.isEnabled = !updateInProgress
    }

    private fun checkForUpdates(manual: Boolean) {
        if (updateInProgress) return
        if (manual) {
            updateStatus.setText(R.string.update_checking)
            updateDetail.text = ""
            updateCheckButton.isEnabled = false
        }
        updates.checkDetailed { outcome ->
            if (isFinishing || isDestroyed) return@checkDetailed
            when (outcome) {
                is UpdateManager.CheckOutcome.Success -> {
                    availableUpdate = outcome.manifest
                    availableUpdateFeedUrl = outcome.resolvedFeedUrl
                    renderUpdate()
                    if (manual && updates.isUpdateAvailable(outcome.manifest)) {
                        runInstall(outcome.manifest)
                    }
                }
                is UpdateManager.CheckOutcome.Error -> {
                    availableUpdate = null
                    availableUpdateFeedUrl = null
                    renderUpdate()
                    if (manual) {
                        updateStatus.setText(R.string.update_check_failed)
                        updateDetail.text = getString(R.string.update_check_failed_detail_fmt, outcome.reason)
                    }
                }
            }
        }
    }

    private fun installAvailableUpdate() {
        val manifest = availableUpdate ?: return
        if (!updates.isUpdateAvailable(manifest)) return

        val notes = getString(
            R.string.update_confirm_body_fmt,
            manifest.versionName,
            manifest.versionCode
        )
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.update_confirm_title)
            .setMessage(notes)
            .setNegativeButton(R.string.cancel, null)
            .setNeutralButton(R.string.update_later) { _, _ ->
                updates.skip(manifest)
                availableUpdate = null
                renderUpdate()
            }
            .setPositiveButton(R.string.update_now) { _, _ -> runInstall(manifest) }
            .show()
    }

    private fun runInstall(manifest: UpdateManifest) {
        updateInProgress = true
        updateInstallButton.visibility = View.GONE
        updateCheckButton.isEnabled = false
        updateProgress.visibility = View.VISIBLE
        updateProgress.isIndeterminate = true
        updateStatus.setText(R.string.update_downloading)
        updateDetail.text = ""

        updates.downloadAndInstall(
            this,
            manifest,
            resolvedFeedUrl = availableUpdateFeedUrl
        ) { event ->
            if (isFinishing || isDestroyed) return@downloadAndInstall
            when (event) {
                is UpdateInstaller.Event.Progress -> {
                    updateProgress.isIndeterminate = false
                    updateProgress.progress = event.percent
                    updateDetail.text = getString(R.string.update_progress_fmt, event.percent)
                }
                is UpdateInstaller.Event.Failed -> {
                    updateInProgress = false
                    updateProgress.visibility = View.GONE
                    updateCheckButton.isEnabled = true
                    updateStatus.setText(R.string.update_failed)
                    updateDetail.text = event.reason
                }
                UpdateInstaller.Event.ReadyToInstall -> {
                    updateProgress.isIndeterminate = true
                    updateStatus.setText(R.string.update_installing)
                }
                is UpdateInstaller.Event.NeedsUserAction -> {
                    updateInProgress = false
                    updateProgress.visibility = View.GONE
                    updateStatus.setText(R.string.update_needs_confirm)
                    updateDetail.setText(R.string.update_needs_confirm_detail)
                    updateInstallButton.visibility = View.VISIBLE
                    updateCheckButton.isEnabled = true
                }
                UpdateInstaller.Event.Installed -> {
                    updateInProgress = false
                    updateProgress.visibility = View.GONE
                    updateStatus.setText(R.string.update_installed_again)
                    updateCheckButton.isEnabled = true
                }
            }
        }
    }

    private fun saveUpdateFeed() {
        val raw = updateFeedInput.text?.toString().orEmpty().trim()
        prefs.updateFeedUrl = raw
        prefs.lastUpdateCheckMs = 0L
        availableUpdate = null
        availableUpdateFeedUrl = null
        toast(getString(if (raw.isEmpty()) R.string.update_feed_cleared else R.string.update_feed_saved))
        renderUpdate()
    }

    // ----------------------------------------------------------------------- mode
    private fun renderMode() {
        val checked = when (prefs.kioskMode) {
            KioskPreferences.MODE_SINGLE -> R.id.modeSingle
            KioskPreferences.MODE_BROWSER -> R.id.modeBrowser
            else -> R.id.modeMulti
        }
        modeGroup.check(checked)
        modeHint.text = modeDescription(prefs.kioskMode)
    }

    private fun modeDescription(mode: String): String = when (mode) {
        KioskPreferences.MODE_SINGLE -> getString(R.string.mode_desc_single)
        KioskPreferences.MODE_BROWSER -> getString(R.string.mode_desc_browser)
        else -> getString(R.string.mode_desc_multi)
    }

    // --------------------------------------------------------- strong restrictions
    private fun renderStrongRestrictions() {
        strongRestrictionsContainer.removeAllViews()
        addToggle(
            strongRestrictionsContainer,
            getString(R.string.restriction_safe_boot),
            getString(R.string.restriction_safe_boot_desc),
            prefs.disallowSafeBoot
        ) {
            prefs.disallowSafeBoot = it
            applyLocks()
        }
        addToggle(
            strongRestrictionsContainer,
            getString(R.string.restriction_factory_reset),
            getString(R.string.restriction_factory_reset_desc),
            prefs.disallowFactoryReset
        ) {
            prefs.disallowFactoryReset = it
            applyLocks()
        }
        addToggle(
            strongRestrictionsContainer,
            getString(R.string.restriction_add_user),
            getString(R.string.restriction_add_user_desc),
            prefs.disallowAddUser
        ) {
            prefs.disallowAddUser = it
            applyLocks()
        }
        addToggle(
            strongRestrictionsContainer,
            getString(R.string.restriction_apps_control),
            getString(R.string.restriction_apps_control_desc),
            prefs.disallowAppsControl
        ) {
            prefs.disallowAppsControl = it
            applyLocks()
            if (!it) policy.forceReleaseAppControl()
        }
    }

    // ---------------------------------------------------------------------- locks
    private fun renderLocks() {
        locksContainer.removeAllViews()
        addToggle(
            locksContainer,
            getString(R.string.lock_status_bar),
            getString(R.string.lock_status_bar_desc),
            prefs.statusBarLocked
        ) {
            prefs.statusBarLocked = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_keyguard),
            getString(R.string.lock_keyguard_desc),
            prefs.keyguardDisabled
        ) {
            prefs.keyguardDisabled = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_camera),
            getString(R.string.lock_camera_desc),
            prefs.cameraDisabled
        ) {
            prefs.cameraDisabled = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_screenshots),
            getString(R.string.lock_screenshots_desc),
            prefs.screenCaptureDisabled
        ) {
            prefs.screenCaptureDisabled = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_usb),
            getString(R.string.lock_usb_desc),
            prefs.usbLocked
        ) {
            prefs.usbLocked = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_date_time),
            getString(R.string.lock_date_time_desc),
            prefs.dateTimeLocked
        ) {
            prefs.dateTimeLocked = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_stay_awake),
            getString(R.string.lock_stay_awake_desc),
            prefs.stayAwake
        ) {
            prefs.stayAwake = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_unsupported_browsers),
            getString(R.string.lock_unsupported_browsers_desc),
            prefs.blockUnsupportedBrowsers
        ) {
            prefs.blockUnsupportedBrowsers = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_short_feeds),
            getString(R.string.lock_short_feeds_desc),
            prefs.blockShortFormFeeds
        ) {
            prefs.blockShortFormFeeds = it
            applyLocks()
        }
        addToggle(
            locksContainer,
            getString(R.string.lock_window_guard),
            getString(R.string.lock_window_guard_desc),
            prefs.guardEnabled
        ) { enabled ->
            prefs.guardEnabled = enabled
            prefs.logPolicy(getString(if (enabled) R.string.log_guard_enabled else R.string.log_guard_disabled))
            if (enabled) {
                if (policy.isInLockTaskMode()) {
                    prefs.grantTemporaryAdminWindow(prefs.adminUnlockMinutes)
                    policy.applyPolicy()
                    policy.stopKiosk(this)
                }
                runCatching {
                    startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                }
                toast(getString(R.string.accessibility_prompt_toast))
            }
            renderPolicyLog()
        }
    }

    private fun applyLocks() {
        policy.applyPolicy()
        renderPolicyLog()
    }

    private fun addToggle(
        target: LinearLayout,
        title: String,
        subtitle: String,
        initial: Boolean,
        onChange: (Boolean) -> Unit
    ) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))
        }

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        column.addView(TextView(this).apply {
            text = title
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
            setTextColor(colorOf(R.color.text_primary))
            textSize = 14f
        })
        column.addView(TextView(this).apply {
            text = subtitle
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
            setTextColor(colorOf(R.color.text_secondary))
            textSize = 11f
        })

        val switch = SwitchMaterial(this).apply {
            isChecked = initial
            setOnCheckedChangeListener { _, checked -> onChange(checked) }
        }

        row.addView(column)
        row.addView(switch)
        target.addView(row)
    }

    // ------------------------------------------------------------------ allowlist
    private fun renderAllowList() {
        val request = ++allowListRequest
        appsContainer.removeAllViews()
        allowAllSwitch.isChecked = prefs.allowAllApps

        appRepo.launchableAsync { installed ->
            if (request != allowListRequest || isFinishing || isDestroyed) return@launchableAsync
            loadedApps = installed
            renderAllowListRows(installed)
        }
    }

    private fun renderAllowListRows(installed: List<AppEntry>) {
        appsContainer.removeAllViews()
        if (installed.isEmpty()) {
            appsContainer.addView(TextView(this).apply {
                setText(R.string.no_launchable_apps_short)
                textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                setTextColor(colorOf(R.color.text_secondary))
                textSize = 13f
                setPadding(0, dp(8), 0, dp(8))
            })
            return
        }

        installed.forEach { entry ->
            val row = layoutInflater.inflate(R.layout.item_admin_app_toggle, appsContainer, false)
            row.findViewById<ImageView>(R.id.toggleIcon).setImageDrawable(entry.icon)
            row.findViewById<TextView>(R.id.toggleLabel).text = entry.label

            // With a schedule on, the rows edit the weekday or weekend list the admin picked;
            // the old single list still drives everything while the schedule is off.
            val scheduleOn = prefs.scheduleEnabled
            val weekend = scheduleOn && editingWeekendList
            val switch = row.findViewById<SwitchMaterial>(R.id.toggleSwitch)
            switch.isChecked = if (scheduleOn) {
                prefs.isDayAllowed(entry.packageName, weekend)
            } else {
                prefs.isAllowed(entry.packageName)
            }
            switch.isEnabled = !prefs.allowAllApps
            switch.setOnCheckedChangeListener { _, checked ->
                if (scheduleOn) {
                    prefs.setDayAllowed(entry.packageName, checked, weekend)
                } else {
                    prefs.setAppAllowed(entry.packageName, checked)
                }
                // A disallowed app cannot be opened, so it must not keep a hidden lock.
                if (!checked) prefs.setAppProtected(entry.packageName, false)
                policy.applyPolicy()
                renderProtectionRow(row, entry, installed)
                renderPolicyLog()
            }

            renderProtectionRow(row, entry, installed)
            if (prefs.allowAllApps) row.alpha = 0.55f
            appsContainer.addView(row)
        }
    }

    // ---------------------------------------------------------------- kiosk schedule
    private fun renderSchedule() {
        syncingScheduleSwitch = true
        scheduleSwitch.isChecked = prefs.scheduleEnabled
        syncingScheduleSwitch = false
        // Only replace the text when it is not already what is stored, so an unsaved edit survives
        // a resume of this screen.
        if (scheduleWindowsInput.text?.toString().orEmpty() != prefs.scheduleWindows) {
            scheduleWindowsInput.setText(prefs.scheduleWindows)
        }

        val on = prefs.scheduleEnabled
        allowListDayGroup.visibility = if (on) View.VISIBLE else View.GONE
        allowListScopeHint.visibility = if (on) View.VISIBLE else View.GONE
        if (on) {
            allowListDayGroup.check(
                if (editingWeekendList) R.id.allowListWeekends else R.id.allowListWeekdays
            )
        }

        scheduleHint.text = when (val parsed = prefs.scheduleWindowsParsed()) {
            is ScheduleParse.Invalid -> getString(R.string.schedule_invalid_fmt, parsed.lineNumber)
            is ScheduleParse.Parsed -> when {
                !on -> getString(R.string.schedule_state_off)
                parsed.windows.isEmpty() -> getString(R.string.schedule_state_empty)
                prefs.isKioskActiveNow() -> getString(R.string.schedule_state_kiosk)
                else -> getString(R.string.schedule_state_open)
            }
        }
    }

    private fun setScheduleEnabled(enabled: Boolean) {
        if (syncingScheduleSwitch || prefs.scheduleEnabled == enabled) return
        prefs.scheduleEnabled = enabled
        // The first schedule reuses the list the admin already curated instead of starting empty.
        if (enabled) prefs.seedDayListsFromLegacyAllowlist()
        prefs.logPolicy(getString(if (enabled) R.string.log_schedule_on else R.string.log_schedule_off))
        policy.applyPolicy()
        ScheduleController.refresh(this)
        renderSchedule()
        renderKioskState()
        if (loadedApps.isEmpty()) renderAllowList() else renderAllowListRows(loadedApps)
        renderPolicyLog()
    }

    private fun saveSchedule() {
        prefs.scheduleWindows = scheduleWindowsInput.text?.toString().orEmpty()
        prefs.logPolicy(getString(R.string.log_schedule_saved))
        policy.applyPolicy()
        ScheduleController.refresh(this)
        renderSchedule()
        renderPolicyLog()
        toast(getString(R.string.schedule_saved))
    }

    // -------------------------------------------------- per-app password gate
    private fun renderAppPin() {
        val set = prefs.hasAppPin()
        appPinState.setText(if (set) R.string.app_pin_state_set else R.string.app_pin_state_unset)
        appPinButton.setText(
            if (set) R.string.app_pin_change_action else R.string.app_pin_set_action
        )
        clearAppPinButton.visibility = if (set) View.VISIBLE else View.GONE
    }

    /**
     * The "Require Password" switch only means something for an allowed app, so it is
     * hidden otherwise. Turning it on without a password first asks the admin for one,
     * because a lock with no password would make the app impossible to open.
     */
    private fun renderProtectionRow(row: View, entry: AppEntry, installed: List<AppEntry>) {
        val container = row.findViewById<View>(R.id.requirePasswordRow)
        val lockSwitch = row.findViewById<SwitchMaterial>(R.id.requirePasswordSwitch)
        // Being on either day list is enough for the lock row, even if that list is not the one
        // being edited or not the one today's window uses.
        val allowed = prefs.isAllowlistedAnywhere(entry.packageName)
        container.visibility = if (allowed) View.VISIBLE else View.GONE
        lockSwitch.isEnabled = allowed

        lockSwitch.setOnCheckedChangeListener(null)
        lockSwitch.isChecked = prefs.protectedPackages().contains(entry.packageName)
        lockSwitch.setOnCheckedChangeListener { button, checked ->
            if (!checked) {
                prefs.setAppProtected(entry.packageName, false)
                renderPolicyLog()
                return@setOnCheckedChangeListener
            }
            if (!prefs.hasAppPin()) {
                // Stay unlocked until a password exists, then apply the lock on save.
                button.isChecked = false
                toast(getString(R.string.app_pin_required_toast))
                promptForAppPin {
                    prefs.setAppProtected(entry.packageName, true)
                    prefs.logPolicy(getString(R.string.log_app_protected_fmt, entry.label))
                    renderPolicyLog()
                    renderAllowListRows(installed)
                }
                return@setOnCheckedChangeListener
            }
            prefs.setAppProtected(entry.packageName, true)
            prefs.logPolicy(getString(R.string.log_app_protected_fmt, entry.label))
            renderPolicyLog()
        }
    }

    private fun promptForAppPin(onSaved: () -> Unit = {}) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            filters = arrayOf(InputFilter.LengthFilter(KioskPreferences.MAX_PIN_LENGTH))
            setHint(R.string.app_pin_hint)
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
            setPadding(dp(24), dp(12), dp(24), dp(4))
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.app_pin_dialog_title)
            .setMessage(R.string.app_pin_admin_desc)
            .setView(input)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.save) { _, _ ->
                val pin = input.text?.toString().orEmpty()
                if (pin.length !in KioskPreferences.MIN_PIN_LENGTH..KioskPreferences.MAX_PIN_LENGTH ||
                    pin.isBlank()
                ) {
                    toast(getString(R.string.passcode_length_error))
                    return@setPositiveButton
                }
                prefs.setAppPin(pin)
                prefs.logPolicy(getString(R.string.log_app_pin_set))
                renderAppPin()
                if (loadedApps.isEmpty()) renderAllowList() else renderAllowListRows(loadedApps)
                renderPolicyLog()
                toast(getString(R.string.app_pin_saved))
                onSaved()
            }
            .show()
    }

    private fun confirmClearAppPin() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.app_pin_clear_confirm_title)
            .setMessage(R.string.app_pin_clear_confirm_body)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.app_pin_clear_action) { _, _ ->
                prefs.clearAppPin()
                prefs.logPolicy(getString(R.string.log_app_pin_cleared))
                renderAppPin()
                if (loadedApps.isEmpty()) renderAllowList() else renderAllowListRows(loadedApps)
                renderPolicyLog()
                toast(getString(R.string.app_pin_cleared))
            }
            .show()
    }

    // --------------------------------------------------------- custom lock screen
    private fun renderLockScreen() {
        syncingLockScreenSwitch = true
        lockScreenSwitch.isChecked = prefs.customLockScreen
        syncingLockScreenSwitch = false
        if (lockNoteInput.text?.toString().orEmpty() != prefs.lockScreenNote) {
            lockNoteInput.setText(prefs.lockScreenNote)
        }
        val picks = prefs.quickLaunchPackages()
        lockQuickLaunchDetail.text = if (picks.isEmpty()) {
            getString(R.string.lock_screen_quick_launch_empty)
        } else {
            getString(R.string.lock_screen_quick_launch_detail_fmt, picks.size)
        }
    }

    private fun setCustomLockScreen(enabled: Boolean) {
        prefs.customLockScreen = enabled
        if (enabled) {
            // A custom lock screen plus Android's own would double-lock, so Android is asked
            // to skip its keyguard. A device with a lock password refuses, and the hint says so.
            prefs.keyguardDisabled = true
            prefs.logPolicy(getString(R.string.log_lock_screen_on))
            policy.applyPolicy()
            renderLocks()
        } else {
            prefs.lockScreenPending = false
            prefs.logPolicy(getString(R.string.log_lock_screen_off))
        }
        renderLockScreen()
        renderPolicyLog()
        toast(
            getString(
                if (enabled) R.string.lock_screen_enabled_toast else R.string.lock_screen_disabled_toast
            )
        )
    }

    private fun saveLockScreenNote() {
        prefs.lockScreenNote = lockNoteInput.text?.toString().orEmpty()
        prefs.logPolicy(getString(R.string.log_lock_screen_note))
        renderLockScreen()
        renderPolicyLog()
        toast(getString(R.string.lock_screen_note_saved))
    }

    /** Chooses the dock apps from the allowlist; only allowed apps may be shortcuts. */
    private fun chooseQuickLaunchApps() {
        val candidates = loadedApps.filter { prefs.isAllowed(it.packageName) }
        if (candidates.isEmpty()) {
            if (loadedApps.isEmpty()) {
                appRepo.launchableAsync { installed ->
                    if (isFinishing || isDestroyed) return@launchableAsync
                    loadedApps = installed
                    chooseQuickLaunchApps()
                }
            } else {
                toast(getString(R.string.lock_screen_quick_launch_none))
            }
            return
        }

        val saved = prefs.quickLaunchPackages().toSet()
        val checked = BooleanArray(candidates.size) { candidates[it].packageName in saved }
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.lock_screen_quick_launch_title)
            .setMultiChoiceItems(
                candidates.map { it.label }.toTypedArray(),
                checked
            ) { _, which, isChecked -> checked[which] = isChecked }
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.save) { _, _ ->
                val picks = candidates
                    .filterIndexed { index, _ -> checked[index] }
                    .map { it.packageName }
                prefs.setQuickLaunchPackages(picks)
                prefs.logPolicy(getString(R.string.log_lock_screen_shortcuts_fmt, picks.size))
                renderLockScreen()
                renderPolicyLog()
                toast(getString(R.string.lock_screen_quick_launch_saved_fmt, picks.size))
            }
            .show()
    }

    private fun previewLockScreen() {
        if (!prefs.customLockScreen) {
            toast(getString(R.string.lock_screen_unavailable))
            return
        }
        startActivity(
            Intent(this, LockScreenActivity::class.java)
                .putExtra(LockScreenActivity.EXTRA_PREVIEW, true)
        )
    }

    // -------------------------------------------------------------------- browser
    private fun saveBrowserFilters() {
        val domains = (domainsInput.text?.toString() ?: "")
            .split('\n', ',', ' ')
            .map { raw ->
                raw.trim().lowercase()
                    .removePrefix("https://")
                    .removePrefix("http://")
                    .removePrefix("www.")
                    .trimEnd('/')
            }
            .filter { it.isNotEmpty() }
            .toSet()

        val keywords = (blockedKeywordsInput.text?.toString() ?: "")
            .split('\n', ',')
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .toSet()

        prefs.setDomains(domains)
        prefs.setBlockedKeywords(keywords)
        prefs.logPolicy(getString(R.string.log_browser_allowlist_fmt, domains.size, keywords.size))
        toast(getString(R.string.domains_saved_fmt, domains.size, keywords.size))
        renderPolicyLog()
    }

    // ------------------------------------------------------------------------ PIN
    private fun changePin() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            filters = arrayOf(InputFilter.LengthFilter(KioskPreferences.MAX_PIN_LENGTH))
            setHint(R.string.new_passcode_hint)
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
            setPadding(dp(24), dp(12), dp(24), dp(4))
        }

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.change_passcode_title)
            .setView(input)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.save) { _, _ ->
                val pin = input.text?.toString().orEmpty()
                if (pin.length in KioskPreferences.MIN_PIN_LENGTH..KioskPreferences.MAX_PIN_LENGTH && pin.isNotBlank()) {
                    prefs.setPin(pin)
                    prefs.logPolicy(getString(R.string.log_passcode_changed))
                    toast(getString(R.string.passcode_updated))
                    renderPolicyLog()
                } else {
                    toast(getString(R.string.passcode_length_error))
                }
            }
            .show()
    }

    // ----------------------------------------------------------------- policy log
    private fun renderPolicyLog() {
        val events = prefs.policyEvents().take(6)
        policyLog.text = if (events.isEmpty()) {
            getString(R.string.no_policy_events)
        } else {
            events.joinToString("\n") { "${timeFormat.format(Date(it.time))}  ${it.label}" }
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    companion object {
        const val EXTRA_UPDATE_VERSION = "update_version_code"
    }
}
