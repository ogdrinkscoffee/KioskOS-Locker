package com.kiosk.launcher.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.kiosk.launcher.R
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.KioskFolder
import java.util.Collections

sealed class HomeItem {
    abstract val id: String
    abstract val label: String

    data class App(val entry: AppEntry) : HomeItem() {
        override val id: String get() = "app:${entry.packageName}"
        override val label: String get() = entry.label
    }

    data class Folder(val folder: KioskFolder, val entries: List<AppEntry>) : HomeItem() {
        override val id: String get() = "folder:${folder.id}"
        override val label: String get() = folder.name
    }
}

class KioskAppAdapter(
    private val isProtected: (String) -> Boolean = { false },
    private val onAppClick: (AppEntry) -> Unit,
    private val onFolderClick: (HomeItem.Folder) -> Unit = {}
) : RecyclerView.Adapter<KioskAppAdapter.AppViewHolder>() {

    private val items = mutableListOf<HomeItem>()

    fun submitItems(list: List<HomeItem>) {
        items.clear()
        items.addAll(list)
        notifyDataSetChanged()
    }

    fun submit(list: List<AppEntry>) {
        submitItems(list.map { HomeItem.App(it) })
    }

    fun moveItem(fromPos: Int, toPos: Int) {
        if (fromPos < 0 || toPos < 0 || fromPos >= items.size || toPos >= items.size) return
        Collections.swap(items, fromPos, toPos)
        notifyItemMoved(fromPos, toPos)
    }

    fun getCurrentItemIds(): List<String> = items.map { it.id }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): AppViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_kiosk_app, parent, false)
        return AppViewHolder(view)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: AppViewHolder, position: Int) {
        when (val item = items[position]) {
            is HomeItem.App -> {
                holder.label.text = item.entry.label
                holder.icon.setImageDrawable(item.entry.icon)
                holder.lockBadge.visibility =
                    if (isProtected(item.entry.packageName)) View.VISIBLE else View.GONE
                holder.itemView.setOnClickListener { onAppClick(item.entry) }
            }
            is HomeItem.Folder -> {
                holder.label.text = item.folder.name
                holder.icon.setImageDrawable(
                    ContextCompat.getDrawable(holder.itemView.context, R.drawable.ic_folder)
                )
                holder.lockBadge.visibility = View.GONE
                holder.itemView.setOnClickListener { onFolderClick(item) }
            }
        }
    }

    class AppViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.appIcon)
        val lockBadge: ImageView = view.findViewById(R.id.appLockBadge)
        val label: TextView = view.findViewById(R.id.appLabel)
    }
}
