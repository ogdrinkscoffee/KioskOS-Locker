package com.kiosk.launcher.ui

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.switchmaterial.SwitchMaterial
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.data.LockScreenConfig
import com.kiosk.launcher.data.LockScreenConfig.LockAccent
import com.kiosk.launcher.data.LockScreenConfig.LockCardStyle
import com.kiosk.launcher.data.LockScreenConfig.LockClockStyle
import com.kiosk.launcher.data.LockScreenConfig.LockCornerStyle
import com.kiosk.launcher.data.LockScreenConfig.LockTheme
import com.kiosk.launcher.data.LockScreenConfig.LockWidgetSize
import com.kiosk.launcher.data.LockScreenConfig.LockWidgetType

/**
 * Interactive dark-glass bottom sheet for customizing lock screen themes, accents,
 * clock typography, card surfaces, uniform or per-widget sizes, and widget order.
 *
 * Works both live inside [KioskLockScreenActivity] and from [AdminSettingsActivity].
 */
class LockScreenCustomizerSheet(
    private val context: Context,
    private val prefs: KioskPreferences,
    private val onChanged: () -> Unit
) {

    private var syncing = false

    fun show() {
        val dialog = BottomSheetDialog(context)
        val root = LayoutInflater.from(context).inflate(R.layout.dialog_lock_screen_customizer, null)
        dialog.setContentView(root)

        dialog.setOnShowListener {
            val sheet = dialog.findViewById<View>(com.google.android.material.R.id.design_bottom_sheet)
            if (sheet != null) {
                sheet.setBackgroundColor(Color.TRANSPARENT)
                BottomSheetBehavior.from(sheet).apply {
                    state = BottomSheetBehavior.STATE_EXPANDED
                    skipCollapsed = true
                }
            }
        }

        val themeContainer = root.findViewById<LinearLayout>(R.id.custThemeContainer)
        val accentContainer = root.findViewById<LinearLayout>(R.id.custAccentContainer)
        val clockStyleGroup = root.findViewById<MaterialButtonToggleGroup>(R.id.custClockStyleGroup)
        val clock24hSwitch = root.findViewById<SwitchMaterial>(R.id.custClock24hSwitch)
        val clockSecondsSwitch = root.findViewById<SwitchMaterial>(R.id.custClockSecondsSwitch)
        val cardStyleGroup = root.findViewById<MaterialButtonToggleGroup>(R.id.custCardStyleGroup)
        val cornerGroup = root.findViewById<MaterialButtonToggleGroup>(R.id.custCornerGroup)
        val globalSizeMode = root.findViewById<TextView>(R.id.custGlobalSizeMode)
        val globalSizeGroup = root.findViewById<MaterialButtonToggleGroup>(R.id.custGlobalSizeGroup)
        val widgetsContainer = root.findViewById<LinearLayout>(R.id.custWidgetsContainer)
        val showCustomizeSwitch = root.findViewById<SwitchMaterial>(R.id.custShowCustomizeSwitch)

        fun accentColor(): Int = LockAccent.fromId(prefs.lockAccent).colorArgb

        fun renderThemeSwatches() {
            themeContainer.removeAllViews()
            val selectedId = prefs.lockTheme
            val accent = accentColor()
            LockTheme.entries.forEach { theme ->
                val wrapper = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    setPadding(context.dp(4), context.dp(2), context.dp(4), context.dp(2))
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { marginEnd = context.dp(8) }
                    isClickable = true
                    isFocusable = true
                }
                val isSelected = theme.id == selectedId
                val swatch = View(context).apply {
                    layoutParams = LinearLayout.LayoutParams(context.dp(58), context.dp(40))
                    background = GradientDrawable(
                        GradientDrawable.Orientation.TL_BR,
                        intArrayOf(theme.startArgb, theme.centerArgb, theme.endArgb)
                    ).apply {
                        cornerRadius = context.dp(12).toFloat()
                        setStroke(
                            context.dp(if (isSelected) 2 else 1),
                            if (isSelected) accent else 0x40FFFFFF
                        )
                    }
                }
                val label = TextView(context).apply {
                    text = context.getString(themeLabelRes(theme))
                    textSize = 10f
                    setTextColor(if (isSelected) accent else 0xFFCBD5E1.toInt())
                    setPadding(0, context.dp(4), 0, 0)
                }
                wrapper.addView(swatch)
                wrapper.addView(label)
                wrapper.setOnClickListener {
                    prefs.lockTheme = theme.id
                    renderThemeSwatches()
                    onChanged()
                }
                themeContainer.addView(wrapper)
            }
        }

        fun renderAccentDots() {
            accentContainer.removeAllViews()
            val selectedId = prefs.lockAccent
            LockAccent.entries.forEach { accent ->
                val isSelected = accent.id == selectedId
                val wrapper = LinearLayout(context).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                    setPadding(context.dp(4), context.dp(2), context.dp(4), context.dp(2))
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { marginEnd = context.dp(8) }
                    isClickable = true
                    isFocusable = true
                }
                val dot = View(context).apply {
                    layoutParams = LinearLayout.LayoutParams(context.dp(34), context.dp(34))
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(accent.colorArgb)
                        setStroke(
                            context.dp(if (isSelected) 3 else 1),
                            if (isSelected) Color.WHITE else 0x4DFFFFFF
                        )
                    }
                }
                val label = TextView(context).apply {
                    text = context.getString(accentLabelRes(accent))
                    textSize = 10f
                    setTextColor(if (isSelected) Color.WHITE else 0xFF94A3B8.toInt())
                    setPadding(0, context.dp(4), 0, 0)
                }
                wrapper.addView(dot)
                wrapper.addView(label)
                wrapper.setOnClickListener {
                    prefs.lockAccent = accent.id
                    renderThemeSwatches()
                    renderAccentDots()
                    refreshAllSegmentedStyles(
                        clockStyleGroup, cardStyleGroup, cornerGroup, globalSizeGroup, accent.colorArgb
                    )
                    globalSizeMode.setTextColor(accent.colorArgb)
                    onChanged()
                }
                accentContainer.addView(wrapper)
            }
        }

        lateinit var renderWidgetsList: () -> Unit

        fun syncGlobalSizeBar() {
            val prevSyncing = syncing
            syncing = true
            val slots = prefs.lockWidgetSlots()
            val uniform = LockScreenConfig.uniformSizeOrNull(slots)
            when (uniform) {
                LockWidgetSize.SMALL -> {
                    globalSizeGroup.check(R.id.custAllSmall)
                    globalSizeMode.setText(R.string.lock_size_mode_small)
                }
                LockWidgetSize.MEDIUM -> {
                    globalSizeGroup.check(R.id.custAllMedium)
                    globalSizeMode.setText(R.string.lock_size_mode_medium)
                }
                LockWidgetSize.LARGE -> {
                    globalSizeGroup.check(R.id.custAllLarge)
                    globalSizeMode.setText(R.string.lock_size_mode_large)
                }
                null -> {
                    globalSizeGroup.clearChecked()
                    globalSizeMode.setText(R.string.lock_size_mode_mixed)
                }
            }
            globalSizeMode.setTextColor(accentColor())
            styleGroup(globalSizeGroup, accentColor())
            syncing = prevSyncing
        }

        renderWidgetsList = {
            widgetsContainer.removeAllViews()
            val slots = prefs.lockWidgetSlots()
            val accent = accentColor()
            slots.forEachIndexed { index, slot ->
                val row = LayoutInflater.from(context)
                    .inflate(R.layout.item_lock_customizer_widget, widgetsContainer, false)
                val icon = row.findViewById<ImageView>(R.id.custWidgetIcon)
                val title = row.findViewById<TextView>(R.id.custWidgetTitle)
                val desc = row.findViewById<TextView>(R.id.custWidgetDesc)
                val toggle = row.findViewById<SwitchMaterial>(R.id.custWidgetSwitch)
                val controlsRow = row.findViewById<View>(R.id.custWidgetControlsRow)
                val sizeGroup = row.findViewById<MaterialButtonToggleGroup>(R.id.custWidgetSizeGroup)
                val upBtn = row.findViewById<ImageButton>(R.id.custWidgetMoveUp)
                val downBtn = row.findViewById<ImageButton>(R.id.custWidgetMoveDown)

                icon.setImageResource(widgetIconRes(slot.type))
                icon.imageTintList = ColorStateList.valueOf(accent)
                title.setText(widgetTitleRes(slot.type))
                desc.setText(widgetDescRes(slot.type))

                toggle.isChecked = slot.enabled
                controlsRow.alpha = if (slot.enabled) 1f else 0.45f

                toggle.setOnCheckedChangeListener { _, checked ->
                    val next = LockScreenConfig.setSlotEnabled(prefs.lockWidgetSlots(), slot.type, checked)
                    prefs.setLockWidgetSlots(next)
                    controlsRow.alpha = if (checked) 1f else 0.45f
                    syncGlobalSizeBar()
                    onChanged()
                }

                sizeGroup.check(
                    when (slot.size) {
                        LockWidgetSize.SMALL -> R.id.custSizeSmall
                        LockWidgetSize.MEDIUM -> R.id.custSizeMedium
                        LockWidgetSize.LARGE -> R.id.custSizeLarge
                    }
                )
                styleGroup(sizeGroup, accent)
                sizeGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
                    if (!isChecked) return@addOnButtonCheckedListener
                    val nextSize = when (checkedId) {
                        R.id.custSizeMedium -> LockWidgetSize.MEDIUM
                        R.id.custSizeLarge -> LockWidgetSize.LARGE
                        else -> LockWidgetSize.SMALL
                    }
                    val next = LockScreenConfig.setSlotSize(prefs.lockWidgetSlots(), slot.type, nextSize)
                    prefs.setLockWidgetSlots(next)
                    styleGroup(sizeGroup, accentColor())
                    syncGlobalSizeBar()
                    onChanged()
                }

                upBtn.isEnabled = index > 0
                upBtn.alpha = if (index > 0) 1f else 0.3f
                upBtn.setOnClickListener {
                    val next = LockScreenConfig.moveSlot(prefs.lockWidgetSlots(), slot.type, -1)
                    prefs.setLockWidgetSlots(next)
                    renderWidgetsList()
                    onChanged()
                }

                downBtn.isEnabled = index < slots.lastIndex
                downBtn.alpha = if (index < slots.lastIndex) 1f else 0.3f
                downBtn.setOnClickListener {
                    val next = LockScreenConfig.moveSlot(prefs.lockWidgetSlots(), slot.type, +1)
                    prefs.setLockWidgetSlots(next)
                    renderWidgetsList()
                    onChanged()
                }

                widgetsContainer.addView(row)
            }
        }

        fun syncAllControls() {
            syncing = true
            renderThemeSwatches()
            renderAccentDots()
            clockStyleGroup.check(
                when (LockClockStyle.fromId(prefs.lockClockStyle)) {
                    LockClockStyle.BOLD -> R.id.custClockBold
                    LockClockStyle.STACKED -> R.id.custClockStacked
                    LockClockStyle.COMPACT -> R.id.custClockCompact
                    else -> R.id.custClockEditorial
                }
            )
            clock24hSwitch.isChecked = prefs.lockClock24Hour
            clockSecondsSwitch.isChecked = prefs.lockShowSeconds
            cardStyleGroup.check(
                when (LockCardStyle.fromId(prefs.lockCardStyle)) {
                    LockCardStyle.TINTED -> R.id.custCardTinted
                    LockCardStyle.SOLID -> R.id.custCardSolid
                    LockCardStyle.OUTLINE -> R.id.custCardOutline
                    else -> R.id.custCardFrosted
                }
            )
            cornerGroup.check(
                when (LockCornerStyle.fromId(prefs.lockCornerStyle)) {
                    LockCornerStyle.SHARP -> R.id.custCornerSharp
                    LockCornerStyle.PILL -> R.id.custCornerPill
                    else -> R.id.custCornerRounded
                }
            )
            showCustomizeSwitch.isChecked = prefs.lockShowCustomizeButton
            refreshAllSegmentedStyles(
                clockStyleGroup, cardStyleGroup, cornerGroup, globalSizeGroup, accentColor()
            )
            syncGlobalSizeBar()
            renderWidgetsList()
            syncing = false
        }

        syncAllControls()

        clockStyleGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (syncing || !isChecked) return@addOnButtonCheckedListener
            prefs.lockClockStyle = when (checkedId) {
                R.id.custClockBold -> LockClockStyle.BOLD.id
                R.id.custClockStacked -> LockClockStyle.STACKED.id
                R.id.custClockCompact -> LockClockStyle.COMPACT.id
                else -> LockClockStyle.EDITORIAL.id
            }
            styleGroup(clockStyleGroup, accentColor())
            onChanged()
        }

        clock24hSwitch.setOnCheckedChangeListener { _, checked ->
            if (syncing) return@setOnCheckedChangeListener
            prefs.lockClock24Hour = checked
            onChanged()
        }

        clockSecondsSwitch.setOnCheckedChangeListener { _, checked ->
            if (syncing) return@setOnCheckedChangeListener
            prefs.lockShowSeconds = checked
            onChanged()
        }

        cardStyleGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (syncing || !isChecked) return@addOnButtonCheckedListener
            prefs.lockCardStyle = when (checkedId) {
                R.id.custCardTinted -> LockCardStyle.TINTED.id
                R.id.custCardSolid -> LockCardStyle.SOLID.id
                R.id.custCardOutline -> LockCardStyle.OUTLINE.id
                else -> LockCardStyle.FROSTED.id
            }
            styleGroup(cardStyleGroup, accentColor())
            onChanged()
        }

        cornerGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (syncing || !isChecked) return@addOnButtonCheckedListener
            prefs.lockCornerStyle = when (checkedId) {
                R.id.custCornerSharp -> LockCornerStyle.SHARP.id
                R.id.custCornerPill -> LockCornerStyle.PILL.id
                else -> LockCornerStyle.ROUNDED.id
            }
            styleGroup(cornerGroup, accentColor())
            onChanged()
        }

        globalSizeGroup.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (syncing || !isChecked) return@addOnButtonCheckedListener
            val targetSize = when (checkedId) {
                R.id.custAllMedium -> LockWidgetSize.MEDIUM
                R.id.custAllLarge -> LockWidgetSize.LARGE
                else -> LockWidgetSize.SMALL
            }
            val updated = LockScreenConfig.applyGlobalSize(prefs.lockWidgetSlots(), targetSize)
            prefs.setLockWidgetSlots(updated)
            syncGlobalSizeBar()
            renderWidgetsList()
            onChanged()
        }

        showCustomizeSwitch.setOnCheckedChangeListener { _, checked ->
            if (syncing) return@setOnCheckedChangeListener
            prefs.lockShowCustomizeButton = checked
            onChanged()
        }

        root.findViewById<View>(R.id.custResetButton).setOnClickListener {
            prefs.lockTheme = LockTheme.MIDNIGHT.id
            prefs.lockAccent = LockAccent.TEAL.id
            prefs.lockClockStyle = LockClockStyle.EDITORIAL.id
            prefs.lockCardStyle = LockCardStyle.FROSTED.id
            prefs.lockCornerStyle = LockCornerStyle.ROUNDED.id
            prefs.lockClock24Hour = true
            prefs.lockShowSeconds = false
            prefs.lockShowCustomizeButton = true
            prefs.setLockWidgetSlots(LockScreenConfig.defaultSlots())
            syncAllControls()
            onChanged()
        }

        root.findViewById<View>(R.id.custDoneButton).setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }

    private fun refreshAllSegmentedStyles(
        clock: MaterialButtonToggleGroup,
        card: MaterialButtonToggleGroup,
        corner: MaterialButtonToggleGroup,
        globalSize: MaterialButtonToggleGroup,
        accentColor: Int
    ) {
        styleGroup(clock, accentColor)
        styleGroup(card, accentColor)
        styleGroup(corner, accentColor)
        styleGroup(globalSize, accentColor)
    }

    private fun styleGroup(group: MaterialButtonToggleGroup, accentColor: Int) {
        val checkedId = group.checkedButtonId
        for (i in 0 until group.childCount) {
            val btn = group.getChildAt(i) as? MaterialButton ?: continue
            val active = btn.id == checkedId
            btn.backgroundTintList = ColorStateList.valueOf(
                if (active) withAlpha(accentColor, 0x38) else 0x12FFFFFF
            )
            btn.strokeColor = ColorStateList.valueOf(
                if (active) accentColor else 0x38FFFFFF
            )
            btn.setTextColor(if (active) Color.WHITE else 0xFFCBD5E1.toInt())
        }
    }

    companion object {
        fun withAlpha(color: Int, alphaByte: Int): Int =
            (color and 0x00FFFFFF) or ((alphaByte and 0xFF) shl 24)

        fun widgetIconRes(type: LockWidgetType): Int = when (type) {
            LockWidgetType.BATTERY -> R.drawable.ic_widget_battery
            LockWidgetType.STREAK -> R.drawable.ic_widget_streak
            LockWidgetType.HABITS -> R.drawable.ic_widget_habits
            LockWidgetType.TASKS -> R.drawable.ic_widget_tasks
            LockWidgetType.FOCUS -> R.drawable.ic_widget_focus
            LockWidgetType.GOALS -> R.drawable.ic_widget_goals
            LockWidgetType.SCHEDULE -> R.drawable.ic_widget_schedule
            LockWidgetType.SHIELD -> R.drawable.ic_widget_shield
            LockWidgetType.NOTE -> R.drawable.ic_widget_note
        }

        fun widgetTitleRes(type: LockWidgetType): Int = when (type) {
            LockWidgetType.BATTERY -> R.string.lock_widget_battery_title
            LockWidgetType.STREAK -> R.string.lock_widget_streak_title
            LockWidgetType.HABITS -> R.string.lock_widget_habits_title
            LockWidgetType.TASKS -> R.string.lock_widget_tasks_title
            LockWidgetType.FOCUS -> R.string.lock_widget_focus_title
            LockWidgetType.GOALS -> R.string.lock_widget_goals_title
            LockWidgetType.SCHEDULE -> R.string.lock_widget_schedule_title
            LockWidgetType.SHIELD -> R.string.lock_widget_shield_title
            LockWidgetType.NOTE -> R.string.lock_widget_note_title
        }

        fun widgetDescRes(type: LockWidgetType): Int = when (type) {
            LockWidgetType.BATTERY -> R.string.lock_widget_battery_desc
            LockWidgetType.STREAK -> R.string.lock_widget_stats_desc
            LockWidgetType.HABITS -> R.string.lock_widget_habits_desc
            LockWidgetType.TASKS -> R.string.lock_widget_tasks_desc
            LockWidgetType.FOCUS -> R.string.lock_widget_focus_desc
            LockWidgetType.GOALS -> R.string.lock_widget_goals_desc
            LockWidgetType.SCHEDULE -> R.string.lock_widget_schedule_desc
            LockWidgetType.SHIELD -> R.string.lock_widget_shield_desc
            LockWidgetType.NOTE -> R.string.lock_widget_note_desc
        }

        fun themeLabelRes(theme: LockTheme): Int = when (theme) {
            LockTheme.MIDNIGHT -> R.string.lock_theme_midnight
            LockTheme.AURORA -> R.string.lock_theme_aurora
            LockTheme.OBSIDIAN -> R.string.lock_theme_obsidian
            LockTheme.AMETHYST -> R.string.lock_theme_amethyst
            LockTheme.SOLAR -> R.string.lock_theme_solar
            LockTheme.AMOLED -> R.string.lock_theme_amoled
        }

        fun accentLabelRes(accent: LockAccent): Int = when (accent) {
            LockAccent.TEAL -> R.string.lock_accent_teal
            LockAccent.SKY -> R.string.lock_accent_sky
            LockAccent.INDIGO -> R.string.lock_accent_indigo
            LockAccent.EMERALD -> R.string.lock_accent_emerald
            LockAccent.AMBER -> R.string.lock_accent_amber
            LockAccent.ROSE -> R.string.lock_accent_rose
            LockAccent.SNOW -> R.string.lock_accent_snow
        }
    }
}
