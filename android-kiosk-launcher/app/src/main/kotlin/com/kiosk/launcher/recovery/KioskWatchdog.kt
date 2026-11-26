package com.kiosk.launcher.recovery

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Keeps the liveness check armed outside the launcher activity.
 *
 * One repeating alarm wakes [KioskWatchdogReceiver], which restores the kiosk when
 * [RecoveryPolicy] says a restore is owed. The alarm is system-held, so it fires even after the
 * launcher process has been killed; that is the whole point of not running the check in-process.
 *
 * Armed from [com.kiosk.launcher.admin.DevicePolicyHelper.applyPolicy], so enabling the kiosk
 * arms it, switching the kiosk off disarms it, and every cold start or boot re-arms it —
 * repeating alarms do not survive a reboot.
 */
object KioskWatchdog {

    /** Android may coalesce or defer an inexact repeating alarm; this is the floor, not a promise. */
    const val INTERVAL_MS = 2 * 60_000L

    /** A crash is retried almost immediately; the repeating alarm stays the slower backstop. */
    private const val CRASH_RETRY_MS = 3_000L

    fun sync(context: Context, watch: Boolean) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        if (!watch) {
            pendingIntent(context, REPEAT_REQUEST, PendingIntent.FLAG_NO_CREATE)?.let { pending ->
                runCatching { manager.cancel(pending) }
            }
            return
        }
        val pending = pendingIntent(context, REPEAT_REQUEST, PendingIntent.FLAG_UPDATE_CURRENT)
            ?: return
        runCatching {
            manager.setInexactRepeating(
                AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + INTERVAL_MS,
                INTERVAL_MS,
                pending
            )
        }
    }

    /**
     * Called from the crash handler. The process is dying and cannot start anything, but the alarm
     * outlives it and brings the kiosk back a few seconds later. Its own request code keeps it
     * from replacing the repeating alarm, which scheduling with the same PendingIntent would do.
     */
    fun scheduleCrashRetry(context: Context) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pending = pendingIntent(context, RETRY_REQUEST, PendingIntent.FLAG_UPDATE_CURRENT)
            ?: return
        val at = System.currentTimeMillis() + CRASH_RETRY_MS
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            } else {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
            }
        }
    }

    private fun pendingIntent(context: Context, requestCode: Int, flags: Int): PendingIntent? =
        runCatching {
            PendingIntent.getBroadcast(
                context.applicationContext,
                requestCode,
                Intent(context.applicationContext, KioskWatchdogReceiver::class.java),
                flags or PendingIntent.FLAG_IMMUTABLE
            )
        }.getOrNull()

    private const val REPEAT_REQUEST = 42
    private const val RETRY_REQUEST = 43
}
