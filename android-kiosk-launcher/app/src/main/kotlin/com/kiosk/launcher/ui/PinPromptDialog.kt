package com.kiosk.launcher.ui

import android.app.Activity
import android.app.AlertDialog
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.TextView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.kiosk.launcher.R
import com.kiosk.launcher.data.KioskPreferences

object PinGate {

    fun prompt(activity: Activity, title: String = "Admin access", onSuccess: () -> Unit) {
        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_pin_entry, null)
        val input = view.findViewById<EditText>(R.id.pinInput)
        val error = view.findViewById<TextView>(R.id.pinError)
        val prefs = KioskPreferences(activity)

        val dialog = MaterialAlertDialogBuilder(activity)
            .setTitle(title)
            .setView(view)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Unlock", null)
            .create()

        dialog.setOnShowListener {
            val confirm = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            confirm.setOnClickListener {
                val pin = input.text?.toString()?.trim().orEmpty()
                if (pin.length == 4 && prefs.checkPin(pin)) {
                    dialog.dismiss()
                    onSuccess()
                } else {
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
