package com.kiosk.launcher

import android.app.Activity
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import androidx.core.content.ContextCompat
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.receiver.LockScreenController
import com.kiosk.launcher.recovery.KioskWatchdog
import com.kiosk.launcher.recovery.RecoveryPolicy
import com.kiosk.launcher.schedule.ScheduleController

class KioskApplication : Application() {

    private var lockScreenReceiver: BroadcastReceiver? = null
    private lateinit var prefs: KioskPreferences
    private val handler = Handler(Looper.getMainLooper())

    /** Our own activities currently in front; zero means the kiosk is meant to be away. */
    private var resumedActivities = 0

    /**
     * Proof of life for [RecoveryPolicy]: the stored timestamp is only refreshed while this
     * process runs, so a stale one means it died. The first beat is deliberately delayed; a
     * process restarted by the watchdog must still read the dead process's old value.
     */
    private val heartbeat = object : Runnable {
        override fun run() {
            prefs.launcherHeartbeatMs = System.currentTimeMillis()
            handler.postDelayed(this, HEARTBEAT_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = KioskPreferences(this)
        // Installed first: a crash anywhere in this start has to schedule its own recovery.
        installCrashRecovery()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(
                NotificationChannel(CHANNEL, "Kiosk status", NotificationManager.IMPORTANCE_LOW)
            )
        }
        // Resolve the explicit kiosk state before touching Home. Older builds pinned every
        // device owner and kept no record of consent, so the migration reads Home ownership
        // once: a device already running as Home stays a kiosk until an admin turns it off,
        // while one that never owned Home is released. Home is only touched to drop a pin the
        // state no longer wants; re-pinning here would silently undo an admin who made another
        // launcher Home, which is exactly what the "waiting for Home" state reports.
        val currentVersionCode = runCatching {
            val info = packageManager.getPackageInfo(packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                info.versionCode
            }
        }.getOrDefault(0)
        if (currentVersionCode > 0 && prefs.lastAppliedVersionCode != currentVersionCode) {
            prefs.finishUpdateInstall()
            // Re-run the uninstall-block release sweep once on every upgrade so any leftover
            // locks from earlier builds or updates are cleaned up automatically.
            prefs.uninstallReleaseSwept = false
            prefs.lastAppliedVersionCode = currentVersionCode
        }
        val policy = DevicePolicyHelper(this)
        if (!prefs.migrateKioskState(homeIsKiosk = policy.isDefaultLauncher).enabled) {
            policy.clearHomeLauncher()
        }
        // Re-apply policy on every cold start; a no-op unless this app is the device owner,
        // and a release pass whenever the kiosk is off or another launcher owns Home.
        policy.applyPolicy()
        registerPackageUpdates()
        registerLockScreenTriggers()
        registerScheduleTriggers()
        watchKioskVisibility()
        // A window may have flipped while the device was off; a cold start settles it.
        runCatching { ScheduleController.refresh(this) }
    }

    /**
     * A crashed kiosk stays dark until somebody with adb restarts it, so a dying process has to
     * leave a way back. It cannot start anything itself; it records the crash, arms an alarm a
     * few seconds out and then lets the process die the way Android expects. The manifest
     * receiver does the restoring, and [RecoveryPolicy] decides whether it should.
     */
    private fun installCrashRecovery() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                prefs.logPolicy("Launcher crashed: ${error.javaClass.simpleName}")
                val isKiosk = RecoveryPolicy.shouldWatch(
                    kioskEnabled = prefs.kioskEnabled,
                    isDefaultLauncher = DevicePolicyHelper(this).isDefaultLauncher
                )
                if (isKiosk) KioskWatchdog.scheduleCrashRetry(this)
            }
            if (previous != null) {
                previous.uncaughtException(thread, error)
            } else {
                Process.killProcess(Process.myPid())
                kotlin.system.exitProcess(10)
            }
        }
    }

    /**
     * Records whether one of this app's own screens is in front, so the watchdog can tell "the
     * kiosk died on screen" (dark device) from "the kiosk is meant to be away": a kiosk app, the
     * lock screen, the admin window and a dark display all leave every activity paused.
     */
    private fun watchKioskVisibility() {
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) {
                resumedActivities += 1
                prefs.kioskUiVisible = true
                prefs.launcherHeartbeatMs = System.currentTimeMillis()
            }

            override fun onActivityPaused(activity: Activity) {
                // Pause always precedes the next resume, so switching screens can only flick this
                // false for an instant; a watchdog tick in that instant just does nothing.
                resumedActivities = (resumedActivities - 1).coerceAtLeast(0)
                if (resumedActivities == 0) prefs.kioskUiVisible = false
            }

            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
            override fun onActivityStarted(activity: Activity) = Unit
            override fun onActivityStopped(activity: Activity) = Unit
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
            override fun onActivityDestroyed(activity: Activity) = Unit
        })
        handler.postDelayed(heartbeat, HEARTBEAT_MS)
    }

    /**
     * ACTION_SCREEN_OFF is a registered-only broadcast: a manifest filter for it is ignored,
     * so this lives with the process. It only records that a lock is owed — the lock screen
     * itself is started by the kiosk activity when it next comes to the front.
     *
     * Registered as RECEIVER_EXPORTED on purpose: Android may refuse to deliver a system
     * broadcast to a NOT_EXPORTED receiver, and this one is the only thing that ever marks a
     * lock as owed. It is a protected broadcast, so no other app can send it.
     */
    private fun registerLockScreenTriggers() {
        if (lockScreenReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val appContext = context?.applicationContext ?: return
                if (intent?.action != Intent.ACTION_SCREEN_OFF) return
                runCatching { LockScreenController.onScreenOff(appContext) }
            }
        }
        lockScreenReceiver = receiver
        runCatching {
            ContextCompat.registerReceiver(
                this,
                receiver,
                IntentFilter(Intent.ACTION_SCREEN_OFF),
                ContextCompat.RECEIVER_EXPORTED
            )
        }
    }

    /**
     * A clock or time-zone change moves every wall-clock boundary, so the state is re-checked and
     * the alarm re-armed for the new local time. Registered exported for the same reason as
     * SCREEN_OFF: these are system broadcasts a NOT_EXPORTED receiver may never see.
     */
    private fun registerScheduleTriggers() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
        }
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                runCatching { ScheduleController.refresh(this@KioskApplication) }
            }
        }
        runCatching {
            ContextCompat.registerReceiver(this, receiver, filter, ContextCompat.RECEIVER_EXPORTED)
        }
    }

    private fun registerPackageUpdates() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addDataScheme("package")
        }
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val appCtx = context ?: return
                val pkg = intent?.data?.schemeSpecificPart
                runCatching { DevicePolicyHelper(appCtx).onPackagesChanged(pkg) }
            }
        }
        runCatching {
            ContextCompat.registerReceiver(this, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        }
    }

    companion object {
        const val CHANNEL = "kiosk_status"

        /** Well under [RecoveryPolicy.STALE_AFTER_MS], so a live process always looks alive. */
        private const val HEARTBEAT_MS = 30_000L
    }
}
