package com.yogesh.streamer.core.extractors

import com.yogesh.streamer.core.scrapers.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext

data class ExtractedMediaStreams(
    val title: String,
    val servers: List<StreamServer>,
    val defaultAudioLanguage: String = "hi",
    val availableAudioLanguages: List<String> = listOf("Hindi (Main)", "Gujarati", "English", "Tamil", "Telugu")
)

object MasterExtractorManager {

    suspend fun getMovieStreams(tmdbId: Int, title: String): ExtractedMediaStreams = withContext(Dispatchers.IO) {
        val serverList = mutableListOf<StreamServer>()

        val netmirrorDeferred = async { NetMirrorScraper.resolveStreams(tmdbId, title) }
        val hdhubDeferred = async { HDHub4uScraper.resolveStreams(tmdbId, title) }
        val movieBoxDeferred = async { MovieBoxScraper.resolveStreams(tmdbId, title) }
        val castleTvDeferred = async { CastleTVScraper.resolveMovieStreams(tmdbId, title) }
        val superStreamDeferred = async { SuperStreamExtractor.extract(tmdbId) }

        try {
            serverList.addAll(netmirrorDeferred.await())
        } catch (e: Exception) { e.printStackTrace() }

        try {
            serverList.addAll(hdhubDeferred.await())
        } catch (e: Exception) { e.printStackTrace() }

        try {
            serverList.addAll(movieBoxDeferred.await())
        } catch (e: Exception) { e.printStackTrace() }

        try {
            serverList.addAll(castleTvDeferred.await())
        } catch (e: Exception) { e.printStackTrace() }

        try {
            serverList.addAll(superStreamDeferred.await())
        } catch (e: Exception) { e.printStackTrace() }

        if (serverList.isEmpty()) {
            serverList.add(
                StreamServer(
                    serverName = "Universal Multi-Audio Server 1",
                    streamUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
                    quality = "1080p Ultra HD",
                    isHls = true,
                    headers = mapOf("Referer" to "https://cricify.live/")
                )
            )
        }

        ExtractedMediaStreams(
            title = title,
            servers = serverList
        )
    }

    suspend fun getLiveCricketStreams(): List<LiveCricketMatch> = withContext(Dispatchers.IO) {
        val matches = mutableListOf<LiveCricketMatch>()

        val cricifyDeferred = async { CricifyScraper.getLiveMatches() }
        val sktechDeferred = async { SKTechScraper.getLiveSportsServers() }
        val sportzxDeferred = async { SportzxScraper.getLiveSportsServers() }

        val cricifyMatches = try { cricifyDeferred.await() } catch (e: Exception) { emptyList() }
        val sktechServers = try { sktechDeferred.await() } catch (e: Exception) { emptyList() }
        val sportzxServers = try { sportzxDeferred.await() } catch (e: Exception) { emptyList() }

        matches.addAll(cricifyMatches)

        if (sktechServers.isNotEmpty() || sportzxServers.isNotEmpty()) {
            val extraServers = mutableListOf<StreamServer>()
            extraServers.addAll(sktechServers)
            extraServers.addAll(sportzxServers)

            matches.add(
                LiveCricketMatch(
                    id = "live_multi_sports_hub",
                    matchTitle = "Live Sports Multi-Server Hub (Star / Sony / Willow / Astro)",
                    team1 = "Universal",
                    team2 = "Multi-Server",
                    tournament = "Live Cricket & Sports",
                    status = "LIVE",
                    matchTime = "Live Now",
                    servers = extraServers
                )
            )
        }

        matches
    }
}
