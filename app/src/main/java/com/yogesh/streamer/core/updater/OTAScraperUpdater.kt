package com.yogesh.streamer.core.updater

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object OTAScraperUpdater {
    private const val TAG = "OTAScraperUpdater"
    private const val SCRAPERS_MANIFEST_URL = "https://raw.githubusercontent.com/shahrukh-hack/yogesh-streamer-multiplatform/master/scrapers/sources.json"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()

    fun syncScrapersAsync(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val request = Request.Builder().url(SCRAPERS_MANIFEST_URL).build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val body = response.body?.string()
                    if (!body.isNullOrBlank()) {
                        val prefs = context.getSharedPreferences("yogesh_ota_scrapers", Context.MODE_PRIVATE)
                        prefs.edit().putString("ota_sources_json", body).apply()
                        Log.i(TAG, "Successfully synced Over-The-Air scraper definitions from cloud")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "OTA scraper sync check finished (using built-in scrapers): ")
            }
        }
    }
}
