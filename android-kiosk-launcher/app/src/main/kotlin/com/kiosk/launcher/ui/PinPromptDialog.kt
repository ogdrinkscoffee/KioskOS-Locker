package com.kiosk.launcher.ui

import android.content.Context
import android.view.LayoutInflater
import android.view.inputmethod.EditorInfo
import androidx.appcompat.app.AlertDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.databinding.DialogPinEntryBinding

object PinPromptDialog {

    fun show(
        context: Context,
        title: String,
        subtitle: String,
        onVerified: () -> Unit
    ): AlertDialog {
        val prefs = KioskPreferences(context)
        val binding = DialogPinEntryBinding.inflate(LayoutInflater.from(context))
        binding.pinSubtitle.text = subtitle

        val dialog = MaterialAlertDialogBuilder(context)
            .setTitle(title)
            .setView(binding.root)
            .setCancelable(true)
            .setPositiveButton(R.string.action_unlock, null)
            .setNegativeButton(android.R.string.cancel, null)
            .create()

        val attemptVerification = {
            val remaining = prefs.getPinLockoutRemainingSeconds()
            if (remaining > 0) {
                binding.pinInputLayout.error =
                    context.getString(R.string.error_pin_lockout, remaining)
            } else {
                val enteredPin = binding.pinInput.text?.toString().orEmpty()
                if (prefs.verifyPin(enteredPin)) {
                    dialog.dismiss()
                    onVerified()
                } else {
                    val newLockout = prefs.getPinLockoutRemainingSeconds()
                    binding.pinInputLayout.error = if (newLockout > 0) {
                        context.getString(R.string.error_pin_lockout, newLockout)
                    } else {
                        context.getString(R.string.error_invalid_pin)
                    }
                    binding.pinInput.text?.clear()
                }
            }
        }

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                attemptVerification()
            }
            binding.pinInput.setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    attemptVerification()
                    true
                } else {
                    false
                }
            }
        }

        dialog.show()
        return dialog
    }
}
