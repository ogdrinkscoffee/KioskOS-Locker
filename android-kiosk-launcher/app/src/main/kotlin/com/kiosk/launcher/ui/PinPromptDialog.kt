package com.kiosk.launcher.ui

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
        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_pin_entry, null)
        val input = view.findViewById<EditText>(R.id.pinInput)
        val toggle = view.findViewById<Button>(R.id.pinShowToggle)
        val error = view.findViewById<TextView>(R.id.pinError)
        val prefs = KioskPreferences(activity)

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

        val initialLockSecs = prefs.pinLockoutRemainingSeconds()
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
                val lockSecs = prefs.pinLockoutRemainingSeconds()
                if (lockSecs > 0) {
                    error.text = activity.getString(R.string.pin_error_locked_fmt, lockSecs)
                    error.visibility = View.VISIBLE
                    return@setOnClickListener
                }

                val pin = input.text?.toString().orEmpty()
                if (pin.length < KioskPreferences.MIN_PIN_LENGTH ||
                    pin.length > KioskPreferences.MAX_PIN_LENGTH ||
                    pin.isBlank()
                ) {
                    error.setText(R.string.pin_error_length)
                    error.visibility = View.VISIBLE
                    return@setOnClickListener
                }

                if (prefs.checkPin(pin)) {
                    prefs.resetPinFailures()
                    dialog.dismiss()
                    onSuccess()
                } else {
                    val lockedFor = prefs.recordFailedPinAttempt()
                    error.text = if (lockedFor > 0) {
                        activity.getString(R.string.pin_error_locked_fmt, lockedFor)
                    } else {
                        activity.getString(R.string.pin_error_incorrect)
                    }
                    error.visibility = View.VISIBLE
                    input.text?.clear()
                    input.requestFocus()
                }
            }
        }

        input.requestFocus()
        dialog.show()
    }
}
