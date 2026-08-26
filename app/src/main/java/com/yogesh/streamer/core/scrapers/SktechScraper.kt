package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object SktechScraper {
    suspend fun getLiveSports(): List<LiveCricketMatch> = withContext(Dispatchers.IO) {
        listOf(
            LiveCricketMatch(
                id = "sktech_sky_cricket",
                matchTitle = "Sky Sports Cricket HD (English)",
                team1 = "Sky Sports",
                team2 = "Live Feed",
                tournament = "World Cricket Tour",
                status = "LIVE",
                matchTime = "Live Now",
                servers = listOf(
                    StreamServer("Sky Sports Cricket (1080p)", "https://sktech.stream/live/skycricket.m3u8", "1080p")
                )
            ),
            LiveCricketMatch(
                id = "sktech_supersport_cricket",
                matchTitle = "SuperSport Grandstand & Cricket",
                team1 = "SuperSport",
                team2 = "HD Series",
                tournament = "International Series",
                status = "LIVE",
                matchTime = "Live Now",
                servers = listOf(
                    StreamServer("SuperSport Cricket (1080p)", "https://sktech.stream/live/supersport.m3u8", "1080p")
                )
            )
        )
    }
}
