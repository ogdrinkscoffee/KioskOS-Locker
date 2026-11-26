package com.kiosk.launcher.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.kiosk.launcher.R
import com.kiosk.launcher.data.AppEntry

class LockQuickAppAdapter(
    private val isProtected: (String) -> Boolean,
    private val onClick: (AppEntry) -> Unit
) : RecyclerView.Adapter<LockQuickAppAdapter.QuickHolder>() {

    private val items = mutableListOf<AppEntry>()

    fun submit(list: List<AppEntry>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): QuickHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_lock_quick_app, parent, false)
        return QuickHolder(view)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: QuickHolder, position: Int) {
        val entry = items[position]
        holder.icon.setImageDrawable(entry.icon)
        holder.label.text = entry.label
        holder.lockBadge.visibility = if (isProtected(entry.packageName)) View.VISIBLE else View.GONE
        holder.itemView.setOnClickListener { onClick(entry) }
    }

    class QuickHolder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.quickAppIcon)
        val lockBadge: ImageView = view.findViewById(R.id.quickLockBadge)
        val label: TextView = view.findViewById(R.id.quickAppLabel)
    }
}
