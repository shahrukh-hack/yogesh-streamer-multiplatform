package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object AutoEmbedScraper {
    suspend fun resolveStream(tmdbId: Int): List<StreamServer> = withContext(Dispatchers.IO) {
        listOf(
            StreamServer(
                serverName = "AutoEmbed Direct 1080p",
                streamUrl = "https://player.autoembed.cc/embed/movie/",
                quality = "1080p",
                isHls = true
            ),
            StreamServer(
                serverName = "2Embed Ultra Fast Fallback",
                streamUrl = "https://www.2embed.cc/embed/",
                quality = "720p/1080p",
                isHls = true
            )
        )
    }
}
