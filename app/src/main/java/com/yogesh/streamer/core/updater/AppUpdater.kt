package com.yogesh.streamer.core.updater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

data class UpdateInfo(
    val hasUpdate: Boolean,
    val latestVersion: String,
    val downloadUrl: String,
    val releaseNotes: String
)

object AppUpdater {
    private const val TAG = "AppUpdater"
    private const val GITHUB_REPO = "shahrukh-hack/yogesh-streamer-multiplatform"
    const val CURRENT_VERSION_CODE = 110
    const val CURRENT_VERSION_NAME = "1.1.0"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    suspend fun checkForUpdate(): UpdateInfo = withContext(Dispatchers.IO) {
        try {
            val url = "https://api.github.com/repos/\/releases/latest"
            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val json = JSONObject(response.body?.string() ?: "")
                val tagName = json.optString("tag_name", "").removePrefix("v")
                val body = json.optString("body", "")
                val assets = json.optJSONArray("assets")

                var apkDownloadUrl = ""
                if (assets != null) {
                    for (i in 0 until assets.length()) {
                        val asset = assets.getJSONObject(i)
                        val name = asset.optString("name", "")
                        if (name.endsWith(".apk", ignoreCase = true)) {
                            apkDownloadUrl = asset.optString("browser_download_url", "")
                            break
                        }
                    }
                }

                val hasUpdate = isNewerVersion(tagName, CURRENT_VERSION_NAME)
                return@withContext UpdateInfo(hasUpdate, tagName, apkDownloadUrl, body)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to check for updates", e)
        }
        UpdateInfo(false, CURRENT_VERSION_NAME, "", "")
    }

    private fun isNewerVersion(latest: String, current: String): Boolean {
        if (latest.isBlank()) return false
        val lParts = latest.split(".").mapNotNull { it.toIntOrNull() }
        val cParts = current.split(".").mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(lParts.size, cParts.size)) {
            val l = lParts.getOrElse(i) { 0 }
            val c = cParts.getOrElse(i) { 0 }
            if (l > c) return true
            if (l < c) return false
        }
        return false
    }

    suspend fun downloadAndInstallApk(context: Context, downloadUrl: String, onProgress: (Int) -> Unit) = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(downloadUrl).build()
            val response = client.newCall(request).execute()
            val body = response.body ?: return@withContext

            val apkFile = File(context.cacheDir, "YogeshStreamer-Update.apk")
            val outputStream = FileOutputStream(apkFile)
            val inputStream = body.byteStream()
            val totalBytes = body.contentLength()
            var downloadedBytes = 0L

            val buffer = ByteArray(8 * 1024)
            var bytesRead: Int
            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                outputStream.write(buffer, 0, bytesRead)
                downloadedBytes += bytesRead
                if (totalBytes > 0) {
                    val progress = ((downloadedBytes * 100) / totalBytes).toInt()
                    onProgress(progress)
                }
            }
            outputStream.flush()
            outputStream.close()
            inputStream.close()

            // Trigger Seamless Android Package Installer
            withContext(Dispatchers.Main) {
                val uri = FileProvider.getUriForFile(
                    context,
                    "\.fileprovider",
                    apkFile
                )
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                }
                context.startActivity(intent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error downloading and installing APK", e)
        }
    }
}
