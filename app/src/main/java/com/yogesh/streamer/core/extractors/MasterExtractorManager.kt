package com.yogesh.streamer.core.extractors

import com.yogesh.streamer.core.scrapers.CastleTVScraper
import com.yogesh.streamer.core.scrapers.CricifyScraper
import com.yogesh.streamer.core.scrapers.LiveCricketMatch
import com.yogesh.streamer.core.scrapers.StreamServer
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

        // 1. Query SuperStream & Multi-Audio Extractors in parallel
        val superStreamDeferred = async { SuperStreamExtractor.extract(tmdbId) }
        val castleTvDeferred = async { CastleTVScraper.extractStreams(title) }

        val superStreams = superStreamDeferred.await()
        val castleStreams = castleTvDeferred.await()

        serverList.addAll(superStreams)
        serverList.addAll(castleStreams)

        // 2. Add fallback server if empty
        if (serverList.isEmpty()) {
            serverList.add(
                StreamServer(
                    serverName = "VidCloud Multi-Audio Pro",
                    streamUrl = "https://vidsrc.xyz/embed/movie?tmdb=",
                    quality = "1080p Ultra HD"
                )
            )
        }

        ExtractedMediaStreams(
            title = title,
            servers = serverList
        )
    }

    suspend fun getLiveCricketStreams(): List<LiveCricketMatch> = withContext(Dispatchers.IO) {
        CricifyScraper.getLiveMatches()
    }
}
