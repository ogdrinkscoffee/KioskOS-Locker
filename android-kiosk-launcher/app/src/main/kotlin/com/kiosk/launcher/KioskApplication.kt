package com.kiosk.launcher

import android.app.Application
import com.kiosk.launcher.admin.DevicePolicyHelper

class KioskApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Automatically enforce Device Owner restrictions whenever the process starts,
        // including during Direct Boot before the user unlocks the device.
        DevicePolicyHelper.enforceKioskPolicies(this)
    }
}
