package com.kiosk.launcher.data

/**
 * Pure configuration, theme presets, widget sizing, and 2-column grid layout planner
 * for the custom kiosk lock screen.
 *
 * Kept free of Android framework types so serialization, migration, size consistency,
 * and grid packing are directly unit-testable.
 */
object LockScreenConfig {

    enum class LockTheme(
        val id: String,
        val startArgb: Int,
        val centerArgb: Int,
        val endArgb: Int,
        val glowTopArgb: Int,
        val glowBottomArgb: Int
    ) {
        MIDNIGHT(
            id = "midnight",
            startArgb = 0xFF060A14.toInt(),
            centerArgb = 0xFF0E1729.toInt(),
            endArgb = 0xFF091E29.toInt(),
            glowTopArgb = 0x382DD4BF,
            glowBottomArgb = 0x2938BDF8
        ),
        AURORA(
            id = "aurora",
            startArgb = 0xFF04100D.toInt(),
            centerArgb = 0xFF0A211C.toInt(),
            endArgb = 0xFF071520.toInt(),
            glowTopArgb = 0x3D34D399,
            glowBottomArgb = 0x262DD4BF
        ),
        OBSIDIAN(
            id = "obsidian",
            startArgb = 0xFF0F060A.toInt(),
            centerArgb = 0xFF1D0E16.toInt(),
            endArgb = 0xFF110B18.toInt(),
            glowTopArgb = 0x38FB7185,
            glowBottomArgb = 0x24F43F5E
        ),
        AMETHYST(
            id = "amethyst",
            startArgb = 0xFF090716.toInt(),
            centerArgb = 0xFF161230.toInt(),
            endArgb = 0xFF0B1526.toInt(),
            glowTopArgb = 0x3D818CF8,
            glowBottomArgb = 0x28A78BFA
        ),
        SOLAR(
            id = "solar",
            startArgb = 0xFF120D07.toInt(),
            centerArgb = 0xFF21180D.toInt(),
            endArgb = 0xFF100D12.toInt(),
            glowTopArgb = 0x38FBBF24,
            glowBottomArgb = 0x24F97316
        ),
        AMOLED(
            id = "amoled",
            startArgb = 0xFF000000.toInt(),
            centerArgb = 0xFF030508.toInt(),
            endArgb = 0xFF000000.toInt(),
            glowTopArgb = 0x1E2DD4BF,
            glowBottomArgb = 0x141E293B
        );

        companion object {
            fun fromId(id: String?): LockTheme =
                entries.firstOrNull { it.id == id } ?: MIDNIGHT
        }
    }

    enum class LockAccent(
        val id: String,
        val colorArgb: Int,
        val softArgb: Int
    ) {
        TEAL("teal", 0xFF2DD4BF.toInt(), 0x2E2DD4BF),
        SKY("sky", 0xFF38BDF8.toInt(), 0x2E38BDF8),
        INDIGO("indigo", 0xFF818CF8.toInt(), 0x2E818CF8),
        EMERALD("emerald", 0xFF34D399.toInt(), 0x2E34D399),
        AMBER("amber", 0xFFFBBF24.toInt(), 0x2EFBBF24),
        ROSE("rose", 0xFFFB7185.toInt(), 0x2EFB7185),
        SNOW("snow", 0xFFF8FAFC.toInt(), 0x2AF8FAFC);

        companion object {
            fun fromId(id: String?): LockAccent =
                entries.firstOrNull { it.id == id } ?: TEAL
        }
    }

    enum class LockClockStyle(val id: String) {
        EDITORIAL("editorial"),
        BOLD("bold"),
        STACKED("stacked"),
        COMPACT("compact");

        companion object {
            fun fromId(id: String?): LockClockStyle =
                entries.firstOrNull { it.id == id } ?: EDITORIAL
        }
    }

    enum class LockCardStyle(val id: String) {
        FROSTED("frosted"),
        TINTED("tinted"),
        SOLID("solid"),
        OUTLINE("outline");

        companion object {
            fun fromId(id: String?): LockCardStyle =
                entries.firstOrNull { it.id == id } ?: FROSTED
        }
    }

    enum class LockCornerStyle(val id: String, val radiusDp: Int) {
        SHARP("sharp", 12),
        ROUNDED("rounded", 20),
        PILL("pill", 28);

        companion object {
            fun fromId(id: String?): LockCornerStyle =
                entries.firstOrNull { it.id == id } ?: ROUNDED
        }
    }

    enum class LockWidgetSize(
        val id: String,
        val spanColumns: Int,
        val minHeightDp: Int
    ) {
        SMALL("small", spanColumns = 1, minHeightDp = 108),
        MEDIUM("medium", spanColumns = 2, minHeightDp = 112),
        LARGE("large", spanColumns = 2, minHeightDp = 156);

        companion object {
            fun fromId(id: String?): LockWidgetSize =
                entries.firstOrNull { it.id == id } ?: SMALL
        }
    }

    enum class LockWidgetType(val id: String, val defaultSize: LockWidgetSize) {
        BATTERY("battery", LockWidgetSize.SMALL),
        STREAK("streak", LockWidgetSize.SMALL),
        HABITS("habits", LockWidgetSize.SMALL),
        FOCUS("focus", LockWidgetSize.SMALL),
        NOTE("note", LockWidgetSize.MEDIUM),
        TASKS("tasks", LockWidgetSize.MEDIUM),
        GOALS("goals", LockWidgetSize.MEDIUM),
        SCHEDULE("schedule", LockWidgetSize.SMALL),
        SHIELD("shield", LockWidgetSize.SMALL);

        companion object {
            fun fromId(id: String?): LockWidgetType? =
                entries.firstOrNull { it.id == id }
        }
    }

    data class LockWidgetSlot(
        val type: LockWidgetType,
        val enabled: Boolean,
        val size: LockWidgetSize
    )

    fun defaultSlots(
        batteryEnabled: Boolean = true,
        statsEnabled: Boolean = true,
        noteEnabled: Boolean = true
    ): List<LockWidgetSlot> = listOf(
        LockWidgetSlot(LockWidgetType.BATTERY, enabled = batteryEnabled, size = LockWidgetSize.SMALL),
        LockWidgetSlot(LockWidgetType.STREAK, enabled = statsEnabled, size = LockWidgetSize.SMALL),
        LockWidgetSlot(LockWidgetType.HABITS, enabled = true, size = LockWidgetSize.SMALL),
        LockWidgetSlot(LockWidgetType.FOCUS, enabled = true, size = LockWidgetSize.SMALL),
        LockWidgetSlot(LockWidgetType.NOTE, enabled = noteEnabled, size = LockWidgetSize.MEDIUM),
        LockWidgetSlot(LockWidgetType.TASKS, enabled = false, size = LockWidgetSize.MEDIUM),
        LockWidgetSlot(LockWidgetType.GOALS, enabled = false, size = LockWidgetSize.MEDIUM),
        LockWidgetSlot(LockWidgetType.SCHEDULE, enabled = false, size = LockWidgetSize.SMALL),
        LockWidgetSlot(LockWidgetType.SHIELD, enabled = false, size = LockWidgetSize.SMALL)
    )

    fun encodeSlots(slots: List<LockWidgetSlot>): String =
        slots.distinctBy { it.type }.joinToString("\n") { slot ->
            "${slot.type.id}:${if (slot.enabled) "1" else "0"}:${slot.size.id}"
        }

    fun decodeSlots(
        raw: String?,
        fallback: List<LockWidgetSlot> = defaultSlots()
    ): List<LockWidgetSlot> {
        if (raw.isNullOrBlank()) return fallback
        val parsed = mutableListOf<LockWidgetSlot>()
        val seen = mutableSetOf<LockWidgetType>()
        raw.lines().forEach { line ->
            val parts = line.trim().split(':')
            if (parts.isEmpty() || parts[0].isBlank()) return@forEach
            val type = LockWidgetType.fromId(parts[0]) ?: return@forEach
            if (!seen.add(type)) return@forEach
            val enabled = parts.getOrNull(1) != "0"
            val size = LockWidgetSize.fromId(parts.getOrNull(2))
            parsed += LockWidgetSlot(type = type, enabled = enabled, size = size)
        }
        if (parsed.isEmpty()) return fallback
        // Append any newly added widget types so upgrades never drop new widgets.
        fallback.forEach { defaultSlot ->
            if (seen.add(defaultSlot.type)) {
                parsed += defaultSlot.copy(enabled = false)
            }
        }
        return parsed
    }

    /**
     * Packs enabled widgets into uniform 2-column rows.
     * - [LockWidgetSize.SMALL] widgets span 1 column (50% width) and pair two per row.
     * - [LockWidgetSize.MEDIUM] and [LockWidgetSize.LARGE] widgets span 2 columns (full width).
     */
    fun buildWidgetRows(slots: List<LockWidgetSlot>): List<List<LockWidgetSlot>> {
        val rows = mutableListOf<List<LockWidgetSlot>>()
        var pendingSmall: LockWidgetSlot? = null
        slots.filter { it.enabled }.forEach { slot ->
            if (slot.size.spanColumns == 1) {
                val first = pendingSmall
                if (first == null) {
                    pendingSmall = slot
                } else {
                    rows += listOf(first, slot)
                    pendingSmall = null
                }
            } else {
                pendingSmall?.let { orphan ->
                    rows += listOf(orphan)
                    pendingSmall = null
                }
                rows += listOf(slot)
            }
        }
        pendingSmall?.let { orphan -> rows += listOf(orphan) }
        return rows
    }

    fun applyGlobalSize(slots: List<LockWidgetSlot>, size: LockWidgetSize): List<LockWidgetSlot> =
        slots.map { it.copy(size = size) }

    fun setSlotSize(
        slots: List<LockWidgetSlot>,
        type: LockWidgetType,
        size: LockWidgetSize
    ): List<LockWidgetSlot> =
        slots.map { if (it.type == type) it.copy(size = size) else it }

    fun setSlotEnabled(
        slots: List<LockWidgetSlot>,
        type: LockWidgetType,
        enabled: Boolean
    ): List<LockWidgetSlot> =
        slots.map { if (it.type == type) it.copy(enabled = enabled) else it }

    fun moveSlot(
        slots: List<LockWidgetSlot>,
        type: LockWidgetType,
        delta: Int
    ): List<LockWidgetSlot> {
        val idx = slots.indexOfFirst { it.type == type }
        if (idx < 0) return slots
        val target = (idx + delta).coerceIn(0, slots.lastIndex)
        if (target == idx) return slots
        val mutable = slots.toMutableList()
        val item = mutable.removeAt(idx)
        mutable.add(target, item)
        return mutable
    }

    /**
     * Returns the shared [LockWidgetSize] if every enabled widget uses the exact same size,
     * or null when enabled widgets have mixed sizes or none are enabled.
     */
    fun uniformSizeOrNull(slots: List<LockWidgetSlot>): LockWidgetSize? {
        val enabled = slots.filter { it.enabled }
        if (enabled.isEmpty()) return null
        val first = enabled.first().size
        return if (enabled.all { it.size == first }) first else null
    }
}
