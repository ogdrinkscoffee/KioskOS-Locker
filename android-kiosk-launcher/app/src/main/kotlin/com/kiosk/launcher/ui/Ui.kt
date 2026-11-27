package com.kiosk.launcher.ui

import android.content.Context
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

internal fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

internal fun Context.colorOf(resId: Int): Int = ContextCompat.getColor(this, resId)

/**
 * Enables Android 15 (API 35) edge-to-edge display while keeping the top bar clear of
 * the status bar/display cutout and the bottom scrollable/content view clear of the
 * navigation bar and IME.
 */
internal fun AppCompatActivity.applyEdgeToEdge(topView: View, bottomView: View) {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val topBaseLeft = topView.paddingLeft
    val topBaseTop = topView.paddingTop
    val topBaseRight = topView.paddingRight
    val topBaseBottom = topView.paddingBottom

    val bottomBaseLeft = bottomView.paddingLeft
    val bottomBaseTop = bottomView.paddingTop
    val bottomBaseRight = bottomView.paddingRight
    val bottomBaseBottom = bottomView.paddingBottom

    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
        val topBars = insets.getInsets(
            WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.displayCutout()
        )
        val bottomBars = insets.getInsets(
            WindowInsetsCompat.Type.navigationBars() or
                WindowInsetsCompat.Type.ime() or
                WindowInsetsCompat.Type.displayCutout()
        )
        topView.setPadding(
            topBaseLeft + topBars.left,
            topBaseTop + topBars.top,
            topBaseRight + topBars.right,
            topBaseBottom
        )
        if (bottomView === topView) {
            bottomView.setPadding(
                topBaseLeft + maxOf(topBars.left, bottomBars.left),
                topBaseTop + topBars.top,
                topBaseRight + maxOf(topBars.right, bottomBars.right),
                bottomBaseBottom + bottomBars.bottom
            )
        } else {
            bottomView.setPadding(
                bottomBaseLeft + bottomBars.left,
                bottomBaseTop,
                bottomBaseRight + bottomBars.right,
                bottomBaseBottom + bottomBars.bottom
            )
        }
        insets
    }
}
