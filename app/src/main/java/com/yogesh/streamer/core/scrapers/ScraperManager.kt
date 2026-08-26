package com.yogesh.streamer.core.scrapers

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext

object ScraperManager {
    private var isInitialized = false

    fun init(context: Context) {
        isInitialized = true
    }

    suspend fun getLiveCricketMatches(): List<LiveCricketMatch> = withContext(Dispatchers.IO) {
        val cricifyDeferred = async { CricifyScraper.getLiveMatches() }
        val sktechDeferred = async { SktechScraper.getLiveSports() }

        val results = mutableListOf<LiveCricketMatch>()
        results.addAll(cricifyDeferred.await())
        results.addAll(sktechDeferred.await())
        results
    }

    suspend fun resolveMovieStreams(tmdbId: Int, title: String): List<StreamServer> = withContext(Dispatchers.IO) {
        val servers = mutableListOf<StreamServer>()
        val castleDeferred = async { CastleTVScraper.resolveMovieStreams(tmdbId, title) }
        val vidsrcDeferred = async { VidSrcScraper.resolveStream(tmdbId) }
        val autoEmbedDeferred = async { AutoEmbedScraper.resolveStream(tmdbId) }

        servers.addAll(castleDeferred.await())
        servers.addAll(vidsrcDeferred.await())
        servers.addAll(autoEmbedDeferred.await())
        servers
    }
}
