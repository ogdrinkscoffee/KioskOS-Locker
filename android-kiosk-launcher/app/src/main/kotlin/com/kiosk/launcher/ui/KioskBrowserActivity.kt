/**
 * Copyright (c) 2026 [Your Name / Studio Name]. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, reverse-engineering,
 * modification, or redistribution of this file is strictly prohibited.
 */
package com.kiosk.launcher.ui

import android.annotation.SuppressLint
import android.content.res.Configuration
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.databinding.ActivityKioskBrowserBinding

/**
 * Locked Kiosk Web Browser (similar to Fully Kiosk Browser).
 * Enforces strict domain allowlisting + hard blocking of adult and social media hosts.
 */
class KioskBrowserActivity : AppCompatActivity() {

    private lateinit var binding: ActivityKioskBrowserBinding
    private lateinit var prefs: KioskPreferences
    private var pinDialog: androidx.appcompat.app.AlertDialog? = null
    private val usageHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var lastTickElapsedMs: Long = 0L
    private val usageRunnable = object : Runnable {
        override fun run() {
            val nowElapsed = android.os.SystemClock.elapsedRealtime()
            val deltaSec = ((nowElapsed - lastTickElapsedMs) / 1000L).toInt().coerceIn(0, 60)
            lastTickElapsedMs = nowElapsed
            if (deltaSec > 0 && prefs.getAppDailyLimitMinutes(KioskPreferences.KIOSK_BROWSER_PACKAGE) > 0) {
                prefs.addAppUsageSeconds(KioskPreferences.KIOSK_BROWSER_PACKAGE, deltaSec)
            }
            val blockReason = prefs.getTimeOrScheduleBlockReason(KioskPreferences.KIOSK_BROWSER_PACKAGE)
            if (blockReason != null) {
                prefs.incrementBlockedAttemptsToday()
                Toast.makeText(this@KioskBrowserActivity, blockReason, Toast.LENGTH_LONG).show()
                finish()
                return
            }
            usageHandler.postDelayed(this, 5_000L)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityKioskBrowserBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = KioskPreferences(this)
        val initialBlock = prefs.getTimeOrScheduleBlockReason(KioskPreferences.KIOSK_BROWSER_PACKAGE)
        if (initialBlock != null) {
            prefs.incrementBlockedAttemptsToday()
            Toast.makeText(this, initialBlock, Toast.LENGTH_LONG).show()
            finish()
            return
        }

        syncWindowAndLockTask()
        setupWebView()
        setupControls()
    }

    override fun onResume() {
        super.onResume()
        DevicePolicyHelper.reconcileAdminUnlockTimeout(this)
        syncWindowAndLockTask()
        lastTickElapsedMs = android.os.SystemClock.elapsedRealtime()
        usageHandler.removeCallbacks(usageRunnable)
        usageHandler.postDelayed(usageRunnable, 5_000L)
    }

    override fun onPause() {
        usageHandler.removeCallbacks(usageRunnable)
        val deltaSec = ((android.os.SystemClock.elapsedRealtime() - lastTickElapsedMs) / 1000L).toInt().coerceIn(0, 60)
        if (deltaSec > 0 && ::prefs.isInitialized && prefs.getAppDailyLimitMinutes(KioskPreferences.KIOSK_BROWSER_PACKAGE) > 0) {
            prefs.addAppUsageSeconds(KioskPreferences.KIOSK_BROWSER_PACKAGE, deltaSec)
        }
        super.onPause()
    }

    override fun onDestroy() {
        usageHandler.removeCallbacks(usageRunnable)
        pinDialog?.dismiss()
        if (::binding.isInitialized) {
            binding.kioskWebView.destroy()
        }
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applySystemBarVisibility()
    }

    private fun syncWindowAndLockTask() {
        if (prefs.isKeepScreenAwake()) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        val unlocked = prefs.isSettingsAndUninstallUnlocked()
        if (unlocked) {
            try {
                stopLockTask()
            } catch (_: IllegalStateException) {
            }
        } else if (DevicePolicyHelper.isDeviceOwner(this)) {
            DevicePolicyHelper.syncLockTaskPackages(this)
            try {
                startLockTask()
            } catch (_: IllegalStateException) {
            }
        }
        applySystemBarVisibility()
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

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val allowedDomains = prefs.getAllowedDomains()
        binding.kioskWebView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        binding.kioskWebView.setDownloadListener { _, _, _, _, _ ->
            Toast.makeText(this, R.string.toast_browser_download_blocked, Toast.LENGTH_SHORT).show()
        }

        binding.kioskWebView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return true
                val allowed = KioskPreferences.isUrlAllowedInKioskBrowser(
                    rawUrl = url,
                    allowedDomains = prefs.getAllowedDomains(),
                    blockedKeywords = if (prefs.isDisablePornOnBrowsers()) prefs.getBlockedKeywords() else emptySet(),
                    blockShortFormFeeds = prefs.isBlockShortFormFeeds()
                )
                if (!allowed) {
                    Toast.makeText(
                        this@KioskBrowserActivity,
                        getString(R.string.toast_browser_domain_blocked, KioskPreferences.extractHost(url)),
                        Toast.LENGTH_SHORT
                    ).show()
                    return true
                }
                binding.browserUrlInput.setText(url)
                return false
            }
        }

        val initialHost = allowedDomains.firstOrNull() ?: "wikipedia.org"
        val startUrl = "https://$initialHost"
        binding.browserUrlInput.setText(startUrl)
        binding.kioskWebView.loadUrl(startUrl)
    }

    private fun setupControls() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.kioskWebView.canGoBack()) {
                    binding.kioskWebView.goBack()
                } else if (
                    prefs.getKioskMode() != KioskPreferences.MODE_KIOSK_BROWSER ||
                    prefs.isSettingsAndUninstallUnlocked()
                ) {
                    finish()
                }
            }
        })

        binding.browserGoButton.setOnClickListener {
            val raw = binding.browserUrlInput.text?.toString()?.trim().orEmpty()
            val normalized = if (raw.contains("://")) raw else "https://$raw"
            val allowed = KioskPreferences.isUrlAllowedInKioskBrowser(
                rawUrl = normalized,
                allowedDomains = prefs.getAllowedDomains(),
                blockedKeywords = if (prefs.isDisablePornOnBrowsers()) prefs.getBlockedKeywords() else emptySet(),
                blockShortFormFeeds = prefs.isBlockShortFormFeeds()
            )
            if (allowed) {
                binding.kioskWebView.loadUrl(normalized)
            } else {
                Toast.makeText(
                    this,
                    getString(R.string.toast_browser_domain_blocked, KioskPreferences.extractHost(normalized)),
                    Toast.LENGTH_LONG
                ).show()
            }
        }

        binding.browserBackButton.setOnClickListener {
            if (binding.kioskWebView.canGoBack()) binding.kioskWebView.goBack()
        }

        binding.browserReloadButton.setOnClickListener {
            binding.kioskWebView.reload()
        }

        binding.browserExitButton.setOnClickListener {
            if (prefs.getKioskMode() == KioskPreferences.MODE_KIOSK_BROWSER && !prefs.isSettingsAndUninstallUnlocked()) {
                pinDialog?.dismiss()
                pinDialog = PinPromptDialog.show(
                    context = this,
                    title = getString(R.string.admin_pin_prompt_title),
                    subtitle = getString(R.string.admin_pin_exit_browser_subtitle)
                ) {
                    finish()
                }
            } else {
                finish()
            }
        }

        binding.browserPanicButton.setOnClickListener {
            binding.kioskWebView.stopLoading()
            binding.kioskWebView.loadUrl("about:blank")
            binding.kioskWebView.clearHistory()
            binding.kioskWebView.clearFormData()
            binding.kioskWebView.clearCache(true)
            binding.browserUrlInput.setText("")
            DevicePolicyHelper.triggerEmergencyPanic(this)
            finish()
        }
    }
}
