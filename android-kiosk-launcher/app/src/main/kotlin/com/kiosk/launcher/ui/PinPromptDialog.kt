package com.kiosk.launcher.ui

import android.animation.ObjectAnimator
import android.app.Activity
import android.app.AlertDialog
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences

object PinGate {

    fun prompt(
        activity: Activity,
        title: String = activity.getString(R.string.pin_title_admin),
        onSuccess: () -> Unit
    ) {
        val prefs = KioskPreferences(activity)
        showDialog(
            activity = activity,
            title = title,
            helperText = activity.getString(R.string.pin_helper_default),
            lockoutSeconds = { prefs.pinLockoutRemainingSeconds() },
            verifyPin = { prefs.checkPin(it) },
            onSuccessVerified = { prefs.resetPinFailures() },
            onFailedAttempt = { prefs.recordFailedPinAttempt() },
            onSuccess = onSuccess
        )
    }

    fun promptAppPassword(
        activity: Activity,
        appLabel: String,
        onSuccess: () -> Unit
    ) {
        val prefs = KioskPreferences(activity)
        val helperRes = if (prefs.hasAppAccessPin()) {
            R.string.app_pin_helper_custom
        } else {
            R.string.app_pin_helper_default
        }
        showDialog(
            activity = activity,
            title = activity.getString(R.string.app_pin_title_fmt, appLabel),
            helperText = activity.getString(helperRes),
            lockoutSeconds = { prefs.appPinLockoutRemainingSeconds() },
            verifyPin = { prefs.checkAppAccessPin(it) },
            onSuccessVerified = { prefs.resetAppPinFailures() },
            onFailedAttempt = { prefs.recordFailedAppPinAttempt() },
            onSuccess = onSuccess
        )
    }

    private fun showDialog(
        activity: Activity,
        title: String,
        helperText: String,
        lockoutSeconds: () -> Int,
        verifyPin: (String) -> Boolean,
        onSuccessVerified: () -> Unit,
        onFailedAttempt: () -> Int,
        onSuccess: () -> Unit
    ) {
        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_pin_entry, null)
        val inputRow = view.findViewById<View>(R.id.pinInputRow)
        val input = view.findViewById<EditText>(R.id.pinInput)
        val toggle = view.findViewById<Button>(R.id.pinShowToggle)
        val error = view.findViewById<TextView>(R.id.pinError)
        val helper = view.findViewById<TextView>(R.id.pinHelper)
        helper.text = helperText

        var revealed = false
        toggle.setOnClickListener {
            revealed = !revealed
            input.inputType = if (revealed) {
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            } else {
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
            input.setSelection(input.text?.length ?: 0)
            toggle.setText(if (revealed) R.string.hide else R.string.show)
        }

        val initialLockSecs = lockoutSeconds()
        if (initialLockSecs > 0) {
            error.text = activity.getString(R.string.pin_error_locked_fmt, initialLockSecs)
            error.visibility = View.VISIBLE
        }

        val dialog = MaterialAlertDialogBuilder(activity)
            .setTitle(title)
            .setView(view)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.unlock, null)
            .create()

        dialog.setOnShowListener {
            val confirm = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            confirm.setOnClickListener {
                val lockSecs = lockoutSeconds()
                if (lockSecs > 0) {
                    error.text = activity.getString(R.string.pin_error_locked_fmt, lockSecs)
                    error.visibility = View.VISIBLE
                    shake(inputRow)
                    return@setOnClickListener
                }

                val pin = input.text?.toString().orEmpty()
                if (pin.length < KioskPreferences.MIN_PIN_LENGTH ||
                    pin.length > KioskPreferences.MAX_PIN_LENGTH ||
                    pin.isBlank()
                ) {
                    error.setText(R.string.pin_error_length)
                    error.visibility = View.VISIBLE
                    shake(inputRow)
                    return@setOnClickListener
                }

                if (verifyPin(pin)) {
                    onSuccessVerified()
                    dialog.dismiss()
                    onSuccess()
                } else {
                    val lockedFor = onFailedAttempt()
                    error.text = if (lockedFor > 0) {
                        activity.getString(R.string.pin_error_locked_fmt, lockedFor)
                    } else {
                        activity.getString(R.string.pin_error_incorrect)
                    }
                    error.visibility = View.VISIBLE
                    shake(inputRow)
                    input.text?.clear()
                    input.requestFocus()
                }
            }
        }

        input.requestFocus()
        dialog.show()
    }

    private fun shake(target: View) {
        ObjectAnimator.ofFloat(
            target,
            "translationX",
            0f, 18f, -18f, 14f, -14f, 8f, -8f, 0f
        ).apply {
            duration = 320L
            start()
        }
    }
}
