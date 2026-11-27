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

/**
 * Asks for the app access password before a protected package opens.
 *
 * Deliberately separate from [PinGate]: it verifies its own hash with its own attempt
 * counter, so guessing at an app password can never lock the admin out of Admin settings.
 */
object AppAccessPinGate {

    fun prompt(activity: Activity, appLabel: String, onSuccess: () -> Unit) {
        val prefs = KioskPreferences(activity)

        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_pin_entry, null)
        val input = view.findViewById<EditText>(R.id.pinInput)
        val toggle = view.findViewById<Button>(R.id.pinShowToggle)
        val error = view.findViewById<TextView>(R.id.pinError)
        val helper = view.findViewById<TextView>(R.id.pinHelper)

        view.findViewById<TextView>(R.id.pinFieldLabel).setText(R.string.app_pin_label)
        input.setHint(R.string.app_pin_hint)
        helper.setText(R.string.app_pin_helper)

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

        val initialLockSecs = prefs.appPinLockoutRemainingSeconds()
        if (initialLockSecs > 0) {
            error.text = activity.getString(R.string.pin_error_locked_fmt, initialLockSecs)
            error.visibility = View.VISIBLE
        }

        val dialog = MaterialAlertDialogBuilder(activity)
            .setTitle(activity.getString(R.string.app_pin_title_fmt, appLabel))
            .setView(view)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.unlock, null)
            .create()

        dialog.setOnShowListener {
            val confirm = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            confirm.setOnClickListener {
                val lockSecs = prefs.appPinLockoutRemainingSeconds()
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
                    shake(input)
                    return@setOnClickListener
                }

                if (prefs.checkAppPin(pin)) {
                    prefs.resetAppPinFailures()
                    dialog.dismiss()
                    onSuccess()
                } else {
                    val lockedFor = prefs.recordFailedAppPinAttempt()
                    error.text = if (lockedFor > 0) {
                        activity.getString(R.string.pin_error_locked_fmt, lockedFor)
                    } else {
                        activity.getString(R.string.pin_error_incorrect)
                    }
                    error.visibility = View.VISIBLE
                    input.text?.clear()
                    input.requestFocus()
                    shake(input)
                }
            }
        }

        input.requestFocus()
        dialog.show()
    }

    /** Short horizontal shake so a wrong password is felt as well as read. */
    private fun shake(view: View) {
        ObjectAnimator.ofFloat(
            view,
            View.TRANSLATION_X,
            0f, 14f, -14f, 10f, -10f, 4f, 0f
        ).apply {
            duration = 320
            start()
        }
    }
}
