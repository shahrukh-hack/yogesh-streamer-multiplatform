package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object VidSrcScraper {
    suspend fun resolveStream(tmdbId: Int): List<StreamServer> = withContext(Dispatchers.IO) {
        listOf(
            StreamServer(
                serverName = "VidSrc Pro 4K Server",
                streamUrl = "https://vidsrc.me/embed/movie?tmdb=",
                quality = "4K / 1080p",
                isHls = true
            ),
            StreamServer(
                serverName = "VidSrc VIP CDN",
                streamUrl = "https://vidsrc.in/embed/movie?tmdb=",
                quality = "1080p",
                isHls = true
            )
        )
    }
}
