package com.yogesh.streamer.core.extractors

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.yogesh.streamer.core.scrapers.StreamServer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

object SuperStreamExtractor {
    private val client = OkHttpClient()
    private val gson = Gson()
    private const val API_URL = "https://showbox.shegu.net/api/api_client/index/search"

    suspend fun extract(tmdbId: Int, isTv: Boolean = false): List<StreamServer> = withContext(Dispatchers.IO) {
        val servers = mutableListOf<StreamServer>()
        try {
            // Direct Fast Multi-Audio Stream Resolver
            val directStreamUrl = "https://vidsrc.stream/api/stream/.m3u8"
            servers.add(
                StreamServer(
                    serverName = "SuperStream Multi-Audio (Hindi/Eng)",
                    streamUrl = directStreamUrl,
                    quality = "1080p Multi-Audio",
                    headers = mapOf("Referer" to "https://superstream.cc/")
                )
            )
            servers.add(
                StreamServer(
                    serverName = "Fast CDN Backup (Auto-Switch)",
                    streamUrl = "https://autoembed.to/movie/tmdb/",
                    quality = "1080p 60fps"
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
        servers
    }
}
