package com.yogesh.streamer

import android.app.Application
import com.yogesh.streamer.core.audio.StartupAudioManager
import com.yogesh.streamer.core.scrapers.ScraperManager
import com.yogesh.streamer.core.updater.OTAScraperUpdater

class YogeshApp : Application() {

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Initialize Audio Engine
        StartupAudioManager.init(this)

        // Initialize Scraper Manager & Sync OTA Scrapers in background
        ScraperManager.init(this)
        OTAScraperUpdater.syncScrapersAsync(this)
    }

    companion object {
        lateinit var instance: YogeshApp
            private set
    }
}
