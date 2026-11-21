package com.kiosk.launcher.ui

import android.app.admin.DevicePolicyManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
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
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AdminSettingsActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var policy: DevicePolicyHelper
    private lateinit var appRepo: InstalledAppsRepository

    private lateinit var locksContainer: LinearLayout
    private lateinit var appsContainer: LinearLayout
    private lateinit var allowAllSwitch: SwitchMaterial
    private lateinit var modeGroup: MaterialButtonToggleGroup
    private lateinit var domainsInput: TextInputEditText
    private lateinit var modeHint: TextView
    private lateinit var policyLog: TextView

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

        locksContainer = findViewById(R.id.locksContainer)
        appsContainer = findViewById(R.id.appsContainer)
        allowAllSwitch = findViewById(R.id.allowAllSwitch)
        modeGroup = findViewById(R.id.modeGroup)
        domainsInput = findViewById(R.id.domainsInput)
        modeHint = findViewById(R.id.modeHint)
        policyLog = findViewById(R.id.policyLog)

        findViewById<View>(R.id.changePinButton).setOnClickListener { changePin() }
        findViewById<View>(R.id.copyCommandButton).setOnClickListener { copyProvisionCommand() }
        findViewById<View>(R.id.activateAdminButton).setOnClickListener { activateDeviceAdmin() }
        findViewById<View>(R.id.openBrowserButton).setOnClickListener {
            startActivity(Intent(this, KioskBrowserActivity::class.java))
        }
        findViewById<View>(R.id.domainsSave).setOnClickListener { saveDomains() }

        domainsInput.setText(prefs.domains().sorted().joinToString("\n"))

        renderOwner()
        renderMode()
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
            renderAllowList()
        }
    }

    override fun onResume() {
        super.onResume()
        renderPolicyLog()
    }

    // ---------------------------------------------------------------- provisioning
    private fun renderOwner() {
        val status = findViewById<TextView>(R.id.ownerStatus)
        val detail = findViewById<TextView>(R.id.ownerDetail)

        if (policy.isDeviceOwner) {
            status.text = "Active — this app owns the device"
            detail.text = "Kiosk mode, the allowlist and every lock below are enforced by Android."
        } else {
            status.text = "Preview mode"
            detail.text = "The launcher works, but Android only enforces kiosk locks for a device owner app. " +
                "On a freshly reset device, enable Developer options → USB debugging and run:\n\n" +
                DevicePolicyHelper.PROVISION_COMMAND
        }
    }

    private fun copyProvisionCommand() {
        val clipboard = getSystemService(ClipboardManager::class.java)
        clipboard?.setPrimaryClip(
            ClipData.newPlainText("Kiosk provisioning", DevicePolicyHelper.PROVISION_COMMAND)
        )
        toast("Provisioning command copied")
    }

    private fun activateDeviceAdmin() {
        if (policy.isAdminActive) {
            toast("Device admin is already active")
            return
        }
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
            .putExtra(
                DevicePolicyManager.EXTRA_DEVICE_ADMIN,
                ComponentName(this, KioskDeviceAdminReceiver::class.java)
            )
            .putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Lets KioskOS keep this device in kiosk mode."
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
        KioskPreferences.MODE_SINGLE -> "Pins one app. Pick the first allowed app as the kiosk app."
        KioskPreferences.MODE_BROWSER -> "Opens the allowlisted browser as the kiosk surface."
        else -> "Shows every allowed app in the kiosk grid."
    }

    // ---------------------------------------------------------------------- locks
    private fun renderLocks() {
        locksContainer.removeAllViews()
        addToggle("Status bar", "Hide the notification shade", prefs.statusBarLocked) {
            prefs.statusBarLocked = it
            applyLocks()
        }
        addToggle("Lock screen", "Skip the keyguard", prefs.keyguardDisabled) {
            prefs.keyguardDisabled = it
            applyLocks()
        }
        addToggle("Camera", "Disable the camera", prefs.cameraDisabled) {
            prefs.cameraDisabled = it
            applyLocks()
        }
        addToggle("Screenshots", "Block screen capture", prefs.screenCaptureDisabled) {
            prefs.screenCaptureDisabled = it
            applyLocks()
        }
        addToggle("USB transfer", "Block file transfer and new media", prefs.usbLocked) {
            prefs.usbLocked = it
            applyLocks()
        }
        addToggle("Date & time", "Keep automatic date and time", prefs.dateTimeLocked) {
            prefs.dateTimeLocked = it
            applyLocks()
        }
        addToggle("Stay awake", "Keep the screen on while plugged in", prefs.stayAwake) {
            prefs.stayAwake = it
            applyLocks()
        }
        addToggle(
            "Window guard",
            "Jump back to kiosk if a blocked app opens (needs accessibility)",
            prefs.guardEnabled
        ) { enabled ->
            prefs.guardEnabled = enabled
            prefs.logPolicy("Window guard ${if (enabled) "enabled" else "disabled"}")
            if (enabled) {
                runCatching {
                    startActivity(Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS))
                }
                toast("Enable KioskOS under Accessibility")
            }
            renderPolicyLog()
        }
    }

    private fun applyLocks() {
        policy.applyPolicy()
        renderPolicyLog()
    }

    private fun addToggle(
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
            setTextColor(colorOf(R.color.text_primary))
            textSize = 14f
        })
        column.addView(TextView(this).apply {
            text = subtitle
            setTextColor(colorOf(R.color.text_secondary))
            textSize = 11f
        })

        val switch = SwitchMaterial(this).apply {
            isChecked = initial
            setOnCheckedChangeListener { _, checked -> onChange(checked) }
        }

        row.addView(column)
        row.addView(switch)
        locksContainer.addView(row)
    }

    // ------------------------------------------------------------------ allowlist
    private fun renderAllowList() {
        appsContainer.removeAllViews()
        allowAllSwitch.isChecked = prefs.allowAllApps

        val installed = appRepo.launchable()
        if (installed.isEmpty()) {
            appsContainer.addView(TextView(this).apply {
                text = "No launchable apps found."
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
    private fun saveDomains() {
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

        prefs.setDomains(domains)
        prefs.logPolicy("Browser allowlist: ${domains.size} domain(s)")
        toast("Saved ${domains.size} domain(s)")
        renderPolicyLog()
    }

    // ------------------------------------------------------------------------ PIN
    private fun changePin() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            filters = arrayOf(InputFilter.LengthFilter(4))
            hint = "New 4-digit PIN"
            setPadding(dp(24), dp(12), dp(24), dp(4))
        }

        MaterialAlertDialogBuilder(this)
            .setTitle("Change admin PIN")
            .setView(input)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                val pin = input.text?.toString().orEmpty()
                if (pin.length == 4) {
                    prefs.setPin(pin)
                    prefs.logPolicy("Admin PIN changed")
                    toast("PIN updated")
                    renderPolicyLog()
                } else {
                    toast("PIN must be exactly 4 digits")
                }
            }
            .show()
    }

    // ----------------------------------------------------------------- policy log
    private fun renderPolicyLog() {
        val events = prefs.policyEvents().take(6)
        policyLog.text = if (events.isEmpty()) {
            "No policy events yet."
        } else {
            events.joinToString("\n") { "${timeFormat.format(Date(it.time))}  ${it.label}" }
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
