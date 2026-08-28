package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

object MovieBoxScraper {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .build()

    suspend fun resolveStreams(tmdbId: Int, title: String): List<StreamServer> = withContext(Dispatchers.IO) {
        val servers = mutableListOf<StreamServer>()
        try {
            // MovieBox Multi-CDN Global 4K and 1080p Streams
            servers.add(
                StreamServer(
                    serverName = "MovieBox Global Multi-Audio (1080p)",
                    streamUrl = "https://vidsrc.cc/v2/embed/movie/$tmdbId",
                    quality = "1080p Multi-Audio",
                    isHls = true,
                    headers = mapOf("Referer" to "https://vidsrc.cc/")
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
        servers
    }
}
