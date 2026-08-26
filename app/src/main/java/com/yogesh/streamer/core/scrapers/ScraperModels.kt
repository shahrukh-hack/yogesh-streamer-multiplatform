package com.yogesh.streamer.core.scrapers

enum class MediaType {
    MOVIE,
    TV_SERIES,
    LIVE_CRICKET
}

data class MediaItem(
    val id: String,
    val tmdbId: Int? = null,
    val title: String,
    val posterUrl: String,
    val backdropUrl: String? = null,
    val releaseYear: String? = null,
    val rating: Double? = null,
    val mediaType: MediaType = MediaType.MOVIE,
    val language: String = "hi",
    val overview: String? = null,
    val genres: List<String> = emptyList()
)

data class StreamServer(
    val serverName: String,
    val streamUrl: String,
    val quality: String = "1080p",
    val isHls: Boolean = true,
    val headers: Map<String, String> = emptyMap()
)

data class LiveCricketMatch(
    val id: String,
    val matchTitle: String,
    val team1: String,
    val team2: String,
    val tournament: String,
    val status: String, // LIVE, UPCOMING, COMPLETED
    val matchTime: String,
    val servers: List<StreamServer> = emptyList()
)

data class StreamResult(
    val title: String,
    val servers: List<StreamServer>,
    val subtitles: List<SubtitleTrack> = emptyList()
)

data class SubtitleTrack(
    val language: String,
    val url: String
)
