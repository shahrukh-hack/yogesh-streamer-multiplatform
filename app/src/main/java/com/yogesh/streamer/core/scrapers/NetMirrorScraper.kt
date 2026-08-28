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
            // Server 1: MultiEmbed (Primary Multi-Audio & Server Array)
            servers.add(
                StreamServer(
                    serverName = "NetMirror MultiEmbed 4K (Multi-Audio)",
                    streamUrl = "https://multiembed.mov/?video_id=$tmdbId&tmdb=1",
                    quality = "1080p / 4K UHD",
                    isHls = false,
                    headers = mapOf("Referer" to "https://netmirror.app/")
                )
            )

            // Server 2: VidSrc High-Speed CDN
            servers.add(
                StreamServer(
                    serverName = "NetMirror VidSrc Fast (Server 2)",
                    streamUrl = "https://vidsrc.me/embed/movie?tmdb=$tmdbId",
                    quality = "1080p HD",
                    isHls = false,
                    headers = mapOf("Referer" to "https://netmirror.app/")
                )
            )

            // Server 3: AutoEmbed Direct
            servers.add(
                StreamServer(
                    serverName = "NetMirror AutoEmbed (Server 3)",
                    streamUrl = "https://autoembed.to/movie/tmdb/$tmdbId",
                    quality = "1080p HD",
                    isHls = false,
                    headers = mapOf("Referer" to "https://netmirror.app/")
                )
            )

            // Server 4: VidLink 4K
            servers.add(
                StreamServer(
                    serverName = "NetMirror VidLink (Server 4)",
                    streamUrl = "https://vidlink.pro/movie/$tmdbId",
                    quality = "1080p / 4K UHD",
                    isHls = false,
                    headers = mapOf("Referer" to "https://netmirror.app/")
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
        servers
    }
}
