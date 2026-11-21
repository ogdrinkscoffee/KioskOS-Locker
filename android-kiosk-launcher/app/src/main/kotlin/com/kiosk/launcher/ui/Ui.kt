package com.kiosk.launcher.ui

import android.content.Context
import androidx.core.content.ContextCompat
import kotlin.math.roundToInt

internal fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

internal fun Context.colorOf(resId: Int): Int = ContextCompat.getColor(this, resId)
