package com.kiosk.launcher.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.selfimprovement.KioskGoal
import com.kiosk.launcher.selfimprovement.KioskGoalMilestone
import com.kiosk.launcher.selfimprovement.KioskHabit
import com.kiosk.launcher.selfimprovement.KioskNote
import com.kiosk.launcher.selfimprovement.KioskTask
import com.kiosk.launcher.selfimprovement.SelfImprovementRepository
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.Executors

/**
 * Optional, offline-first REST client for syncing Kiosk Status, Password-Verified Remote
 * Admin Settings, and Self-Improvement Progress with PC Web via Firebase Firestore v1 REST.
 *
 * Offline-first contract:
 * - Strictly opt-in (isCloudSyncEnabled() == false by default).
 * - When disabled or offline, immediately marks dirty queue (if enabled) and returns without
 *   blocking mobile UI, launchers, blockers, or local storage.
 * - Never uploads plaintext Admin PIN; only uploads salted SHA-256 hash & salt.
 */
object CloudSyncManager {

    const val FIREBASE_PROJECT_ID = "gen-lang-client-0895914115"
    const val FIRESTORE_DATABASE_ID = "ai-studio-kioskosandroidde-3cc55565-6960-4022-8bbe-add7ccccf9a3"
    const val FIREBASE_API_KEY = "AIzaSyAxyYfKYsXRWR9W4NaP515IBGltlEQsv5s"

    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "KioskCloudSyncWorker").apply { isDaemon = true }
    }

    sealed class SyncOutcome {
        data object Disabled : SyncOutcome()
        data object MissingCredentials : SyncOutcome()
        data class OfflineQueued(val reason: String) : SyncOutcome()
        data class Success(
            val pulledRemoteDeviceSettings: Boolean,
            val pulledRemoteGrowth: Boolean,
            val syncedAtMs: Long
        ) : SyncOutcome()
        data class Failed(val errorMessage: String) : SyncOutcome()
    }

    fun isNetworkOnline(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return false
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (_: Exception) {
            false
        }
    }

    fun triggerSyncIfEnabled(context: Context, onComplete: ((SyncOutcome) -> Unit)? = null) {
        val appContext = context.applicationContext
        val prefs = KioskPreferences(appContext)
        if (!prefs.isCloudSyncEnabled()) {
            onComplete?.invoke(SyncOutcome.Disabled)
            return
        }
        if (prefs.getCloudUid().isBlank() || prefs.getCloudRefreshToken().isBlank()) {
            onComplete?.invoke(SyncOutcome.MissingCredentials)
            return
        }
        if (!isNetworkOnline(appContext)) {
            prefs.setCloudSyncDirty(true)
            onComplete?.invoke(SyncOutcome.OfflineQueued("Offline — queued locally for next connection."))
            return
        }
        executor.execute {
            val outcome = syncNowBlocking(appContext)
            onComplete?.invoke(outcome)
        }
    }

    fun syncNowBlocking(context: Context): SyncOutcome {
        val appContext = context.applicationContext
        val prefs = KioskPreferences(appContext)
        val growthRepo = SelfImprovementRepository(appContext)

        if (!prefs.isCloudSyncEnabled()) return SyncOutcome.Disabled
        val uid = prefs.getCloudUid()
        val refreshToken = prefs.getCloudRefreshToken()
        if (uid.isBlank() || refreshToken.isBlank()) return SyncOutcome.MissingCredentials

        if (!isNetworkOnline(appContext)) {
            prefs.setCloudSyncDirty(true)
            return SyncOutcome.OfflineQueued("Device offline — local storage remains authoritative.")
        }

        return try {
            val idToken = exchangeRefreshTokenForIdToken(refreshToken)
                ?: return SyncOutcome.Failed("Could not authenticate Sync Refresh Token.")

            val deviceId = prefs.getCloudDeviceId()
            val lastSyncMs = prefs.getLastCloudSyncMs()

            // 1. Ensure /users/{uid} exists
            ensureUserDocument(uid, prefs.getCloudEmail(), deviceId, idToken)

            // 2. Pull remote device doc if present & check for newer pc_web override
            val deviceDocPath = "users/$uid/devices/$deviceId"
            val existingDeviceDoc = getFirestoreDocument(deviceDocPath, idToken)
            var pulledDevice = false
            var existingDeviceCreatedAt: String? = null

            if (existingDeviceDoc != null) {
                val fields = existingDeviceDoc.optJSONObject("fields")
                if (fields != null) {
                    existingDeviceCreatedAt = readTimestamp(fields, "createdAt")
                    val remoteUpdatedMs = parseTimestampMs(readTimestamp(fields, "updatedAt"))
                    val modifiedBy = readString(fields, "lastModifiedBy")
                    if (modifiedBy == "pc_web" && remoteUpdatedMs > lastSyncMs) {
                        applyRemoteDeviceFields(appContext, prefs, fields)
                        DevicePolicyHelper.enforceKioskPolicies(appContext)
                        pulledDevice = true
                    }
                }
            }

            // 3. Push current device state (creates or updates)
            commitDeviceDocument(
                appContext = appContext,
                prefs = prefs,
                uid = uid,
                deviceId = deviceId,
                existingCreatedAt = existingDeviceCreatedAt,
                idToken = idToken
            )

            // 4. Pull remote growth doc if present & check for newer pc_web check-ins/edits
            val growthDocPath = "users/$uid/growth/main"
            val existingGrowthDoc = getFirestoreDocument(growthDocPath, idToken)
            var pulledGrowth = false
            var existingGrowthCreatedAt: String? = null

            if (existingGrowthDoc != null) {
                val fields = existingGrowthDoc.optJSONObject("fields")
                if (fields != null) {
                    existingGrowthCreatedAt = readTimestamp(fields, "createdAt")
                    val remoteUpdatedMs = parseTimestampMs(readTimestamp(fields, "updatedAt"))
                    val updatedSource = readString(fields, "lastUpdatedSource")
                    if (updatedSource == "pc_web" && remoteUpdatedMs > lastSyncMs) {
                        applyRemoteGrowthFields(growthRepo, fields)
                        pulledGrowth = true
                    }
                }
            }

            // 5. Push current growth state (preserving PC-logged focus sessions & urge victories if present)
            commitGrowthDocument(
                growthRepo = growthRepo,
                uid = uid,
                existingGrowthFields = existingGrowthDoc?.optJSONObject("fields"),
                existingCreatedAt = existingGrowthCreatedAt,
                idToken = idToken
            )

            val syncedNow = System.currentTimeMillis()
            prefs.setCloudSyncDirty(false)
            prefs.setLastCloudSyncMs(syncedNow)
            SyncOutcome.Success(
                pulledRemoteDeviceSettings = pulledDevice,
                pulledRemoteGrowth = pulledGrowth,
                syncedAtMs = syncedNow
            )
        } catch (e: java.io.IOException) {
            prefs.setCloudSyncDirty(true)
            SyncOutcome.OfflineQueued("Network unreachable: ${e.message ?: "offline"}")
        } catch (e: Exception) {
            SyncOutcome.Failed(e.message ?: "Cloud sync error")
        }
    }

    private fun exchangeRefreshTokenForIdToken(refreshToken: String): String? {
        val url = URL("https://securetoken.googleapis.com/v1/token?key=$FIREBASE_API_KEY")
        val body = "grant_type=refresh_token&refresh_token=${URLEncoder.encode(refreshToken, "UTF-8")}"
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8000
            readTimeout = 8000
            doOutput = true
            setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
        }
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val responseText = readStream(conn, code)
        if (code !in 200..299) {
            throw IllegalStateException("Token exchange failed ($code): $responseText")
        }
        val json = JSONObject(responseText)
        return json.optString("id_token").takeIf { it.isNotBlank() }
    }

    private fun ensureUserDocument(uid: String, email: String, deviceId: String, idToken: String) {
        val docPath = "users/$uid"
        val existing = getFirestoreDocument(docPath, idToken)
        val existingCreatedAt = existing?.optJSONObject("fields")?.let { readTimestamp(it, "createdAt") }
        val fields = JSONObject().apply {
            put("uid", strVal(uid))
            put("email", strVal(email.ifBlank { "$uid@kiosk.user" }.take(254)))
            put("displayName", strVal("Kiosk Owner"))
            put("lastActiveDeviceId", strVal(deviceId))
            if (existingCreatedAt != null) {
                put("createdAt", JSONObject().put("timestampValue", existingCreatedAt))
            }
        }
        val transforms = mutableListOf(transformRequestTime("updatedAt"))
        if (existingCreatedAt == null) {
            transforms.add(transformRequestTime("createdAt"))
        }
        commitDocument(docPath, fields, transforms, idToken)
    }

    private fun commitDeviceDocument(
        appContext: Context,
        prefs: KioskPreferences,
        uid: String,
        deviceId: String,
        existingCreatedAt: String?,
        idToken: String
    ) {
        val limitsMap = prefs.getAppTimeLimitMinutesMap()
        val usageMap = prefs.getAppDailyUsageSecondsMap()
        val nowMs = System.currentTimeMillis()
        val fields = JSONObject().apply {
            put("ownerId", strVal(uid))
            put("deviceId", strVal(deviceId))
            put("deviceLabel", strVal(prefs.getCloudDeviceLabel()))
            put("platform", strVal("android"))
            put("isOnline", boolVal(true))
            put("isDeviceOwner", boolVal(DevicePolicyHelper.isDeviceOwner(appContext)))
            put("kioskMode", strVal(prefs.getKioskMode()))
            put("singleAppPackage", strVal(prefs.getSingleAppPackage().orEmpty()))
            put("kioskTitle", strVal(prefs.getKioskTitle("Kiosk Home")))
            put("activeScreen", strVal("home"))
            put("lockTaskActive", boolVal(DevicePolicyHelper.isDeviceOwner(appContext)))
            put("adminPinSalt", strVal(prefs.getAdminPinSalt()))
            put("adminPinHash", strVal(prefs.getAdminPinHashHex()))
            put("allowedPackages", strListVal(prefs.getAllowedPackages().toList().take(120)))
            put("allowedDomains", strListVal(prefs.getAllowedDomains().toList().take(120)))
            put(
                "hardwareLocks",
                mapVal(
                    JSONObject().apply {
                        put("statusBarDisabled", boolVal(prefs.isStatusBarDisabled()))
                        put("keyguardDisabled", boolVal(prefs.isKeyguardDisabled()))
                        put("cameraDisabled", boolVal(prefs.isCameraDisabled()))
                        put("usbTransferBlocked", boolVal(prefs.isUsbTransferBlocked()))
                        put("dateTimeLocked", boolVal(prefs.isDateTimeLocked()))
                        put("screenCaptureDisabled", boolVal(prefs.isScreenCaptureDisabled()))
                        put("keepScreenAwake", boolVal(prefs.isKeepScreenAwake()))
                    }
                )
            )
            put(
                "blockerShields",
                mapVal(
                    JSONObject().apply {
                        put("disablePornOnBrowsers", boolVal(prefs.isDisablePornOnBrowsers()))
                        put("blockInAppBrowsers", boolVal(prefs.isBlockInAppBrowsers()))
                        put(
                            "inAppBrowserWhitelist",
                            strListVal(prefs.getInAppBrowserWhitelist().toList().take(60))
                        )
                        put("blockUnsupportedBrowsers", boolVal(prefs.isBlockUnsupportedBrowsers()))
                        put("blockShortFormFeeds", boolVal(prefs.isBlockShortFormFeeds()))
                        put("familyDnsMode", strVal(prefs.getFamilyDnsMode()))
                        put("blockedKeywords", strListVal(prefs.getBlockedKeywords().toList().take(100)))
                        put("strictShieldLockUntilMs", intVal(prefs.getStrictShieldLockUntilMs()))
                    }
                )
            )
            put("appTimeLimits", intMapVal(limitsMap))
            put("appUsageSeconds", intMapVal(usageMap))
            put(
                "downtimeSchedule",
                mapVal(
                    JSONObject().apply {
                        put("enabled", boolVal(prefs.isDowntimeEnabled()))
                        put("startHour", intVal((prefs.getDowntimeStartMinutes() / 60).toLong()))
                        put("endHour", intVal((prefs.getDowntimeEndMinutes() / 60).toLong()))
                        put("simulateActiveNow", boolVal(prefs.isDowntimeActiveNow()))
                    }
                )
            )
            put("focusBlockUntilMs", intVal(if (prefs.getFocusBlockUntilMs() > nowMs) prefs.getFocusBlockUntilMs() else 0L))
            put("panicLockUntilMs", intVal(if (prefs.getPanicLockUntilMs() > nowMs) prefs.getPanicLockUntilMs() else 0L))
            put("panicCount", intVal(prefs.getPanicTriggerCount().toLong()))
            put("blockedAttemptsToday", intVal(prefs.getBlockedAttemptsToday().toLong()))
            put("tamperWarningsCount", intVal(prefs.getTamperWarningLogs().size.toLong()))
            put("tamperEscalationTier", intVal(prefs.getLastEscalationTier().coerceIn(0, 2).toLong()))
            put("pinLockedUntilMs", intVal(prefs.getPinLockoutUntilMs()))
            put("lastModifiedBy", strVal("mobile_app"))
            if (existingCreatedAt != null) {
                put("createdAt", JSONObject().put("timestampValue", existingCreatedAt))
            }
        }
        val transforms = mutableListOf(transformRequestTime("updatedAt"))
        if (existingCreatedAt == null) {
            transforms.add(transformRequestTime("createdAt"))
        }
        commitDocument("users/$uid/devices/$deviceId", fields, transforms, idToken)
    }

    private fun commitGrowthDocument(
        growthRepo: SelfImprovementRepository,
        uid: String,
        existingGrowthFields: JSONObject?,
        existingCreatedAt: String?,
        idToken: String
    ) {
        val streak = growthRepo.getCleanStreakDays()
        val habits = growthRepo.getHabits()
        val tasks = growthRepo.getTasks()
        val goals = growthRepo.getGoals()
        val notes = growthRepo.getNotes()
        val affirmations = growthRepo.getAffirmations()
        val today = LocalDate.now().toString()
        val existingLongest = existingGrowthFields?.let { readLong(it, "longestCleanStreakDays")?.toInt() } ?: 0
        val existingUrges = existingGrowthFields?.let { readLong(it, "urgeVictories") } ?: 0L
        val existingWhy = existingGrowthFields?.let { readString(it, "whyIStarted") } ?: ""
        val existingDates = existingGrowthFields?.let { readStringList(it, "cleanCheckInDates") } ?: emptyList()
        val mergedDates = if (streak > 0 && today !in existingDates) {
            (existingDates + today).takeLast(400)
        } else {
            existingDates.takeLast(400)
        }
        val existingFocusSessions = existingGrowthFields?.optJSONObject("focusSessions")
            ?: strListVal(emptyList())

        val habitValues = JSONArray().apply {
            habits.take(80).forEach { h ->
                put(
                    mapVal(
                        JSONObject().apply {
                            put("id", strVal(h.id))
                            put("title", strVal(h.title))
                            put("category", strVal(h.category))
                            put("completedDates", strListVal(h.completedDates.toList().take(200)))
                        }
                    )
                )
            }
        }
        val taskValues = JSONArray().apply {
            tasks.take(150).forEach { t ->
                put(
                    mapVal(
                        JSONObject().apply {
                            put("id", strVal(t.id))
                            put("title", strVal(t.title))
                            put("priority", strVal(t.priority))
                            put("category", strVal("Recovery"))
                            put("dueTime", strVal(""))
                            put("completed", boolVal(t.completed))
                        }
                    )
                )
            }
        }
        val goalValues = JSONArray().apply {
            goals.take(50).forEach { g ->
                val milestoneArr = JSONArray().apply {
                    g.milestones.forEach { m ->
                        put(
                            mapVal(
                                JSONObject().apply {
                                    put("id", strVal(m.id))
                                    put("title", strVal(m.title))
                                    put("done", boolVal(m.done))
                                }
                            )
                        )
                    }
                }
                put(
                    mapVal(
                        JSONObject().apply {
                            put("id", strVal(g.id))
                            put("title", strVal(g.title))
                            put("category", strVal(g.category))
                            put("targetDate", strVal(g.targetDate))
                            put("whyItMatters", strVal(g.whyItMatters))
                            put("milestones", JSONObject().put("arrayValue", JSONObject().put("values", milestoneArr)))
                        }
                    )
                )
            }
        }
        val noteValues = JSONArray().apply {
            notes.take(100).forEach { n ->
                put(
                    mapVal(
                        JSONObject().apply {
                            put("id", strVal(n.id))
                            put("title", strVal(n.title))
                            put("notebook", strVal(n.notebook))
                            put("fontFamily", strVal(n.fontFamily))
                            put("fontSize", strVal(if (n.fontSizeSp >= 20) "lg" else "base"))
                            put("htmlContent", strVal(n.htmlContent))
                            put("pinned", boolVal(false))
                            put("updatedAt", strVal(Instant.ofEpochMilli(n.updatedAtMillis).toString()))
                        }
                    )
                )
            }
        }
        val affirmationValues = JSONArray().apply {
            affirmations.take(80).forEachIndexed { idx, txt ->
                put(
                    mapVal(
                        JSONObject().apply {
                            put("id", strVal("mob-aff-$idx"))
                            put("text", strVal(txt))
                            put("focusArea", strVal("Recovery"))
                            put("isCustom", boolVal(true))
                        }
                    )
                )
            }
        }

        val fields = JSONObject().apply {
            put("ownerId", strVal(uid))
            put("profileId", strVal("main"))
            put("cleanStreakDays", intVal(streak.toLong()))
            put("longestCleanStreakDays", intVal(maxOf(streak, existingLongest).toLong()))
            put("lastCleanCheckInDate", strVal(if (streak > 0) today else ""))
            put("cleanCheckInDates", strListVal(mergedDates))
            put("urgeVictories", intVal(existingUrges))
            put("whyIStarted", strVal(existingWhy))
            put("affirmations", JSONObject().put("arrayValue", JSONObject().put("values", affirmationValues)))
            put("activeAffirmationIndex", intVal(0L))
            put("lastAffirmationCommittedDate", strVal(""))
            put("focusSessions", existingFocusSessions)
            put("habits", JSONObject().put("arrayValue", JSONObject().put("values", habitValues)))
            put("tasks", JSONObject().put("arrayValue", JSONObject().put("values", taskValues)))
            put("goals", JSONObject().put("arrayValue", JSONObject().put("values", goalValues)))
            put("notes", JSONObject().put("arrayValue", JSONObject().put("values", noteValues)))
            put("lastUpdatedSource", strVal("mobile_app"))
            if (existingCreatedAt != null) {
                put("createdAt", JSONObject().put("timestampValue", existingCreatedAt))
            }
        }
        val transforms = mutableListOf(transformRequestTime("updatedAt"))
        if (existingCreatedAt == null) {
            transforms.add(transformRequestTime("createdAt"))
        }
        commitDocument("users/$uid/growth/main", fields, transforms, idToken)
    }

    private fun applyRemoteDeviceFields(appContext: Context, prefs: KioskPreferences, fields: JSONObject) {
        readString(fields, "kioskMode")?.let { prefs.setKioskMode(it) }
        readString(fields, "singleAppPackage")?.let { prefs.setSingleAppPackage(it.ifEmpty { null }) }
        readString(fields, "kioskTitle")?.takeIf { it.isNotEmpty() }?.let { prefs.setKioskTitle(it) }
        prefs.setAllowedPackages(readStringList(fields, "allowedPackages").toSet())
        prefs.setAllowedDomains(readStringList(fields, "allowedDomains").toSet())

        val remoteSalt = readString(fields, "adminPinSalt").orEmpty()
        val remoteHash = readString(fields, "adminPinHash").orEmpty()
        if (remoteSalt.length >= 16 && remoteHash.length == 64) {
            prefs.applyRemotePinCredentials(remoteSalt, remoteHash)
        }

        fields.optJSONObject("hardwareLocks")?.optJSONObject("mapValue")?.optJSONObject("fields")?.let { hw ->
            readBool(hw, "statusBarDisabled")?.let { prefs.setStatusBarDisabled(it) }
            readBool(hw, "keyguardDisabled")?.let { prefs.setKeyguardDisabled(it) }
            readBool(hw, "cameraDisabled")?.let { prefs.setCameraDisabled(it) }
            readBool(hw, "usbTransferBlocked")?.let { prefs.setUsbTransferBlocked(it) }
            readBool(hw, "dateTimeLocked")?.let { prefs.setDateTimeLocked(it) }
            readBool(hw, "screenCaptureDisabled")?.let { prefs.setScreenCaptureDisabled(it) }
            readBool(hw, "keepScreenAwake")?.let { prefs.setKeepScreenAwake(it) }
        }

        fields.optJSONObject("blockerShields")?.optJSONObject("mapValue")?.optJSONObject("fields")?.let { bs ->
            readBool(bs, "disablePornOnBrowsers")?.let { prefs.setDisablePornOnBrowsers(it) }
            readBool(bs, "blockInAppBrowsers")?.let { prefs.setBlockInAppBrowsers(it) }
            prefs.setInAppBrowserWhitelist(readStringList(bs, "inAppBrowserWhitelist").toSet())
            readBool(bs, "blockUnsupportedBrowsers")?.let { prefs.setBlockUnsupportedBrowsers(it) }
            readBool(bs, "blockShortFormFeeds")?.let { prefs.setBlockShortFormFeeds(it) }
            readString(bs, "familyDnsMode")?.let { prefs.setFamilyDnsMode(it) }
            prefs.setBlockedKeywords(readStringList(bs, "blockedKeywords").toSet())
            readLong(bs, "strictShieldLockUntilMs")?.let { prefs.setStrictShieldLockUntilMs(it) }
        }

        fields.optJSONObject("appTimeLimits")?.optJSONObject("mapValue")?.optJSONObject("fields")?.let { limitsObj ->
            val keys = limitsObj.keys()
            val remoteLimits = mutableMapOf<String, Int>()
            while (keys.hasNext()) {
                val pkg = keys.next()
                readLong(limitsObj, pkg)?.toInt()?.let { mins ->
                    if (mins > 0) remoteLimits[pkg] = mins
                }
            }
            val currentKeys = prefs.getAppTimeLimitMinutesMap().keys
            (currentKeys - remoteLimits.keys).forEach { removedPkg ->
                prefs.setAppDailyLimitMinutes(removedPkg, 0)
            }
            remoteLimits.forEach { (pkg, mins) ->
                prefs.setAppDailyLimitMinutes(pkg, mins)
            }
        }

        fields.optJSONObject("downtimeSchedule")?.optJSONObject("mapValue")?.optJSONObject("fields")?.let { ds ->
            readBool(ds, "enabled")?.let { prefs.setDowntimeEnabled(it) }
            readLong(ds, "startHour")?.let { prefs.setDowntimeStartMinutes(it.toInt().coerceIn(0, 23) * 60) }
            readLong(ds, "endHour")?.let { prefs.setDowntimeEndMinutes(it.toInt().coerceIn(0, 23) * 60) }
        }

        readLong(fields, "focusBlockUntilMs")?.let { until ->
            if (until <= 0L) prefs.startFocusBlockMinutes(0)
        }
        readLong(fields, "panicLockUntilMs")?.let { until ->
            if (until <= 0L) prefs.clearPanicLockdown()
        }
        readLong(fields, "pinLockedUntilMs")?.let { until ->
            if (until <= 0L) prefs.clearPinLockout()
        }

        // Re-sync lock task whitelist if updated from PC
        DevicePolicyHelper.syncLockTaskPackages(appContext)
    }

    private fun applyRemoteGrowthFields(repo: SelfImprovementRepository, fields: JSONObject) {
        readLong(fields, "cleanStreakDays")?.toInt()?.let { repo.setCleanStreakDays(it) }

        val habitsArr = fields.optJSONObject("habits")?.optJSONObject("arrayValue")?.optJSONArray("values")
        if (habitsArr != null) {
            val remoteHabits = mutableListOf<KioskHabit>()
            for (i in 0 until habitsArr.length()) {
                val hFields = habitsArr.optJSONObject(i)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: continue
                val id = readString(hFields, "id") ?: continue
                val title = readString(hFields, "title") ?: continue
                val category = readString(hFields, "category") ?: "Recovery"
                val dates = readStringList(hFields, "completedDates").toSet()
                remoteHabits.add(KioskHabit(id, title, category, dates))
            }
            if (remoteHabits.isNotEmpty()) repo.saveHabits(remoteHabits)
        }

        val tasksArr = fields.optJSONObject("tasks")?.optJSONObject("arrayValue")?.optJSONArray("values")
        if (tasksArr != null) {
            val remoteTasks = mutableListOf<KioskTask>()
            for (i in 0 until tasksArr.length()) {
                val tFields = tasksArr.optJSONObject(i)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: continue
                val id = readString(tFields, "id") ?: continue
                val title = readString(tFields, "title") ?: continue
                val priority = readString(tFields, "priority") ?: "Medium"
                val completed = readBool(tFields, "completed") ?: false
                remoteTasks.add(KioskTask(id, title, priority, completed))
            }
            if (remoteTasks.isNotEmpty()) repo.saveTasks(remoteTasks)
        }

        val goalsArr = fields.optJSONObject("goals")?.optJSONObject("arrayValue")?.optJSONArray("values")
        if (goalsArr != null) {
            val remoteGoals = mutableListOf<KioskGoal>()
            for (i in 0 until goalsArr.length()) {
                val gFields = goalsArr.optJSONObject(i)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: continue
                val id = readString(gFields, "id") ?: continue
                val title = readString(gFields, "title") ?: continue
                val category = readString(gFields, "category") ?: "Recovery"
                val targetDate = readString(gFields, "targetDate") ?: ""
                val why = readString(gFields, "whyItMatters") ?: ""
                val mArr = gFields.optJSONObject("milestones")?.optJSONObject("arrayValue")?.optJSONArray("values")
                val milestones = buildList {
                    if (mArr != null) {
                        for (j in 0 until mArr.length()) {
                            val mFields = mArr.optJSONObject(j)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: continue
                            val mid = readString(mFields, "id") ?: continue
                            val mtitle = readString(mFields, "title") ?: continue
                            val mdone = readBool(mFields, "done") ?: false
                            add(KioskGoalMilestone(mid, mtitle, mdone))
                        }
                    }
                }
                remoteGoals.add(KioskGoal(id, title, category, targetDate, why, milestones))
            }
            if (remoteGoals.isNotEmpty()) repo.saveGoals(remoteGoals)
        }

        val notesArr = fields.optJSONObject("notes")?.optJSONObject("arrayValue")?.optJSONArray("values")
        if (notesArr != null) {
            val remoteNotes = mutableListOf<KioskNote>()
            for (i in 0 until notesArr.length()) {
                val nFields = notesArr.optJSONObject(i)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: continue
                val id = readString(nFields, "id") ?: continue
                val title = readString(nFields, "title") ?: "Untitled"
                val notebook = readString(nFields, "notebook") ?: "Diary"
                val fontFamily = readString(nFields, "fontFamily") ?: "sans"
                val fontSizeSp = if (readString(nFields, "fontSize") == "lg") 20 else 16
                val htmlContent = readString(nFields, "htmlContent") ?: ""
                remoteNotes.add(KioskNote(id, title, notebook, fontFamily, fontSizeSp, htmlContent, System.currentTimeMillis()))
            }
            if (remoteNotes.isNotEmpty()) repo.saveNotes(remoteNotes)
        }
    }

    private fun getFirestoreDocument(relativeDocPath: String, idToken: String): JSONObject? {
        val url = URL(
            "https://firestore.googleapis.com/v1/projects/$FIREBASE_PROJECT_ID/databases/$FIRESTORE_DATABASE_ID/documents/$relativeDocPath"
        )
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("Authorization", "Bearer $idToken")
        }
        val code = conn.responseCode
        if (code == 404) return null
        val text = readStream(conn, code)
        if (code !in 200..299) {
            throw IllegalStateException("Firestore GET failed ($code): $text")
        }
        return JSONObject(text)
    }

    private fun commitDocument(
        relativeDocPath: String,
        fields: JSONObject,
        transforms: List<JSONObject>,
        idToken: String
    ) {
        val fullName = "projects/$FIREBASE_PROJECT_ID/databases/$FIRESTORE_DATABASE_ID/documents/$relativeDocPath"
        val writeObj = JSONObject().apply {
            put(
                "update",
                JSONObject().apply {
                    put("name", fullName)
                    put("fields", fields)
                }
            )
            if (transforms.isNotEmpty()) {
                put("updateTransforms", JSONArray(transforms))
            }
        }
        val payload = JSONObject().put("writes", JSONArray().put(writeObj))
        val url = URL(
            "https://firestore.googleapis.com/v1/projects/$FIREBASE_PROJECT_ID/databases/$FIRESTORE_DATABASE_ID/documents:commit"
        )
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10000
            readTimeout = 10000
            doOutput = true
            setRequestProperty("Authorization", "Bearer $idToken")
            setRequestProperty("Content-Type", "application/json")
        }
        conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val text = readStream(conn, code)
        if (code !in 200..299) {
            throw IllegalStateException("Firestore commit failed ($code): $text")
        }
    }

    private fun readStream(conn: HttpURLConnection, code: Int): String {
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        if (stream == null) return ""
        return BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
    }

    private fun strVal(v: String) = JSONObject().put("stringValue", v)
    private fun boolVal(v: Boolean) = JSONObject().put("booleanValue", v)
    private fun intVal(v: Long) = JSONObject().put("integerValue", v.toString())
    private fun mapVal(fields: JSONObject) = JSONObject().put("mapValue", JSONObject().put("fields", fields))
    private fun strListVal(list: List<String>): JSONObject {
        val arr = JSONArray()
        list.forEach { arr.put(strVal(it)) }
        return JSONObject().put("arrayValue", JSONObject().put("values", arr))
    }

    private fun intMapVal(map: Map<String, Int>): JSONObject {
        val fields = JSONObject()
        map.forEach { (k, v) -> if (k.isNotBlank() && v > 0) fields.put(k, intVal(v.toLong())) }
        return mapVal(fields)
    }

    private fun transformRequestTime(fieldPath: String): JSONObject {
        return JSONObject()
            .put("fieldPath", fieldPath)
            .put("setToServerValue", "REQUEST_TIME")
    }

    private fun readString(fields: JSONObject, key: String): String? {
        return fields.optJSONObject(key)?.optString("stringValue")
    }

    private fun readBool(fields: JSONObject, key: String): Boolean? {
        val obj = fields.optJSONObject(key) ?: return null
        return if (obj.has("booleanValue")) obj.optBoolean("booleanValue") else null
    }

    private fun readLong(fields: JSONObject, key: String): Long? {
        val obj = fields.optJSONObject(key) ?: return null
        return when {
            obj.has("integerValue") -> obj.optString("integerValue").toLongOrNull()
            obj.has("doubleValue") -> obj.optDouble("doubleValue").toLong()
            else -> null
        }
    }

    private fun readTimestamp(fields: JSONObject, key: String): String? {
        return fields.optJSONObject(key)?.optString("timestampValue")?.takeIf { it.isNotBlank() }
    }

    private fun readStringList(fields: JSONObject, key: String): List<String> {
        val arr = fields.optJSONObject(key)?.optJSONObject("arrayValue")?.optJSONArray("values")
            ?: return emptyList()
        return buildList {
            for (i in 0 until arr.length()) {
                val s = arr.optJSONObject(i)?.optString("stringValue")
                if (!s.isNullOrBlank()) add(s)
            }
        }
    }

    private fun parseTimestampMs(iso: String?): Long {
        if (iso.isNullOrBlank()) return 0L
        return try {
            Instant.parse(iso).toEpochMilli()
        } catch (_: Exception) {
            0L
        }
    }
}
