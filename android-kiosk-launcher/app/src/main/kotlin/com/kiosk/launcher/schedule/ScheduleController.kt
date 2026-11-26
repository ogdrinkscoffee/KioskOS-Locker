package com.kiosk.launcher.schedule

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences

/**
 * Applies a scheduled window boundary: when the schedule flips, the policy is re-applied so the
 * device really becomes a kiosk (or a normal phone) instead of waiting for the next Admin visit.
 *
 * Called from the boundary alarm, from boot, from a cold start, from a clock or time-zone change
 * and from the launcher's resume. The stored [KioskPreferences.scheduleObservedActive] keeps the
 * heavy policy pass and the log line to the actual transition, so a resume storm changes nothing.
 */
object ScheduleController {

    fun refresh(context: Context) {
        val prefs = KioskPreferences(context)
        val active = prefs.isKioskActiveNow()
        if (prefs.scheduleObservedActive != active) {
            prefs.scheduleObservedActive = active
            prefs.logPolicy(
                if (active) "Scheduled kiosk window started" else "Scheduled window ended — normal phone"
            )
            runCatching { DevicePolicyHelper(context).applyPolicy() }
        }
        ScheduleAlarm.sync(context)
    }
}

/**
 * Keeps exactly one alarm on the next moment the schedule changes state.
 *
 * The instant comes from [KioskSchedule.nextChangeAt], which walks real minutes through the zone's
 * rules, so a DST jump, an overnight window or a clock the admin just changed all resolve without
 * offset arithmetic. Re-armed from `applyPolicy()` too, which is what covers boot and an update:
 * alarms do not survive a reboot.
 */
object ScheduleAlarm {

    fun sync(context: Context) {
        val prefs = KioskPreferences(context)
        val manager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return

        val windows = (prefs.scheduleWindowsParsed() as? ScheduleParse.Parsed)?.windows.orEmpty()
        val next = if (prefs.scheduleEnabled) {
            KioskSchedule.nextChangeAt(windows, System.currentTimeMillis())
        } else {
            null
        }

        if (next == null) {
            pendingIntent(context, PendingIntent.FLAG_NO_CREATE)?.let { pending ->
                runCatching { manager.cancel(pending) }
            }
            return
        }

        val pending = pendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
                // Without the exact-alarm grant a boundary can land late; the launcher's resume
                // re-checks the schedule, so the device never stays in the wrong mode.
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
            } else {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
            }
        }
    }

    private fun pendingIntent(context: Context, flags: Int): PendingIntent? = runCatching {
        PendingIntent.getBroadcast(
            context.applicationContext,
            REQUEST_CODE,
            Intent(context.applicationContext, ScheduleReceiver::class.java),
            flags or PendingIntent.FLAG_IMMUTABLE
        )
    }.getOrNull()

    private const val REQUEST_CODE = 44
}
