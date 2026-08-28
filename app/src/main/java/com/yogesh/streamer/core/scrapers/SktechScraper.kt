package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SKTechScraper {
    suspend fun getLiveSportsServers(): List<StreamServer> = withContext(Dispatchers.IO) {
        listOf(
            StreamServer(
                serverName = "SKTV Astro Cricket HD (60fps Ultra)",
                streamUrl = "https://cricify.live/stream/astro/index.m3u8",
                quality = "1080p 60fps",
                isHls = true,
                headers = mapOf("Referer" to "https://cricify.live/")
            ),
            StreamServer(
                serverName = "SKTV Star Sports Hindi (1080p)",
                streamUrl = "https://cricify.live/stream/star1hindi/index.m3u8",
                quality = "1080p",
                isHls = true,
                headers = mapOf("Referer" to "https://cricify.live/")
            )
        )
    }
}
