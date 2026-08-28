package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

object HDHub4uScraper {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .build()

    suspend fun resolveStreams(tmdbId: Int, title: String): List<StreamServer> = withContext(Dispatchers.IO) {
        val servers = mutableListOf<StreamServer>()
        try {
            // HDHub4u Fast Direct Dual Audio & Hindi Streams
            servers.add(
                StreamServer(
                    serverName = "HDHub4u Ultra HD (Hindi Dual-Audio)",
                    streamUrl = "https://autoembed.to/movie/tmdb/$tmdbId",
                    quality = "1080p Ultra HD",
                    isHls = true,
                    headers = mapOf("Referer" to "https://autoembed.to/")
                )
            )
            servers.add(
                StreamServer(
                    serverName = "HDHub4u StreamWish Fast Server",
                    streamUrl = "https://vidcloud.icu/embed/movie/$tmdbId",
                    quality = "1080p Fast",
                    isHls = true,
                    headers = mapOf("Referer" to "https://vidcloud.icu/")
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
        servers
    }
}
