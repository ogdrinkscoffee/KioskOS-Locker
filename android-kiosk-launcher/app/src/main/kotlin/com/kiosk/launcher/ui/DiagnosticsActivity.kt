package com.kiosk.launcher.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.net.Uri
import android.os.Bundle
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.kiosk.launcher.R
import com.kiosk.launcher.diagnostics.DiagnosticsCollector
import com.kiosk.launcher.diagnostics.DiagnosticsReport
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Shows the diagnostics report exactly as it is exported, so what an admin reads on the
 * kiosk is the same text that ends up in a bug report.
 */
class DiagnosticsActivity : AppCompatActivity() {

    private lateinit var reportView: TextView
    private var report: String = ""

    private val fileNameFormat = SimpleDateFormat("yyyyMMdd-HHmm", Locale.US)

    private val createFile =
        registerForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
            uri?.let { writeReport(it) }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_diagnostics)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationIcon(androidx.appcompat.R.drawable.abc_ic_ab_back_material)
        toolbar.setNavigationOnClickListener { finish() }
        applyEdgeToEdge(toolbar, findViewById(R.id.diagnosticsScroll))

        reportView = findViewById(R.id.diagnosticsReport)

        findViewById<android.view.View>(R.id.diagnosticsRefresh).setOnClickListener { render() }
        findViewById<android.view.View>(R.id.diagnosticsCopy).setOnClickListener { copyReport() }
        findViewById<android.view.View>(R.id.diagnosticsExport).setOnClickListener {
            createFile.launch(getString(R.string.diagnostics_file_name_fmt, fileNameFormat.format(Date())))
        }

        render()
    }

    private fun render() {
        val snapshot = DiagnosticsCollector(this).collect()
        report = DiagnosticsReport.render(snapshot)
        reportView.text = report
    }

    private fun copyReport() {
        val clipboard = getSystemService(ClipboardManager::class.java)
        clipboard?.setPrimaryClip(
            ClipData.newPlainText(getString(R.string.diagnostics_copy_label), report)
        )
        toast(getString(R.string.diagnostics_copied))
    }

    private fun writeReport(uri: Uri) {
        val written = runCatching {
            contentResolver.openOutputStream(uri)?.use { stream ->
                stream.write(report.toByteArray(Charsets.UTF_8))
            } != null
        }.getOrDefault(false)

        toast(
            getString(
                if (written) R.string.diagnostics_saved else R.string.diagnostics_save_failed
            )
        )
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
