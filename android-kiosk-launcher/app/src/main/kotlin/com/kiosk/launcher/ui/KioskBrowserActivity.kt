package com.kiosk.launcher.ui

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences

class KioskBrowserActivity : AppCompatActivity() {

    private lateinit var prefs: KioskPreferences
    private lateinit var webView: WebView
    private lateinit var banner: TextView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk_browser)
        prefs = KioskPreferences(this)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
        toolbar.setNavigationOnClickListener { finish() }

        banner = findViewById(R.id.blockedBanner)
        webView = findViewById(R.id.webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean = decide(request.url)

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                decide(Uri.parse(url))
        }

        val start = prefs.domains().firstOrNull()
        if (start != null) webView.loadUrl("https://$start") else webView.loadUrl("about:blank")
    }

    private fun decide(uri: Uri): Boolean {
        val host = uri.host?.lowercase() ?: return true
        if (isAllowed(host)) return false

        banner.visibility = View.VISIBLE
        banner.text = "Blocked by policy · $host"
        Toast.makeText(this, "Blocked: $host", Toast.LENGTH_SHORT).show()
        return true
    }

    private fun isAllowed(host: String): Boolean {
        val domain = host.removePrefix("www.")
        return prefs.domains().any { allowed ->
            domain == allowed || domain.endsWith(".$allowed")
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
