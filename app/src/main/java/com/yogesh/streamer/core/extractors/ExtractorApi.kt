package com.yogesh.streamer.core.extractors

data class ExtractedStream(
    val name: String,
    val url: String,
    val quality: String = "1080p",
    val headers: Map<String, String> = emptyMap(),
    val isHls: Boolean = true
)

interface ExtractorApi {
    val name: String
    val mainUrl: String
    val requiresReferer: Boolean get() = false

    suspend fun getUrl(url: String, referer: String? = null): List<ExtractedStream>
}
