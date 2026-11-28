package com.kiosk.launcher.ui

import android.app.AppOpsManager
import android.app.admin.DevicePolicyManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.NestedScrollView
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.checkbox.MaterialCheckBox
import com.google.android.material.chip.ChipGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.switchmaterial.SwitchMaterial
import com.google.android.material.textfield.TextInputEditText
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.AppPasswordPolicy
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.admin.KioskDeviceAdminReceiver
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskFolder
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.data.LockScreenShortcuts
import com.kiosk.launcher.schedule.KioskSchedule
import com.kiosk.launcher.schedule.ScheduleController
import com.kiosk.launcher.schedule.ScheduleParse
import com.kiosk.launcher.service.KioskGuardAccessibilityService
import com.kiosk.launcher.service.ScreenLockService
import com.kiosk.launcher.update.UpdateInstaller
import com.kiosk.launcher.update.UpdateManager
import com.kiosk.launcher.update.UpdateManifest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.min

class AdminSettingsActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var policy: DevicePolicyHelper
    private lateinit var appRepo: InstalledAppsRepository
    private lateinit var updates: UpdateManager

    private lateinit var adminScroll: NestedScrollView
    private lateinit var sectionChips: ChipGroup

    private lateinit var cardOwner: View
    private lateinit var cardSecurity: View
    private lateinit var cardGuardPermissions: View
    private lateinit var cardHomeLayout: View
    private lateinit var cardUpdate: View
    private lateinit var cardMode: View
    private lateinit var cardBrowser: View
    private lateinit var cardCustomLockScreen: View
    private lateinit var cardAllowlist: View
    private lateinit var cardSchedule: View
    private lateinit var cardStrongRestrictions: View
    private lateinit var cardLocks: View

    private lateinit var permOverlayStatus: TextView
    private lateinit var permOverlayButton: MaterialButton
    private lateinit var permAccessibilityStatus: TextView
    private lateinit var permAccessibilityButton: MaterialButton
    private lateinit var permUsageStatus: TextView
    private lateinit var permUsageButton: MaterialButton
    private lateinit var permBatteryStatus: TextView
    private lateinit var permBatteryButton: MaterialButton
    private lateinit var manageFoldersButton: MaterialButton
    private lateinit var reorderHomeIconsButton: MaterialButton

    private lateinit var strongRestrictionsContainer: LinearLayout
    private lateinit var locksContainer: LinearLayout
    private lateinit var browserTogglesContainer: LinearLayout
    private lateinit var customLockContainer: LinearLayout
    private lateinit var customLockStatus: TextView
    private lateinit var lockNoteInput: TextInputEditText
    private lateinit var lockQuickAppsButton: MaterialButton
    private lateinit var appPinStatus: TextView
    private lateinit var appsSearchInput: TextInputEditText
    private lateinit var appsSummaryHint: TextView
    private lateinit var appsContainer: LinearLayout
    private lateinit var allowAllSwitch: SwitchMaterial
    private lateinit var allowListDayGroup: MaterialButtonToggleGroup
    private lateinit var allowListScopeHint: TextView
    private lateinit var scheduleSwitch: SwitchMaterial
    private lateinit var scheduleWindowsInput: TextInputEditText
    private lateinit var scheduleHint: TextView
    private lateinit var modeGroup: MaterialButtonToggleGroup
    private lateinit var domainsInput: TextInputEditText
    private lateinit var blockedKeywordsInput: TextInputEditText
    private lateinit var clearPanicButton: View
    private lateinit var modeHint: TextView
    private lateinit var defaultLauncherSwitch: SwitchMaterial
    private lateinit var defaultLauncherDetail: TextView
    private lateinit var kioskStateDetail: TextView
    private lateinit var activateAdminButton: MaterialButton
    private lateinit var releaseOwnerButton: View
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
    private var appSearchQuery: String = ""
    private var editingWeekendAllowlist = false
    private var syncingScheduleSwitch = false
    private var selectedSectionId: Int = R.id.chipAdminAll

    private val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())

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

        adminScroll = findViewById(R.id.adminScroll)
        applyEdgeToEdge(toolbar, adminScroll)
        applyResponsiveWidth()

        sectionChips = findViewById(R.id.adminSectionChips)
        cardOwner = findViewById(R.id.cardOwner)
        cardSecurity = findViewById(R.id.cardSecurity)
        cardGuardPermissions = findViewById(R.id.cardGuardPermissions)
        cardHomeLayout = findViewById(R.id.cardHomeLayout)
        cardUpdate = findViewById(R.id.cardUpdate)
        cardMode = findViewById(R.id.cardMode)
        cardBrowser = findViewById(R.id.cardBrowser)
        cardCustomLockScreen = findViewById(R.id.cardCustomLockScreen)
        cardAllowlist = findViewById(R.id.cardAllowlist)
        cardSchedule = findViewById(R.id.cardSchedule)
        cardStrongRestrictions = findViewById(R.id.cardStrongRestrictions)
        cardLocks = findViewById(R.id.cardLocks)

        permOverlayStatus = findViewById(R.id.permOverlayStatus)
        permOverlayButton = findViewById(R.id.permOverlayButton)
        permAccessibilityStatus = findViewById(R.id.permAccessibilityStatus)
        permAccessibilityButton = findViewById(R.id.permAccessibilityButton)
        permUsageStatus = findViewById(R.id.permUsageStatus)
        permUsageButton = findViewById(R.id.permUsageButton)
        permBatteryStatus = findViewById(R.id.permBatteryStatus)
        permBatteryButton = findViewById(R.id.permBatteryButton)
        manageFoldersButton = findViewById(R.id.manageFoldersButton)
        reorderHomeIconsButton = findViewById(R.id.reorderHomeIconsButton)

        strongRestrictionsContainer = findViewById(R.id.strongRestrictionsContainer)
        locksContainer = findViewById(R.id.locksContainer)
        browserTogglesContainer = findViewById(R.id.browserTogglesContainer)
        customLockContainer = findViewById(R.id.customLockContainer)
        customLockStatus = findViewById(R.id.customLockStatus)
        lockNoteInput = findViewById(R.id.lockNoteInput)
        lockQuickAppsButton = findViewById(R.id.lockQuickAppsButton)
        appPinStatus = findViewById(R.id.appPinStatus)
        appsSearchInput = findViewById(R.id.appsSearchInput)
        appsSummaryHint = findViewById(R.id.appsSummaryHint)
        appsContainer = findViewById(R.id.appsContainer)
        allowAllSwitch = findViewById(R.id.allowAllSwitch)
        allowListDayGroup = findViewById(R.id.allowListDayGroup)
        allowListScopeHint = findViewById(R.id.allowListScopeHint)
        scheduleSwitch = findViewById(R.id.scheduleSwitch)
        scheduleWindowsInput = findViewById(R.id.scheduleWindowsInput)
        scheduleHint = findViewById(R.id.scheduleHint)
        modeGroup = findViewById(R.id.modeGroup)
        domainsInput = findViewById(R.id.domainsInput)
        blockedKeywordsInput = findViewById(R.id.blockedKeywordsInput)
        clearPanicButton = findViewById(R.id.clearPanicButton)
        modeHint = findViewById(R.id.modeHint)
        defaultLauncherSwitch = findViewById(R.id.defaultLauncherSwitch)
        defaultLauncherDetail = findViewById(R.id.defaultLauncherDetail)
        kioskStateDetail = findViewById(R.id.kioskStateDetail)
        activateAdminButton = findViewById(R.id.activateAdminButton)
        releaseOwnerButton = findViewById(R.id.releaseOwnerButton)
        releaseOwnerButton.setOnClickListener { confirmReleaseOwner() }

        setupGuardPermissionsUi()
        setupHomeLayoutUi()
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

        findViewById<View>(R.id.defaultLauncherRow).setOnClickListener { defaultLauncherSwitch.toggle() }
        defaultLauncherSwitch.setOnCheckedChangeListener { _, checked ->
            if (syncingLauncherSwitch) return@setOnCheckedChangeListener
            if (checked) requestDefaultLauncher() else dropDefaultLauncher()
        }

        findViewById<View>(R.id.allowAllRow).setOnClickListener { allowAllSwitch.toggle() }
        findViewById<View>(R.id.scheduleSwitchRow).setOnClickListener { scheduleSwitch.toggle() }

        findViewById<View>(R.id.changePinButton).setOnClickListener { changePin() }
        findViewById<View>(R.id.appPinButton).setOnClickListener { changeAppAccessPin() }
        findViewById<View>(R.id.lockNoteSave).setOnClickListener { saveLockNote() }
        lockQuickAppsButton.setOnClickListener { editQuickLaunchApps() }
        findViewById<View>(R.id.lockPreviewButton).setOnClickListener {
            KioskLockScreenActivity.launch(this, preview = true)
        }
        findViewById<View>(R.id.copyCommandButton).setOnClickListener { copyProvisionCommand() }
        activateAdminButton.setOnClickListener { activateDeviceAdmin() }
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
        findViewById<View>(R.id.scheduleSave).setOnClickListener { saveSchedule() }

        appsSearchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                appSearchQuery = s?.toString().orEmpty().trim()
                if (loadedApps.isNotEmpty()) renderAllowListRows(loadedApps)
            }
        })

        domainsInput.setText(prefs.domains().sorted().joinToString("\n"))
        blockedKeywordsInput.setText(prefs.blockedKeywords().sorted().joinToString("\n"))
        scheduleWindowsInput.setText(prefs.scheduleWindows)
        editingWeekendAllowlist = KioskSchedule.isWeekend(System.currentTimeMillis())

        if (savedInstanceState != null) {
            selectedSectionId = savedInstanceState.getInt(STATE_SECTION, R.id.chipAdminAll)
        }
        sectionChips.setOnCheckedStateChangeListener { _, checkedIds ->
            val chipId = checkedIds.firstOrNull() ?: R.id.chipAdminAll
            applySectionFilter(chipId, resetScroll = true)
        }
        val restoredChip = selectedSectionId
            .takeIf { sectionChips.findViewById<View>(it) != null }
            ?: R.id.chipAdminAll
        sectionChips.check(restoredChip)
        applySectionFilter(restoredChip, resetScroll = false)

        renderOwner()
        renderDefaultLauncher()
        renderRecoveryState()
        renderAdminWindow()
        renderUpdate()
        renderMode()
        renderBrowserToggles()
        renderStrongRestrictions()
        renderLocks()
        renderCustomLockScreen()
        renderAppAccessPin()
        renderSchedule()
        renderAllowList()

        modeGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            prefs.kioskMode = when (checkedId) {
                R.id.modeSingle -> KioskPreferences.MODE_SINGLE
                R.id.modeBrowser -> KioskPreferences.MODE_BROWSER
                else -> KioskPreferences.MODE_MULTI
            }
            policy.applyPolicy()
            modeHint.text = modeDescription(prefs.kioskMode)
            if (loadedApps.isNotEmpty()) updateAppsSummaryHint(loadedApps)
        }

        allowAllSwitch.setOnCheckedChangeListener { _, checked ->
            prefs.allowAllApps = checked
            policy.applyPolicy()
            if (loadedApps.isEmpty()) renderAllowList() else renderAllowListRows(loadedApps)
        }

        allowListDayGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            editingWeekendAllowlist = checkedId == R.id.allowListWeekends
            if (loadedApps.isNotEmpty()) renderAllowListRows(loadedApps)
        }

        scheduleSwitch.setOnCheckedChangeListener { _, checked ->
            if (syncingScheduleSwitch) return@setOnCheckedChangeListener
            if (checked) prefs.seedDayListsFromLegacyAllowlist()
            prefs.scheduleEnabled = checked
            prefs.logPolicy(
                getString(if (checked) R.string.log_schedule_enabled else R.string.log_schedule_disabled)
            )
            ScheduleController.refresh(this)
            policy.applyPolicy()
            renderSchedule()
            renderCustomLockScreenStatus()
            if (loadedApps.isEmpty()) renderAllowList() else renderAllowListRows(loadedApps)
            renderPolicyLog()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt(STATE_SECTION, selectedSectionId)
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
        ScreenLockService.sync(this)
        renderOwner()
        renderDefaultLauncher()
        renderCustomLockScreenStatus()
        renderRecoveryState()
        updateGuardPermissionsStatus()
        renderPolicyLog()
        // Jumped here from the launcher's update banner: land on the Security/Update section.
        if (intent?.getIntExtra(EXTRA_UPDATE_VERSION, 0)?.let { it > 0 } == true) {
            intent?.removeExtra(EXTRA_UPDATE_VERSION)
            sectionChips.check(R.id.chipAdminSecurity)
            applySectionFilter(R.id.chipAdminSecurity, resetScroll = true)
            if (availableUpdate == null) checkForUpdates(manual = true)
        }
    }

    private fun applyResponsiveWidth() {
        val content = findViewById<View>(R.id.adminContent)
        content.post {
            val maxPx = resources.getDimensionPixelSize(R.dimen.si_max_content_width)
            val widthPx = resources.displayMetrics.widthPixels
            val params = content.layoutParams
            val target = min(widthPx, maxPx)
            if (params.width != target) {
                params.width = target
                content.layoutParams = params
            }
        }
    }

    private fun applySectionFilter(chipId: Int, resetScroll: Boolean) {
        selectedSectionId = chipId
        val showAll = chipId == R.id.chipAdminAll
        val showDevice = showAll || chipId == R.id.chipAdminDevice
        val showSecurity = showAll || chipId == R.id.chipAdminSecurity
        val showBrowser = showAll || chipId == R.id.chipAdminBrowser
        val showLockScreen = showAll || chipId == R.id.chipAdminLockScreen
        val showApps = showAll || chipId == R.id.chipAdminApps
        val showLocks = showAll || chipId == R.id.chipAdminLocks

        cardOwner.visibility = if (showDevice) View.VISIBLE else View.GONE

        cardSecurity.visibility = if (showSecurity) View.VISIBLE else View.GONE
        cardGuardPermissions.visibility = if (showSecurity) View.VISIBLE else View.GONE
        cardHomeLayout.visibility = if (showSecurity) View.VISIBLE else View.GONE
        cardUpdate.visibility = if (showSecurity) View.VISIBLE else View.GONE

        cardMode.visibility = if (showBrowser) View.VISIBLE else View.GONE
        cardBrowser.visibility = if (showBrowser) View.VISIBLE else View.GONE

        cardCustomLockScreen.visibility = if (showLockScreen) View.VISIBLE else View.GONE

        cardAllowlist.visibility = if (showApps) View.VISIBLE else View.GONE
        cardSchedule.visibility = if (showApps) View.VISIBLE else View.GONE

        cardStrongRestrictions.visibility = if (showLocks) View.VISIBLE else View.GONE
        cardLocks.visibility = if (showLocks) View.VISIBLE else View.GONE

        val visibleCards = listOf(
            cardOwner, cardSecurity, cardGuardPermissions, cardHomeLayout, cardUpdate,
            cardMode, cardBrowser, cardCustomLockScreen,
            cardAllowlist, cardSchedule, cardStrongRestrictions, cardLocks
        )
        val firstVisible = visibleCards.firstOrNull { it.visibility == View.VISIBLE }

        visibleCards.forEach { card ->
            (card.layoutParams as? ViewGroup.MarginLayoutParams)?.let { lp ->
                lp.topMargin = if (card === firstVisible) 0 else dp(14)
                card.layoutParams = lp
            }
        }

        if (resetScroll) {
            adminScroll.scrollTo(0, 0)
        }
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
        val adminActive = policy.isAdminActive
        activateAdminButton.setText(
            if (adminActive) R.string.admin_active_badge else R.string.activate_admin
        )
        activateAdminButton.alpha = if (adminActive) 0.7f else 1f
        // The way out only exists while this app really owns the device.
        releaseOwnerButton.visibility = if (policy.isDeviceOwner) View.VISIBLE else View.GONE
    }

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
        ScreenLockService.sync(this)
        renderOwner()
        renderDefaultLauncher()
        renderCustomLockScreenStatus()
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
        if (policy.pinAsHomeLauncher()) {
            prefs.kioskEnabled = true
            prefs.logPolicy(getString(R.string.log_default_launcher_on))
            toast(getString(R.string.default_launcher_set))
            policy.applyPolicy()
            ScreenLockService.sync(this)
            renderDefaultLauncher()
            renderCustomLockScreenStatus()
            renderPolicyLog()
            return
        }
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
        policy.applyPolicy()
        ScreenLockService.sync(this)
        renderDefaultLauncher()
        renderCustomLockScreenStatus()
        renderPolicyLog()
        if (cleared) {
            prefs.logPolicy(getString(R.string.log_default_launcher_off))
            toast(getString(R.string.default_launcher_cleared))
            return
        }
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

    // --------------------------------------------------- guard permissions & folders
    private fun setupGuardPermissionsUi() {
        findViewById<View>(R.id.permOverlayRow).setOnClickListener {
            runCatching {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            }
        }
        permOverlayButton.setOnClickListener {
            runCatching {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            }
        }

        findViewById<View>(R.id.permAccessibilityRow).setOnClickListener {
            runCatching {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }
        permAccessibilityButton.setOnClickListener {
            runCatching {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }

        findViewById<View>(R.id.permUsageRow).setOnClickListener {
            runCatching {
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            }
        }
        permUsageButton.setOnClickListener {
            runCatching {
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            }
        }

        findViewById<View>(R.id.permBatteryRow).setOnClickListener {
            runCatching {
                val powerManager = getSystemService(PowerManager::class.java)
                if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(packageName)) {
                    startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                } else {
                    startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                }
            }
        }
        permBatteryButton.setOnClickListener {
            runCatching {
                val powerManager = getSystemService(PowerManager::class.java)
                if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(packageName)) {
                    startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                } else {
                    startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                }
            }
        }
    }

    private fun updateGuardPermissionsStatus() {
        val hasOverlay = Settings.canDrawOverlays(this)
        permOverlayStatus.text = getString(if (hasOverlay) R.string.perm_status_granted else R.string.perm_status_missing)
        permOverlayStatus.setTextColor(ContextCompat.getColor(this, if (hasOverlay) android.R.color.holo_green_dark else android.R.color.holo_red_dark))

        val hasAccess = isAccessibilityServiceEnabled()
        permAccessibilityStatus.text = getString(if (hasAccess) R.string.perm_status_granted else R.string.perm_status_missing)
        permAccessibilityStatus.setTextColor(ContextCompat.getColor(this, if (hasAccess) android.R.color.holo_green_dark else android.R.color.holo_red_dark))

        val hasUsage = isUsageStatsGranted()
        permUsageStatus.text = getString(if (hasUsage) R.string.perm_status_granted else R.string.perm_status_missing)
        permUsageStatus.setTextColor(ContextCompat.getColor(this, if (hasUsage) android.R.color.holo_green_dark else android.R.color.holo_red_dark))

        val powerManager = getSystemService(PowerManager::class.java)
        val hasBattery = powerManager != null && powerManager.isIgnoringBatteryOptimizations(packageName)
        permBatteryStatus.text = getString(if (hasBattery) R.string.perm_status_granted else R.string.perm_status_missing)
        permBatteryStatus.setTextColor(ContextCompat.getColor(this, if (hasBattery) android.R.color.holo_green_dark else android.R.color.holo_red_dark))
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val enabled = Settings.Secure.getInt(contentResolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1
        if (!enabled) return false
        val services = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val expectedComponent = ComponentName(this, KioskGuardAccessibilityService::class.java).flattenToString()
        return services.contains(expectedComponent, ignoreCase = true)
    }

    private fun isUsageStatsGranted(): Boolean {
        val appOps = getSystemService(AppOpsManager::class.java) ?: return false
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), packageName)
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun setupHomeLayoutUi() {
        manageFoldersButton.setOnClickListener { showManageFoldersDialog() }
        reorderHomeIconsButton.setOnClickListener {
            toast(getString(R.string.reorder_icons_hint))
        }
    }

    private fun showManageFoldersDialog() {
        val folders = prefs.homeFolders()
        val items = mutableListOf<String>()
        folders.forEach { items.add("📁 ${it.name} (${it.packageNames.size} apps)") }
        items.add(getString(R.string.folder_create_new))

        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.manage_folders_button)
            .setItems(items.toTypedArray()) { _, which ->
                if (which == folders.size) {
                    showEditFolderDialog(null)
                } else if (which in folders.indices) {
                    showEditFolderDialog(folders[which])
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun showEditFolderDialog(folder: com.kiosk.launcher.data.KioskFolder?) {
        val input = EditText(this).apply {
            hint = getString(R.string.folder_name_hint)
            setText(folder?.name.orEmpty())
            setPadding(dp(20), dp(12), dp(20), dp(12))
        }

        val allowedPkgs = prefs.allowedPackages().toList()
        appRepo.launchableAsync { all ->
            val appMap = all.associateBy { it.packageName }
            val allowedApps = allowedPkgs.mapNotNull { appMap[it] }
            val checkedItems = BooleanArray(allowedApps.size) { i ->
                folder?.packageNames?.contains(allowedApps[i].packageName) == true
            }
            val appNames = allowedApps.map { it.label }.toTypedArray()

            runOnUiThread {
                MaterialAlertDialogBuilder(this)
                    .setTitle(if (folder == null) R.string.create_folder_title else R.string.edit_folder_title)
                    .setView(input)
                    .setMultiChoiceItems(appNames, checkedItems) { _, index, checked ->
                        checkedItems[index] = checked
                    }
                    .setPositiveButton(R.string.save) { _, _ ->
                        val name = input.text.toString().trim()
                        if (name.isBlank()) {
                            toast(getString(R.string.passcode_length_error))
                            return@setPositiveButton
                        }
                        val selectedPkgs = allowedApps.indices.filter { checkedItems[it] }.map { allowedApps[it].packageName }
                        if (folder == null) {
                            prefs.createFolder(name, selectedPkgs)
                            toast(getString(R.string.folder_created_toast))
                        } else {
                            prefs.updateFolder(folder.id, name, selectedPkgs)
                            toast(getString(R.string.folder_updated_toast))
                        }
                    }
                    .apply {
                        if (folder != null) {
                            setNeutralButton(R.string.folder_delete) { _, _ ->
                                prefs.deleteFolder(folder.id)
                                toast(getString(R.string.folder_deleted_toast))
                            }
                        }
                    }
                    .setNegativeButton(R.string.cancel, null)
                    .show()
            }
        }
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

    // --------------------------------------------------------- browser toggles
    private fun renderBrowserToggles() {
        browserTogglesContainer.removeAllViews()
        addToggle(
            browserTogglesContainer,
            getString(R.string.browser_show_on_home),
            getString(R.string.browser_show_on_home_desc),
            prefs.showBrowserOnHome
        ) {
            prefs.showBrowserOnHome = it
        }
        addToggle(
            browserTogglesContainer,
            getString(R.string.lock_unsupported_browsers),
            getString(R.string.lock_unsupported_browsers_desc),
            prefs.blockUnsupportedBrowsers
        ) {
            prefs.blockUnsupportedBrowsers = it
            applyLocks()
        }
        addToggle(
            browserTogglesContainer,
            getString(R.string.lock_short_feeds),
            getString(R.string.lock_short_feeds_desc),
            prefs.blockShortFormFeeds
        ) {
            prefs.blockShortFormFeeds = it
            applyLocks()
        }
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
        val outValue = android.util.TypedValue()
        theme.resolveAttribute(android.R.attr.selectableItemBackground, outValue, true)

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(10), 0, dp(10))
            if (outValue.resourceId != 0) {
                setBackgroundResource(outValue.resourceId)
            }
            isClickable = true
            isFocusable = true
        }

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            setPaddingRelative(0, 0, dp(12), 0)
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
            setLineSpacing(dp(2).toFloat(), 1f)
        })

        val switch = SwitchMaterial(this).apply {
            isChecked = initial
            setOnCheckedChangeListener { _, checked -> onChange(checked) }
        }

        row.setOnClickListener { switch.toggle() }
        row.addView(column)
        row.addView(switch)
        target.addView(row)
    }

    // -------------------------------------------------------- custom lock screen
    private fun renderCustomLockScreen() {
        customLockContainer.removeAllViews()
        addToggle(
            customLockContainer,
            getString(R.string.custom_lock_enable),
            getString(R.string.custom_lock_enable_desc),
            prefs.customLockScreenEnabled
        ) { enabled ->
            prefs.customLockScreenEnabled = enabled
            prefs.logPolicy(
                getString(if (enabled) R.string.log_custom_lock_enabled else R.string.log_custom_lock_disabled)
            )
            policy.applyPolicy()
            ScreenLockService.sync(this)
            renderCustomLockScreenStatus()
            renderPolicyLog()
        }
        addToggle(
            customLockContainer,
            getString(R.string.lock_widget_battery_title),
            getString(R.string.lock_widget_battery_desc),
            prefs.lockWidgetBattery
        ) { prefs.lockWidgetBattery = it }
        addToggle(
            customLockContainer,
            getString(R.string.lock_widget_stats_title),
            getString(R.string.lock_widget_stats_desc),
            prefs.lockWidgetStats
        ) { prefs.lockWidgetStats = it }
        addToggle(
            customLockContainer,
            getString(R.string.lock_widget_note_title),
            getString(R.string.lock_widget_note_desc),
            prefs.lockWidgetNote
        ) { prefs.lockWidgetNote = it }

        lockNoteInput.setText(prefs.lockScreenNote)
        renderCustomLockScreenStatus()
        updateQuickAppsButtonLabel()
    }

    private fun renderCustomLockScreenStatus() {
        val statusRes = when {
            !prefs.customLockScreenEnabled -> R.string.custom_lock_status_off
            prefs.kioskEnabled == true && policy.isDefaultLauncher -> R.string.custom_lock_status_armed
            else -> R.string.custom_lock_status_needs_kiosk
        }
        customLockStatus.setText(statusRes)
        customLockStatus.setTextColor(
            colorOf(
                if (statusRes == R.string.custom_lock_status_armed) R.color.accent
                else R.color.text_secondary
            )
        )
    }

    private fun updateQuickAppsButtonLabel() {
        val count = if (loadedApps.isNotEmpty()) {
            val installedPkgs = loadedApps.map { it.packageName }.toSet()
            LockScreenShortcuts.resolve(prefs.lockScreenQuickApps(), installedPkgs).size
        } else {
            prefs.lockScreenQuickApps().size
        }
        lockQuickAppsButton.text = getString(R.string.lock_quick_apps_button, count)
    }

    private fun saveLockNote() {
        prefs.lockScreenNote = lockNoteInput.text?.toString().orEmpty()
        toast(getString(R.string.lock_note_saved))
    }

    private fun editQuickLaunchApps() {
        if (loadedApps.isEmpty()) {
            appRepo.launchableAsync { installed ->
                if (isFinishing || isDestroyed) return@launchableAsync
                loadedApps = installed
                showQuickLaunchPicker(installed)
            }
            return
        }
        showQuickLaunchPicker(loadedApps)
    }

    private fun showQuickLaunchPicker(installed: List<AppEntry>) {
        val candidates = installed.filter {
            prefs.allowAllApps || prefs.isAllowlistedAnywhere(it.packageName)
        }
        if (candidates.isEmpty()) {
            toast(getString(R.string.lock_quick_apps_empty))
            return
        }
        val selected = prefs.lockScreenQuickApps().toMutableList()
        val labels = candidates.map { it.label }.toTypedArray()
        val checked = candidates.map { selected.contains(it.packageName) }.toBooleanArray()

        MaterialAlertDialogBuilder(this)
            .setTitle(
                getString(R.string.lock_quick_apps_title, AppPasswordPolicy.MAX_QUICK_LAUNCH_APPS)
            )
            .setMultiChoiceItems(labels, checked) { dialog, which, isChecked ->
                val pkg = candidates[which].packageName
                if (isChecked) {
                    if (!selected.contains(pkg)) {
                        if (selected.size >= AppPasswordPolicy.MAX_QUICK_LAUNCH_APPS) {
                            checked[which] = false
                            (dialog as? AlertDialog)?.listView?.setItemChecked(which, false)
                            toast(
                                getString(
                                    R.string.lock_quick_apps_max_toast,
                                    AppPasswordPolicy.MAX_QUICK_LAUNCH_APPS
                                )
                            )
                            return@setMultiChoiceItems
                        }
                        selected.add(pkg)
                    }
                } else {
                    selected.remove(pkg)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.save) { _, _ ->
                prefs.setLockScreenQuickApps(selected)
                updateQuickAppsButtonLabel()
                toast(
                    getString(
                        R.string.lock_quick_apps_saved_fmt,
                        prefs.lockScreenQuickApps().size
                    )
                )
            }
            .show()
    }

    // ------------------------------------------------------------------ allowlist
    private fun renderAppAccessPin() {
        appPinStatus.setText(
            if (prefs.hasAppAccessPin()) R.string.app_pin_status_custom else R.string.app_pin_status_default
        )
    }

    private fun renderSchedule() {
        syncingScheduleSwitch = true
        scheduleSwitch.isChecked = prefs.scheduleEnabled
        syncingScheduleSwitch = false

        val showDayScope = prefs.scheduleEnabled
        allowListDayGroup.visibility = if (showDayScope) View.VISIBLE else View.GONE
        allowListScopeHint.visibility = if (showDayScope) View.VISIBLE else View.GONE
        if (showDayScope) {
            allowListDayGroup.check(
                if (editingWeekendAllowlist) R.id.allowListWeekends else R.id.allowListWeekdays
            )
        }

        scheduleHint.text = when {
            !prefs.scheduleEnabled -> getString(R.string.schedule_hint_default)
            else -> when (val parsed = prefs.scheduleWindowsParsed()) {
                is ScheduleParse.Invalid ->
                    getString(R.string.schedule_invalid_fmt, parsed.lineNumber, parsed.line)
                is ScheduleParse.Parsed -> {
                    if (prefs.isWithinKioskHours()) getString(R.string.schedule_active_now)
                    else getString(R.string.schedule_paused_now)
                }
            }
        }
    }

    private fun saveSchedule() {
        val text = scheduleWindowsInput.text?.toString().orEmpty()
        when (val parsed = KioskSchedule.parse(text)) {
            is ScheduleParse.Invalid -> {
                val msg = getString(R.string.schedule_invalid_fmt, parsed.lineNumber, parsed.line)
                scheduleHint.text = msg
                toast(msg)
            }
            is ScheduleParse.Parsed -> {
                prefs.scheduleWindows = text
                prefs.logPolicy(getString(R.string.log_schedule_saved))
                ScheduleController.refresh(this)
                policy.applyPolicy()
                renderSchedule()
                renderCustomLockScreenStatus()
                renderPolicyLog()
                toast(getString(R.string.schedule_saved))
            }
        }
    }

    private fun renderAllowList() {
        val request = ++allowListRequest
        appsContainer.removeAllViews()
        allowAllSwitch.isChecked = prefs.allowAllApps

        appRepo.launchableAsync { installed ->
            if (request != allowListRequest || isFinishing || isDestroyed) return@launchableAsync
            loadedApps = installed
            updateQuickAppsButtonLabel()
            renderAllowListRows(installed)
        }
    }

    private fun isRowAllowed(packageName: String): Boolean = when {
        prefs.allowAllApps -> true
        prefs.scheduleEnabled -> prefs.isDayAllowed(packageName, editingWeekendAllowlist)
        else -> prefs.allowedPackages().contains(packageName)
    }

    private fun updateAppsSummaryHint(installed: List<AppEntry>) {
        val allowed = installed.filter { isRowAllowed(it.packageName) }
        val countText = if (prefs.allowAllApps) {
            getString(R.string.apps_count_all_fmt, allowed.size)
        } else {
            getString(R.string.apps_count_allowed_fmt, allowed.size, installed.size)
        }
        appsSummaryHint.text = if (prefs.kioskMode == KioskPreferences.MODE_SINGLE) {
            val first = allowed.firstOrNull()
            val singleHint = if (first != null) {
                getString(R.string.apps_single_mode_note, first.label)
            } else {
                getString(R.string.apps_single_mode_none)
            }
            "$countText · $singleHint"
        } else {
            countText
        }
    }

    private fun renderAllowListRows(installed: List<AppEntry>) {
        appsContainer.removeAllViews()
        updateAppsSummaryHint(installed)

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

        val query = appSearchQuery.lowercase(Locale.getDefault())
        val filtered = if (query.isEmpty()) {
            installed
        } else {
            installed.filter {
                it.label.lowercase(Locale.getDefault()).contains(query) ||
                    it.packageName.lowercase(Locale.getDefault()).contains(query)
            }
        }

        if (filtered.isEmpty()) {
            appsContainer.addView(TextView(this).apply {
                setText(R.string.apps_filter_empty)
                textAlignment = View.TEXT_ALIGNMENT_VIEW_START
                setTextColor(colorOf(R.color.text_secondary))
                textSize = 13f
                setPadding(0, dp(8), 0, dp(8))
            })
            return
        }

        filtered.forEach { entry ->
            val row = layoutInflater.inflate(R.layout.item_admin_app_toggle, appsContainer, false)
            row.findViewById<ImageView>(R.id.toggleIcon).setImageDrawable(entry.icon)
            row.findViewById<TextView>(R.id.toggleLabel).text = entry.label

            val allowedForRow = isRowAllowed(entry.packageName)
            val passwordCheck = row.findViewById<MaterialCheckBox>(R.id.requirePasswordCheck)
            passwordCheck.setOnCheckedChangeListener(null)
            passwordCheck.isChecked = prefs.isAppPasswordRequired(entry.packageName)
            val passwordEnabled = prefs.allowAllApps || prefs.isAllowlistedAnywhere(entry.packageName)
            passwordCheck.isEnabled = passwordEnabled
            passwordCheck.alpha = if (passwordEnabled) 1f else 0.45f
            passwordCheck.setOnCheckedChangeListener { _, checked ->
                prefs.setAppPasswordRequired(entry.packageName, checked)
            }

            val switch = row.findViewById<SwitchMaterial>(R.id.toggleSwitch)
            switch.setOnCheckedChangeListener(null)
            switch.isChecked = allowedForRow
            switch.isEnabled = !prefs.allowAllApps
            switch.alpha = if (prefs.allowAllApps) 0.5f else 1f
            switch.setOnCheckedChangeListener { _, checked ->
                if (prefs.scheduleEnabled) {
                    prefs.setDayAllowed(entry.packageName, checked, editingWeekendAllowlist)
                } else {
                    prefs.setAppAllowed(entry.packageName, checked)
                }
                val nextPasswordEnabled =
                    prefs.allowAllApps || prefs.isAllowlistedAnywhere(entry.packageName)
                passwordCheck.isEnabled = nextPasswordEnabled
                passwordCheck.alpha = if (nextPasswordEnabled) 1f else 0.45f
                updateAppsSummaryHint(installed)
                policy.applyPolicy()
            }

            row.setOnClickListener {
                if (switch.isEnabled) switch.toggle()
            }

            appsContainer.addView(row)
        }
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

    private fun changeAppAccessPin() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            filters = arrayOf(InputFilter.LengthFilter(KioskPreferences.MAX_PIN_LENGTH))
            setHint(R.string.new_passcode_hint)
            textAlignment = View.TEXT_ALIGNMENT_VIEW_START
            setPadding(dp(24), dp(12), dp(24), dp(4))
        }

        val builder = MaterialAlertDialogBuilder(this)
            .setTitle(R.string.app_pin_change_title)
            .setView(input)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.save) { _, _ ->
                val pin = input.text?.toString().orEmpty()
                if (pin.length in KioskPreferences.MIN_PIN_LENGTH..KioskPreferences.MAX_PIN_LENGTH && pin.isNotBlank()) {
                    prefs.setAppAccessPin(pin)
                    prefs.logPolicy(getString(R.string.log_app_pin_changed))
                    toast(getString(R.string.app_pin_updated))
                    renderAppAccessPin()
                    renderPolicyLog()
                } else {
                    toast(getString(R.string.passcode_length_error))
                }
            }
        if (prefs.hasAppAccessPin()) {
            builder.setNeutralButton(R.string.app_pin_reset_default) { _, _ ->
                prefs.clearAppAccessPin()
                prefs.logPolicy(getString(R.string.log_app_pin_reset))
                toast(getString(R.string.app_pin_reset_done))
                renderAppAccessPin()
                renderPolicyLog()
            }
        }
        builder.show()
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
        private const val STATE_SECTION = "admin_section_id"
    }
}
