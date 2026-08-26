package com.yogesh.streamer.core.tv

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration

object TvNavigationHelper {

    fun isTelevision(context: Context): Boolean {
        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        if (uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) {
            return true
        }
        val packageManager = context.packageManager
        return packageManager.hasSystemFeature("android.hardware.type.television") ||
               packageManager.hasSystemFeature("android.software.leanback")
    }
}
