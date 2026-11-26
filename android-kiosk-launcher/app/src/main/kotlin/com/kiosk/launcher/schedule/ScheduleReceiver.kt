package com.kiosk.launcher.schedule

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The boundary alarm. Declared in the manifest so it also runs when the launcher process is gone —
 * the whole point of a schedule is that it works while nobody is using the device.
 */
class ScheduleReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        runCatching { ScheduleController.refresh(context) }
    }
}
