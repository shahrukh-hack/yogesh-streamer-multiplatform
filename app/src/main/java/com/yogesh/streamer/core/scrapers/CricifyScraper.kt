package com.yogesh.streamer.core.scrapers

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object CricifyScraper {

    suspend fun getLiveMatches(): List<LiveCricketMatch> = withContext(Dispatchers.IO) {
        val matches = mutableListOf<LiveCricketMatch>()
        try {
            matches.add(
                LiveCricketMatch(
                    id = "cric_starsports_hindi",
                    matchTitle = "Star Sports 1 Hindi HD - Live Cricket",
                    team1 = "India",
                    team2 = "Live Broadcast",
                    tournament = "International Cricket",
                    status = "LIVE",
                    matchTime = "Live Now",
                    servers = listOf(
                        StreamServer("Star Sports Hindi (Server 1 - 1080p HD)", "https://cricify.live/stream/star1hindi/index.m3u8", "1080p", isHls = true),
                        StreamServer("Star Sports Hindi (Server 2 - Fast CDN)", "https://cricify.live/stream/star1hindi/index.m3u8", "720p", isHls = true)
                    )
                )
            )
            matches.add(
                LiveCricketMatch(
                    id = "cric_willow_hd",
                    matchTitle = "Willow Cricket HD - Global Cricket",
                    team1 = "World Tour",
                    team2 = "Live Series",
                    tournament = "ICC / T20 Leagues",
                    status = "LIVE",
                    matchTime = "Live Now",
                    servers = listOf(
                        StreamServer("Willow HD (Server 1 - 1080p)", "https://willow.live/stream/willowhd/playlist.m3u8", "1080p", isHls = true),
                        StreamServer("Willow HD (Server 2)", "https://cricify.live/stream/willow/index.m3u8", "720p", isHls = true)
                    )
                )
            )
            matches.add(
                LiveCricketMatch(
                    id = "cric_astro_cricket",
                    matchTitle = "Astro Cricket HD - Ultra HD Stream",
                    team1 = "Live Match",
                    team2 = "Coverage",
                    tournament = "Bilateral Series",
                    status = "LIVE",
                    matchTime = "Live Now",
                    servers = listOf(
                        StreamServer("Astro Cricket (1080p 60fps)", "https://cricify.live/stream/astro/index.m3u8", "1080p", isHls = true)
                    )
                )
            )
            matches.add(
                LiveCricketMatch(
                    id = "cric_sony_ten3",
                    matchTitle = "Sony Sports Ten 3 HD (Hindi)",
                    team1 = "Live Sports",
                    team2 = "Hindi Feed",
                    tournament = "Live Cricket & Football",
                    status = "LIVE",
                    matchTime = "Live Now",
                    servers = listOf(
                        StreamServer("Sony Ten 3 (Server 1 - 1080p)", "https://cricify.live/stream/sonyten3/index.m3u8", "1080p", isHls = true)
                    )
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
        matches
    }
}
