package com.kiosk.launcher.ui

import android.app.admin.DevicePolicyManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
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
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.switchmaterial.SwitchMaterial
import com.google.android.material.textfield.TextInputEditText
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.admin.KioskDeviceAdminReceiver
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AdminSettingsActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var policy: DevicePolicyHelper
    private lateinit var appRepo: InstalledAppsRepository

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

    /** Bumped per scan so a slow, stale result can't repaint the list. */
    private var allowListRequest = 0
    private var loadedApps: List<AppEntry> = emptyList()

    private val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_admin_settings)

        prefs = KioskPreferences(this)
        policy = DevicePolicyHelper(this)
        appRepo = InstalledAppsRepository(this)

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
        findViewById<View>(R.id.domainsSave).setOnClickListener { saveBrowserFilters() }

        domainsInput.setText(prefs.domains().sorted().joinToString("\n"))
        blockedKeywordsInput.setText(prefs.blockedKeywords().sorted().joinToString("\n"))

        renderOwner()
        renderRecoveryState()
        renderMode()
        renderStrongRestrictions()
        renderLocks()
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
        }

        allowAllSwitch.setOnCheckedChangeListener { _, checked ->
            prefs.allowAllApps = checked
            policy.applyPolicy()
            if (loadedApps.isEmpty()) renderAllowList() else renderAllowListRows(loadedApps)
        }
    }

    override fun onResume() {
        super.onResume()
        renderRecoveryState()
        renderPolicyLog()
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
    }

    private fun renderRecoveryState() {
        clearPanicButton.visibility = if (prefs.isPanicLocked()) View.VISIBLE else View.GONE
    }

    private fun openSystemSettings() {
        prefs.grantTemporaryAdminWindow(5)
        policy.applyPolicy()
        runCatching {
            if (policy.isInLockTaskMode()) policy.stopKiosk(this)
            startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        toast(getString(R.string.system_settings_unlocked_toast))
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

            val switch = row.findViewById<SwitchMaterial>(R.id.toggleSwitch)
            switch.isChecked = prefs.isAllowed(entry.packageName)
            switch.isEnabled = !prefs.allowAllApps
            switch.setOnCheckedChangeListener { _, checked ->
                prefs.setAppAllowed(entry.packageName, checked)
                policy.applyPolicy()
            }

            if (prefs.allowAllApps) row.alpha = 0.55f
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
}
