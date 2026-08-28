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
                        StreamServer("Star Sports Hindi (1080p Ultra HD)", "https://cricify.live/stream/star1hindi/index.m3u8", "1080p", isHls = true)
                    )
                )
            )
            matches.add(
                LiveCricketMatch(
                    id = "cric_astro_cricket",
                    matchTitle = "Astro Cricket HD - Ultra HD 60fps",
                    team1 = "Live Match",
                    team2 = "Coverage",
                    tournament = "Bilateral Series & T20",
                    status = "LIVE",
                    matchTime = "Live Now",
                    servers = listOf(
                        StreamServer("Astro Cricket (1080p 60fps Direct)", "https://cricify.live/stream/astro/index.m3u8", "1080p", isHls = true)
                    )
                )
            )
            matches.add(
                LiveCricketMatch(
                    id = "cric_sony_ten3",
                    matchTitle = "Sony Sports Ten 3 HD (Hindi)",
                    team1 = "Live Sports",
                    team2 = "Hindi Feed",
                    tournament = "Cricket & Multi-Sport",
                    status = "LIVE",
                    matchTime = "Live Now",
                    servers = listOf(
                        StreamServer("Sony Ten 3 (1080p HD Direct)", "https://cricify.live/stream/sonyten3/index.m3u8", "1080p", isHls = true)
                    )
                )
            )
            matches.add(
                LiveCricketMatch(
                    id = "cric_dd_sports",
                    matchTitle = "DD Sports HD - India National Feed",
                    team1 = "National Games",
                    team2 = "Live",
                    tournament = "National Sports",
                    status = "LIVE",
                    matchTime = "Live Now",
                    servers = listOf(
                        StreamServer("DD Sports (1080p HD Direct)", "https://d2lk5u59tns74c.cloudfront.net/out/v1/380b0765f87741a4812bc952ec6fbf21/index.m3u8", "1080p", isHls = true)
                    )
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
        matches
    }
}
