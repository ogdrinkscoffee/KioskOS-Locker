package com.kiosk.launcher.ui

import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.AdapterView

/** TextWatcher with a single string callback. */
internal abstract class SimpleTextWatcher : TextWatcher {
    abstract fun onTextChanged(text: String)

    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit

    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
        onTextChanged(s?.toString().orEmpty())
    }

    override fun afterTextChanged(s: Editable?) = Unit
}

/** Spinner listener that only reports the selected position. */
internal abstract class SimpleItemSelectedListener : AdapterView.OnItemSelectedListener {
    abstract fun onSelected(position: Int)

    override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
        onSelected(position)
    }

    override fun onNothingSelected(parent: AdapterView<*>?) = Unit
}
