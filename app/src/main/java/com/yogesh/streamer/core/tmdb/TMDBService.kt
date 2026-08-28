package com.yogesh.streamer.core.tmdb

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.yogesh.streamer.core.scrapers.MediaItem
import com.yogesh.streamer.core.scrapers.MediaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object TMDBService {
    private const val API_KEY = "e9e9d8da18ae29fc430845952232787c"
    private const val BASE_URL = "https://api.themoviedb.org/3"
    private const val IMG_BASE = "https://image.tmdb.org/t/p/w500"
    private const val BACKDROP_BASE = "https://image.tmdb.org/t/p/original"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    private suspend fun fetchDiscover(endpoint: String): List<MediaItem> = withContext(Dispatchers.IO) {
        val items = mutableListOf<MediaItem>()
        try {
            val separator = if (endpoint.contains("?")) "&" else "?"
            val url = "$BASE_URL/$endpoint${separator}api_key=$API_KEY"
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val json = gson.fromJson(response.body?.string(), JsonObject::class.java)
                val results = json.getAsJsonArray("results")
                results?.forEach { elem ->
                    val obj = elem.asJsonObject
                    val id = obj.get("id").asInt
                    val title = obj.get("title")?.asString ?: obj.get("name")?.asString ?: "Untitled"
                    val posterPath = obj.get("poster_path")?.takeIf { !it.isJsonNull }?.asString
                    val backdropPath = obj.get("backdrop_path")?.takeIf { !it.isJsonNull }?.asString
                    val overview = obj.get("overview")?.takeIf { !it.isJsonNull }?.asString
                    val releaseDate = obj.get("release_date")?.takeIf { !it.isJsonNull }?.asString ?: ""
                    val rating = obj.get("vote_average")?.takeIf { !it.isJsonNull }?.asDouble ?: 8.0

                    if (posterPath != null) {
                        items.add(
                            MediaItem(
                                id = id.toString(),
                                tmdbId = id,
                                title = title,
                                posterUrl = "$IMG_BASE$posterPath",
                                backdropUrl = if (backdropPath != null) "$BACKDROP_BASE$backdropPath" else null,
                                releaseYear = if (releaseDate.length >= 4) releaseDate.substring(0, 4) else "2024",
                                rating = rating,
                                mediaType = MediaType.MOVIE,
                                overview = overview
                            )
                        )
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        items
    }

    suspend fun getHeroBannerItems(): List<MediaItem> = withContext(Dispatchers.IO) {
        val trending = fetchDiscover("trending/movie/day")
        if (trending.isNotEmpty()) trending.take(5) else getFallbackHero()
    }

    suspend fun getGujaratiCinema(): List<MediaItem> = withContext(Dispatchers.IO) {
        val list = fetchDiscover("discover/movie?with_original_language=gu&sort_by=popularity.desc")
        if (list.isNotEmpty()) list else getFallbackGujarati()
    }

    suspend fun getBollywoodHits(): List<MediaItem> = withContext(Dispatchers.IO) {
        val list = fetchDiscover("discover/movie?with_original_language=hi&sort_by=popularity.desc")
        if (list.isNotEmpty()) list else getFallbackBollywood()
    }

    suspend fun getSouthHindiDubbed(): List<MediaItem> = withContext(Dispatchers.IO) {
        fetchDiscover("discover/movie?with_original_language=te|ta|kn|ml&sort_by=popularity.desc")
    }

    suspend fun getHollywood4K(): List<MediaItem> = withContext(Dispatchers.IO) {
        fetchDiscover("trending/movie/day")
    }

    suspend fun getBollywoodSeries(): List<MediaItem> = withContext(Dispatchers.IO) {
        fetchDiscover("discover/tv?with_original_language=hi&sort_by=popularity.desc")
    }

    suspend fun getHollywoodSeries(): List<MediaItem> = withContext(Dispatchers.IO) {
        fetchDiscover("discover/tv?with_original_language=en&sort_by=popularity.desc")
    }

    suspend fun getKDramasHindiDubbed(): List<MediaItem> = withContext(Dispatchers.IO) {
        fetchDiscover("discover/tv?with_original_language=ko&sort_by=popularity.desc")
    }

    suspend fun search(query: String): List<MediaItem> = withContext(Dispatchers.IO) {
        fetchDiscover("search/multi?query=$query")
    }

    private fun getFallbackHero(): List<MediaItem> = listOf(
        MediaItem("hero_stree_2", 1139829, "Stree 2: Sarkate Ka Aatank", "$IMG_BASE/mKsm9bFqfO2Y8yD3qW8p0c6H2o4.jpg", "$BACKDROP_BASE/8kOWDBK6XlPUzckuHDo3wwVRFwt.jpg", "2024", 8.4, MediaType.MOVIE, "hi", "The town of Chanderi is haunted once again by Sarkata.", listOf("Horror", "Comedy", "Blockbuster"))
    )

    private fun getFallbackGujarati(): List<MediaItem> = listOf(
        MediaItem("gu_1", 839436, "Chhello Show", "$IMG_BASE/6yQY3vYjY4K6r8g2w4t1x.jpg", null, "2022", 8.6, MediaType.MOVIE, "gu", "India's official Oscar entry in Gujarati.")
    )

    private fun getFallbackBollywood(): List<MediaItem> = listOf(
        MediaItem("bolly_1", 1139829, "Stree 2", "$IMG_BASE/mKsm9bFqfO2Y8yD3qW8p0c6H2o4.jpg", null, "2024", 8.4, MediaType.MOVIE, "hi", "Blockbuster horror comedy.")
    )
}
