package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SportzxScraper {
    suspend fun getLiveSportsServers(): List<StreamServer> = withContext(Dispatchers.IO) {
        listOf(
            StreamServer(
                serverName = "Sportzx Sony Ten 3 Hindi HD",
                streamUrl = "https://cricify.live/stream/sonyten3/index.m3u8",
                quality = "1080p",
                isHls = true,
                headers = mapOf("Referer" to "https://cricify.live/")
            ),
            StreamServer(
                serverName = "Sportzx Willow Cricket HD (Global)",
                streamUrl = "https://willow.live/stream/willowhd/playlist.m3u8",
                quality = "1080p",
                isHls = true,
                headers = mapOf("Referer" to "https://willow.live/")
            )
        )
    }
}
