package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SportzxScraper {
    suspend fun getBackupServers(matchId: String): List<StreamServer> = withContext(Dispatchers.IO) {
        listOf(
            StreamServer("Sportzx High-Speed Backup 1", "https://sportzx.live/hls//stream.m3u8", "1080p"),
            StreamServer("Sportzx Fast CDN Backup 2", "https://sportzx.live/cdn//index.m3u8", "720p")
        )
    }
}
