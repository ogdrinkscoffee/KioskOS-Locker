package com.kiosk.launcher.admin

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.receiver.AdminWindowReceiver

/**
 * Keeps one alarm set for the deadline of the temporary admin window.
 *
 * The window used to be closed only by a timer in [com.kiosk.launcher.ui.KioskLauncherActivity],
 * and that timer is removed in `onStop`. The admin spends the window in system Settings, where
 * the launcher is stopped, so nothing ran at the deadline: the released policy (status bar,
 * uninstall blocks, lock task package list) stayed released until the next cold start, which
 * reads as a window that never expires.
 *
 * Scheduled from [DevicePolicyHelper.applyPolicy] rather than from each grant call, so every
 * path that opens the window and every cold start converge on the same stored deadline. The
 * launcher-side tick remains a backstop while the kiosk is on screen.
 */
object AdminWindowExpiry {

    /** Schedules or cancels the alarm so it matches [KioskPreferences.adminUnlockedUntilMs]. */
    fun sync(context: Context, prefs: KioskPreferences) {
        val manager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val until = prefs.adminUnlockedUntilMs
        if (until <= System.currentTimeMillis()) {
            // FLAG_NO_CREATE so a kiosk that never opens the window never allocates one.
            pendingIntent(context, PendingIntent.FLAG_NO_CREATE)?.let { pending ->
                runCatching { manager.cancel(pending) }
            }
            return
        }
        val pending = pendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
                // The exact-alarm permission is not granted by default on Android 13+, and an
                // inexact delivery still closes the window; the launcher tick covers the rest.
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, until, pending)
            } else {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, until, pending)
            }
        }
    }

    private fun pendingIntent(context: Context, flags: Int): PendingIntent? = runCatching {
        PendingIntent.getBroadcast(
            context.applicationContext,
            REQUEST_CODE,
            Intent(context.applicationContext, AdminWindowReceiver::class.java),
            flags or PendingIntent.FLAG_IMMUTABLE
        )
    }.getOrNull()

    private const val REQUEST_CODE = 41
}
