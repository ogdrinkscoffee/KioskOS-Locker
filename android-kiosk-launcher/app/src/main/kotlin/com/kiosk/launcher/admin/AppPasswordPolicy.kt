package com.kiosk.launcher.admin

/**
 * Pure policy helpers for per-app password protection and lock-screen quick-launch filtering.
 */
object AppPasswordPolicy {

    const val MAX_QUICK_LAUNCH_APPS = 6

    fun requiresPassword(
        packageName: String,
        protectedPackages: Set<String>
    ): Boolean = packageName.isNotBlank() && packageName in protectedPackages

    fun filterQuickLaunchPackages(
        selectedPackages: List<String>,
        allowAllApps: Boolean,
        allowedPackages: Set<String>,
        panicLocked: Boolean,
        callingPackages: Set<String>
    ): List<String> {
        val visible = LinkedHashSet<String>()
        for (pkg in selectedPackages) {
            if (pkg.isBlank()) continue
            if (panicLocked && pkg !in callingPackages) continue
            if (!panicLocked && !allowAllApps && pkg !in allowedPackages) continue
            visible.add(pkg)
            if (visible.size >= MAX_QUICK_LAUNCH_APPS) break
        }
        return visible.toList()
    }
}
