# Keep the device admin receiver name stable: it is referenced by
# `adb shell dpm set-device-owner com.kiosk.launcher/.admin.KioskDeviceAdminReceiver`.
-keep class com.kiosk.launcher.admin.KioskDeviceAdminReceiver { *; }
-keep class com.kiosk.launcher.service.KioskGuardAccessibilityService { *; }
