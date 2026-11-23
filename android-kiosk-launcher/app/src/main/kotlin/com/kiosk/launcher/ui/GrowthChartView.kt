package com.kiosk.launcher.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.util.TypedValue
import android.view.View
import androidx.core.content.ContextCompat
import com.kiosk.launcher.R
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Lightweight native chart for the Focus & Growth workspace.
 *
 * Renders either a filled area line (clean streak) or vertical bars (habit
 * completion rate) so the APK keeps the same 30-day analytics the website
 * shows without pulling in a charting library.
 */
class GrowthChartView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    var values: List<Float> = emptyList()
        set(value) {
            field = value
            invalidate()
        }

    var labels: List<String> = emptyList()
        set(value) {
            field = value
            invalidate()
        }

    var barMode: Boolean = false
        set(value) {
            field = value
            invalidate()
        }

    /** Fixed top of the axis; 0 means "derive from the data". */
    var fixedMax: Float = 0f
        set(value) {
            field = value
            invalidate()
        }

    private val lineColor = ContextCompat.getColor(context, R.color.accent)
    private val gridColor = ContextCompat.getColor(context, R.color.divider)
    private val labelColor = ContextCompat.getColor(context, R.color.text_secondary)

    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = gridColor
        strokeWidth = resources.displayMetrics.density
    }
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = lineColor
        strokeWidth = 2.2f * resources.displayMetrics.density
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }
    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = lineColor
        style = Paint.Style.FILL
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = labelColor
        textSize = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_SP,
            10f,
            resources.displayMetrics
        )
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val padLeft = 30f * resources.displayMetrics.density
        val padBottom = 20f * resources.displayMetrics.density
        val padTop = 8f * resources.displayMetrics.density
        val chartWidth = width - padLeft - 6f * resources.displayMetrics.density
        val chartHeight = height - padTop - padBottom
        if (chartWidth <= 0f || chartHeight <= 0f) return

        val data = values
        val top = if (fixedMax > 0f) fixedMax else max(1f, (data.maxOrNull() ?: 0f))
        if (data.isEmpty() || data.all { it <= 0f } && top <= 1f) {
            drawEmpty(canvas, padLeft, padTop, chartWidth, chartHeight)
            return
        }

        // Grid lines + Y labels (0, half, max).
        val steps = 2
        for (i in 0..steps) {
            val fraction = i.toFloat() / steps
            val y = padTop + chartHeight * (1f - fraction)
            canvas.drawLine(padLeft, y, padLeft + chartWidth, y, gridPaint)
            val yLabel = (top * fraction).roundToInt().toString()
            canvas.drawText(yLabel, 0f, y + labelPaint.textSize / 3f, labelPaint)
        }

        if (barMode) {
            drawBars(canvas, data, top, padLeft, padTop, chartWidth, chartHeight)
        } else {
            drawArea(canvas, data, top, padLeft, padTop, chartWidth, chartHeight)
        }
        drawXLabels(canvas, padLeft, padTop + chartHeight, chartWidth)
    }

    private fun drawArea(
        canvas: Canvas,
        data: List<Float>,
        top: Float,
        padLeft: Float,
        padTop: Float,
        chartWidth: Float,
        chartHeight: Float
    ) {
        val stepX = if (data.size <= 1) chartWidth else chartWidth / (data.size - 1)
        val path = Path()
        val fill = Path()
        data.forEachIndexed { index, value ->
            val x = padLeft + stepX * index
            val y = padTop + chartHeight * (1f - (value / top).coerceIn(0f, 1f))
            if (index == 0) {
                path.moveTo(x, y)
                fill.moveTo(x, padTop + chartHeight)
                fill.lineTo(x, y)
            } else {
                path.lineTo(x, y)
                fill.lineTo(x, y)
            }
        }
        fill.lineTo(padLeft + stepX * (data.size - 1), padTop + chartHeight)
        fill.close()

        fillPaint.shader = LinearGradient(
            0f,
            padTop,
            0f,
            padTop + chartHeight,
            intArrayOf(withAlpha(0.32f), withAlpha(0.03f)),
            null,
            Shader.TileMode.CLAMP
        )
        canvas.drawPath(fill, fillPaint)
        fillPaint.shader = null
        canvas.drawPath(path, linePaint)
    }

    private fun drawBars(
        canvas: Canvas,
        data: List<Float>,
        top: Float,
        padLeft: Float,
        padTop: Float,
        chartWidth: Float,
        chartHeight: Float
    ) {
        val slot = chartWidth / data.size
        val barWidth = max(2f, slot * 0.55f)
        val radius = barWidth / 2f
        data.forEachIndexed { index, value ->
            val x = padLeft + slot * index + (slot - barWidth) / 2f
            val startY = padTop + chartHeight
            val barHeight = chartHeight * (value / top).coerceIn(0f, 1f)
            if (barHeight <= 0f) return@forEachIndexed
            canvas.drawRoundRect(
                RectF(x, startY - barHeight, x + barWidth, startY),
                radius,
                radius,
                barPaint
            )
        }
    }

    private fun drawXLabels(canvas: Canvas, padLeft: Float, baseline: Float, chartWidth: Float) {
        if (labels.isEmpty()) return
        val stepX = if (labels.size <= 1) chartWidth else chartWidth / (labels.size - 1)
        val indices = setOf(0, labels.size / 2, labels.size - 1)
        indices.forEach { index ->
            val label = labels.getOrNull(index) ?: return@forEach
            val textWidth = labelPaint.measureText(label)
            val x = (padLeft + stepX * index - textWidth / 2f)
                .coerceIn(padLeft, padLeft + chartWidth - textWidth)
            canvas.drawText(label, x, baseline + labelPaint.textSize + 2f, labelPaint)
        }
    }

    private fun drawEmpty(canvas: Canvas, padLeft: Float, padTop: Float, chartWidth: Float, chartHeight: Float) {
        canvas.drawLine(padLeft, padTop + chartHeight, padLeft + chartWidth, padTop + chartHeight, gridPaint)
        canvas.drawText(
            context.getString(R.string.chart_no_data),
            padLeft + 4f * resources.displayMetrics.density,
            padTop + chartHeight / 2f,
            labelPaint
        )
    }

    private fun withAlpha(alpha: Float): Int =
        (alpha.coerceIn(0f, 1f) * 255).roundToInt().shl(24) or (lineColor and 0x00FFFFFF)
}
