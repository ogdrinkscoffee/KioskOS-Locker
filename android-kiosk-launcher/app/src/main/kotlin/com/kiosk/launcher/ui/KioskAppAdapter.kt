package com.kiosk.launcher.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.kiosk.launcher.R
import com.kiosk.launcher.data.AppEntry

class KioskAppAdapter(
    private val isProtected: (String) -> Boolean = { false },
    private val onClick: (AppEntry) -> Unit
) : RecyclerView.Adapter<KioskAppAdapter.AppViewHolder>() {

    private val items = mutableListOf<AppEntry>()

    fun submit(list: List<AppEntry>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AppViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_kiosk_app, parent, false)
        return AppViewHolder(view)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: AppViewHolder, position: Int) {
        val entry = items[position]
        holder.label.text = entry.label
        holder.icon.setImageDrawable(entry.icon)
        holder.lockBadge.visibility = if (isProtected(entry.packageName)) View.VISIBLE else View.GONE
        holder.itemView.setOnClickListener { onClick(entry) }
    }

    class AppViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.appIcon)
        val lockBadge: ImageView = view.findViewById(R.id.appLockBadge)
        val label: TextView = view.findViewById(R.id.appLabel)
    }
}
