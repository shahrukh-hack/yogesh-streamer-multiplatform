package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

object NetMirrorScraper {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .build()

    suspend fun resolveStreams(tmdbId: Int, title: String): List<StreamServer> = withContext(Dispatchers.IO) {
        val servers = mutableListOf<StreamServer>()
        try {
            // NetMirror VidLink High-Speed Direct Stream Server (Multi-Audio)
            servers.add(
                StreamServer(
                    serverName = "NetMirror Fast 4K (Multi-Audio)",
                    streamUrl = "https://vidlink.pro/movie/$tmdbId",
                    quality = "1080p / 4K UHD",
                    isHls = true,
                    headers = mapOf(
                        "Referer" to "https://netmirror.app/",
                        "Origin" to "https://netmirror.app"
                    )
                )
            )

            // NetMirror MultiEmbed Backup Server
            servers.add(
                StreamServer(
                    serverName = "NetMirror MultiEmbed HD Server",
                    streamUrl = "https://multiembed.mov/?video_id=$tmdbId&tmdb=1",
                    quality = "1080p HD",
                    isHls = true,
                    headers = mapOf(
                        "Referer" to "https://netmirror.app/"
                    )
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
        servers
    }
}
