package com.yogesh.streamer.core.channels

enum class ChannelCategory(val displayName: String) {
    ALL("All Channels"),
    GUJARATI("Gujarati Regional"),
    MOVIES("Movie Channels"),
    ENTERTAINMENT("Entertainment"),
    NEWS("News 24/7"),
    MUSIC("Music Hits"),
    DEVOTIONAL("Spiritual & Bhakti"),
    SPORTS("Sports Channels")
}

data class LiveChannel(
    val id: String,
    val name: String,
    val category: ChannelCategory,
    val streamUrl: String,
    val logoUrl: String,
    val quality: String = "1080p HD",
    val headers: Map<String, String> = mapOf(
        "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer" to "https://cricify.live/"
    )
)
