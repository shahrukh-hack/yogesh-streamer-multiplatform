package com.yogesh.streamer.core.extractors

import com.yogesh.streamer.core.scrapers.StreamServer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.regex.Pattern

object StreamWishExtractor {
    private val client = OkHttpClient()

    suspend fun extract(url: String): List<StreamServer> = withContext(Dispatchers.IO) {
        val servers = mutableListOf<StreamServer>()
        try {
            val request = Request.Builder()
                .url(url)
                .addHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .addHeader("Referer", url)
                .build()

            val response = client.newCall(request).execute()
            val html = response.body?.string() ?: ""

            val unpacked = if (html.contains("eval(function(p,a,c,k,e,d)")) {
                JsUnpacker.unpack(html)
            } else {
                html
            }

            val m3u8Matcher = Pattern.compile("""(https?://[^\s"'<>]+\.m3u8[^\s"'<>]*)""").matcher(unpacked)
            if (m3u8Matcher.find()) {
                val streamUrl = m3u8Matcher.group(1) ?: ""
                servers.add(StreamServer("StreamWish Pro 1080p", streamUrl, "1080p", true, mapOf("Referer" to url)))
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        servers
    }
}
