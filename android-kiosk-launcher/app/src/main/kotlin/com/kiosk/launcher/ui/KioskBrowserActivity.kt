package com.kiosk.launcher.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences

class KioskBrowserActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var policy: DevicePolicyHelper
    private lateinit var webView: WebView
    private lateinit var banner: TextView
    private lateinit var urlInput: EditText

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk_browser)
        prefs = KioskPreferences(this)
        policy = DevicePolicyHelper(this)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
        toolbar.setNavigationOnClickListener { finish() }

        banner = findViewById(R.id.blockedBanner)
        urlInput = findViewById(R.id.browserUrlInput)
        webView = findViewById(R.id.webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean = decide(request.url)

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                decide(Uri.parse(url))

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                if (!url.isNullOrBlank() && url != "about:blank") {
                    urlInput.setText(url)
                }
            }
        }

        findViewById<View>(R.id.browserGoButton).setOnClickListener { navigateFromBar() }
        urlInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                navigateFromBar()
                true
            } else {
                false
            }
        }

        findViewById<View>(R.id.browserPanicButton).setOnClickListener { triggerBrowserPanic() }

        val start = prefs.domains().firstOrNull()
        if (start != null) {
            val initialUrl = "https://$start"
            urlInput.setText(initialUrl)
            webView.loadUrl(initialUrl)
        } else {
            webView.loadUrl("about:blank")
        }
    }

    private fun navigateFromBar() {
        val raw = urlInput.text?.toString()?.trim().orEmpty()
        if (raw.isEmpty()) return
        val hasScheme = raw.contains("://") || Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(raw)
        val normalized = if (hasScheme) raw else "https://$raw"
        val uri = Uri.parse(normalized)
        if (!decide(uri)) {
            banner.visibility = View.GONE
            webView.loadUrl(normalized)
        }
    }

    private fun decide(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") {
            showBlocked(
                getString(R.string.browser_blocked_banner_fmt, scheme ?: "unknown"),
                getString(R.string.browser_blocked_toast_fmt, scheme ?: "unknown")
            )
            return true
        }
        if (!uri.userInfo.isNullOrEmpty()) {
            val hostLabel = uri.host.orEmpty()
            showBlocked(
                getString(R.string.browser_blocked_banner_fmt, hostLabel),
                getString(R.string.browser_blocked_toast_fmt, hostLabel)
            )
            return true
        }
        val full = uri.toString().lowercase()
        val host = uri.host?.lowercase()?.takeIf { it.isNotBlank() } ?: return true

        val matchedKeyword = prefs.blockedKeywords().firstOrNull { kw ->
            kw.isNotBlank() && full.contains(kw)
        }
        if (matchedKeyword != null) {
            showBlocked(
                getString(R.string.browser_blocked_keyword_fmt, matchedKeyword),
                getString(R.string.browser_blocked_keyword_fmt, matchedKeyword)
            )
            return true
        }

        if (prefs.blockShortFormFeeds && isShortFormFeed(full, host)) {
            showBlocked(
                getString(R.string.browser_blocked_shortform),
                getString(R.string.browser_blocked_shortform)
            )
            return true
        }

        if (isAllowed(host)) {
            banner.visibility = View.GONE
            return false
        }

        showBlocked(
            getString(R.string.browser_blocked_banner_fmt, host),
            getString(R.string.browser_blocked_toast_fmt, host)
        )
        return true
    }

    private fun showBlocked(bannerText: String, toastText: String) {
        banner.visibility = View.VISIBLE
        banner.text = bannerText
        Toast.makeText(this, toastText, Toast.LENGTH_SHORT).show()
    }

    private fun isShortFormFeed(fullUrl: String, host: String): Boolean {
        if (host.contains("tiktok.com")) return true
        return fullUrl.contains("/shorts") || fullUrl.contains("/reels") || fullUrl.contains("/reel/")
    }

    private fun isAllowed(host: String): Boolean {
        val domain = host.removePrefix("www.")
        return prefs.domains().any { allowed ->
            domain == allowed || domain.endsWith(".$allowed")
        }
    }

    private fun triggerBrowserPanic() {
        runCatching {
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.clearHistory()
            webView.clearCache(true)
            webView.clearFormData()
            CookieManager.getInstance().removeAllCookies(null)
        }
        policy.wipeClipboard()
        prefs.triggerPanicLockdown()
        policy.applyPolicy()
        Toast.makeText(this, getString(R.string.panic_toast), Toast.LENGTH_SHORT).show()
        startActivity(
            Intent(this, KioskLauncherActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        )
        finish()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
