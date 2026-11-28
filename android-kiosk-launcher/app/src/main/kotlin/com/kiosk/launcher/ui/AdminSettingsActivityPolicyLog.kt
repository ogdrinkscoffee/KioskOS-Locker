package com.kiosk.launcher.ui

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.kiosk.launcher.R

/** Supplies the policy activity log view missing from the admin settings layout. */
val AdminSettingsActivity.policyLog: TextView
    get() {
        val securityCard = findViewById<ViewGroup>(R.id.cardSecurity)
        val cardContent = securityCard.getChildAt(0) as ViewGroup
        return cardContent.findViewWithTag<TextView>(POLICY_LOG_TAG)
            ?: TextView(this).apply {
                tag = POLICY_LOG_TAG
                setTextColor(ContextCompat.getColor(this@policyLog, R.color.text_secondary))
                textSize = 11f
                setPadding(0, resources.getDimensionPixelSize(R.dimen.si_card_padding) / 2, 0, 0)
                cardContent.addView(
                    this,
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                )
            }
    }

private const val POLICY_LOG_TAG = "admin_policy_log"
