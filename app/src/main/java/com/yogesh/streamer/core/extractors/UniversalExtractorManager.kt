package com.yogesh.streamer.core.extractors

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object UniversalExtractorManager {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val extractors = mutableListOf<ExtractorApi>()

    fun registerExtractor(extractor: ExtractorApi) {
        extractors.add(extractor)
    }

    suspend fun resolveStream(url: String, referer: String? = null): List<ExtractedStream> = withContext(Dispatchers.IO) {
        val results = mutableListOf<ExtractedStream>()

        // 1. Check if the URL is already a direct HLS or MP4 feed
        if (url.contains(".m3u8", ignoreCase = true) || url.contains(".mp4", ignoreCase = true)) {
            results.add(
                ExtractedStream(
                    name = "Direct Master Stream",
                    url = url,
                    quality = "Auto HD",
                    isHls = url.contains(".m3u8", ignoreCase = true)
                )
            )
            return@withContext results
        }

        // 2. Dispatch to registered host extractors
        for (extractor in extractors) {
            if (url.contains(extractor.mainUrl, ignoreCase = true)) {
                try {
                    val extracted = extractor.getUrl(url, referer)
                    results.addAll(extracted)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        // 3. Fallback: Generic Direct Master Playlist Scanner with Dean Edwards Unpacker
        if (results.isEmpty()) {
            try {
                val req = Request.Builder()
                    .url(url)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .apply { if (referer != null) header("Referer", referer) }
                    .build()

                val response = client.newCall(req).execute()
                val html = response.body?.string() ?: ""

                // Check for packed JS and unpack
                val unpacked = JsUnpacker.unpack(html) ?: html

                // Find m3u8 playlist links in the body
                val m3u8Match = Regex("""https?://[^\s"'<>]+\.m3u8[^\s"'<>]*""").find(unpacked)
                if (m3u8Match != null) {
                    results.add(
                        ExtractedStream(
                            name = "Auto-Resolved Direct HLS",
                            url = m3u8Match.value,
                            quality = "1080p",
                            isHls = true
                        )
                    )
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        results
    }
}
