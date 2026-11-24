package com.kiosk.launcher.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.widget.Toast
import com.kiosk.launcher.R
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences

/**
 * Receives asynchronous PackageInstaller session results for both
 * silent Device Owner in-app APK self-updates and package uninstallations.
 */
class UpdateResultReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE
        )
        val statusMessage = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE).orEmpty()

        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirmIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(Intent.EXTRA_INTENT)
            }
            if (confirmIntent != null) {
                confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    context.startActivity(confirmIntent)
                } catch (_: Exception) {
                }
            }
            return
        }

        when (intent.action) {
            ACTION_UNINSTALL_RESULT -> {
                val targetPkg = intent.getStringExtra(EXTRA_TARGET_PACKAGE).orEmpty()
                if (status == PackageInstaller.STATUS_SUCCESS) {
                    if (targetPkg.isNotEmpty()) {
                        KioskPreferences(context).setPackageAllowed(targetPkg, false)
                        DevicePolicyHelper.syncLockTaskPackages(context)
                    }
                    Toast.makeText(
                        context,
                        context.getString(R.string.toast_uninstall_success, targetPkg),
                        Toast.LENGTH_SHORT
                    ).show()
                    val notify = Intent(ACTION_PACKAGE_UNINSTALLED_EVENT).apply {
                        setPackage(context.packageName)
                        putExtra(EXTRA_TARGET_PACKAGE, targetPkg)
                    }
                    context.sendBroadcast(notify)
                } else {
                    Toast.makeText(
                        context,
                        context.getString(
                            R.string.toast_uninstall_failed,
                            statusMessage.ifEmpty { "status=$status" }
                        ),
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
            ACTION_INSTALL_RESULT -> {
                if (status == PackageInstaller.STATUS_SUCCESS) {
                    DevicePolicyHelper.enforceKioskPolicies(context)
                    Toast.makeText(context, R.string.toast_apk_install_success, Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(
                        context,
                        context.getString(
                            R.string.toast_apk_install_failed,
                            statusMessage.ifEmpty { "status=$status" }
                        ),
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    companion object {
        const val ACTION_INSTALL_RESULT = "com.kiosk.launcher.ACTION_INSTALL_RESULT"
        const val ACTION_UNINSTALL_RESULT = "com.kiosk.launcher.ACTION_UNINSTALL_RESULT"
        const val ACTION_PACKAGE_UNINSTALLED_EVENT = "com.kiosk.launcher.ACTION_PACKAGE_UNINSTALLED_EVENT"
        const val EXTRA_TARGET_PACKAGE = "com.kiosk.launcher.EXTRA_TARGET_PACKAGE"
    }
}
