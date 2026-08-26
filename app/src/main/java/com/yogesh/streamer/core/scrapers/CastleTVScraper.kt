package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

object CastleTVScraper {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .build()

    suspend fun resolveMovieStreams(tmdbId: Int, title: String): List<StreamServer> = withContext(Dispatchers.IO) {
        val servers = mutableListOf<StreamServer>()
        try {
            // CastleTV Multi-CDN fast embed resolvers
            servers.add(
                StreamServer(
                    serverName = "CastleTV High-Speed CDN 1 (1080p)",
                    streamUrl = "https://vidsrc.to/embed/movie/",
                    quality = "1080p",
                    isHls = true
                )
            )
            servers.add(
                StreamServer(
                    serverName = "CastleTV Hindi Dual-Audio Server 2",
                    streamUrl = "https://autoembed.to/movie/tmdb/",
                    quality = "1080p",
                    isHls = true
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
        servers
    }
}
