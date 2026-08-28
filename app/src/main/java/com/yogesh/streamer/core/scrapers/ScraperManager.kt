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
        val sktechDeferred = async { SKTechScraper.getLiveSportsServers() }

        val results = mutableListOf<LiveCricketMatch>()
        results.addAll(cricifyDeferred.await())
        results
    }

    suspend fun resolveMovieStreams(tmdbId: Int, title: String): List<StreamServer> = withContext(Dispatchers.IO) {
        val servers = mutableListOf<StreamServer>()
        val castleDeferred = async { CastleTVScraper.resolveMovieStreams(tmdbId, title) }
        val hdhubDeferred = async { HDHub4uScraper.resolveStreams(tmdbId, title) }
        val movieboxDeferred = async { MovieBoxScraper.resolveStreams(tmdbId, title) }

        servers.addAll(castleDeferred.await())
        servers.addAll(hdhubDeferred.await())
        servers.addAll(movieboxDeferred.await())
        servers
    }
}
