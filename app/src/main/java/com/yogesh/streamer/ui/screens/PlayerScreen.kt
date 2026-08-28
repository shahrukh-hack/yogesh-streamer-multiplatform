package com.yogesh.streamer.ui.screens

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.ViewGroup
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.yogesh.streamer.ui.theme.*
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

@OptIn(UnstableApi::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PlayerScreen(
    videoUrl: String,
    title: String,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val isDirectStream = remember(videoUrl) {
        videoUrl.contains(".m3u8", ignoreCase = true) ||
        videoUrl.contains(".mp4", ignoreCase = true) ||
        videoUrl.contains("cricify.live", ignoreCase = true) ||
        videoUrl.contains("willow", ignoreCase = true) ||
        videoUrl.contains("cloudfront.net", ignoreCase = true) ||
        videoUrl.contains("akamaized.net", ignoreCase = true) ||
        videoUrl.contains("tangotv.in", ignoreCase = true) ||
        videoUrl.contains("jsrdn.com", ignoreCase = true) ||
        videoUrl.contains("amagi.tv", ignoreCase = true)
    }

    var showAudioDialog by remember { mutableStateOf(false) }
    var selectedAudioTrack by remember { mutableStateOf("Hindi (Default)") }
    val audioLanguages = listOf("Hindi (Dubbed/Original)", "Gujarati", "English", "Tamil", "Telugu")

    DisposableEffect(Unit) {
        val activity = context as? Activity
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    BackHandler {
        onBack()
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (isDirectStream) {
            val okHttpClient = remember {
                OkHttpClient.Builder()
                    .connectTimeout(15, TimeUnit.SECONDS)
                    .readTimeout(20, TimeUnit.SECONDS)
                    .addInterceptor { chain ->
                        val request = chain.request().newBuilder()
                            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                            .header("Referer", "https://cricify.live/")
                            .header("Origin", "https://cricify.live")
                            .build()
                        chain.proceed(request)
                    }
                    .build()
            }

            val exoPlayer = remember {
                val dataSourceFactory = OkHttpDataSource.Factory(okHttpClient)
                val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)

                ExoPlayer.Builder(context)
                    .setMediaSourceFactory(mediaSourceFactory)
                    .build().apply {
                        val mediaItem = MediaItem.fromUri(videoUrl)
                        setMediaItem(mediaItem)
                        prepare()
                        playWhenReady = true

                        addListener(object : Player.Listener {
                            override fun onPlayerError(error: PlaybackException) {
                                Toast.makeText(context, "Stream connection failed. Retrying alternate server...", Toast.LENGTH_SHORT).show()
                            }
                        })
                    }
            }

            DisposableEffect(Unit) {
                onDispose {
                    exoPlayer.release()
                }
            }

            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = exoPlayer
                        useController = true
                        layoutParams = FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                }
            )
        } else {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        settings.useWideViewPort = true
                        settings.loadWithOverviewMode = true
                        settings.userAgentString = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                val url = request?.url?.toString() ?: ""
                                if (url.contains("google", ignoreCase = true) ||
                                    url.contains("ad", ignoreCase = true) ||
                                    url.contains("pop", ignoreCase = true) ||
                                    url.contains("bet", ignoreCase = true) ||
                                    url.contains("casino", ignoreCase = true) ||
                                    url.contains("telegram", ignoreCase = true)) {
                                    return true
                                }
                                return false
                            }
                        }

                        webChromeClient = WebChromeClient()
                        loadUrl(videoUrl)
                    }
                }
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = title,
                    color = Color.White,
                    fontSize = 16.sp,
                    maxLines = 1
                )
            }

            if (isDirectStream) {
                Button(
                    onClick = { showAudioDialog = true },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0x80121824)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Audiotrack, contentDescription = "Audio Track", tint = GoldPrimary, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Audio: $selectedAudioTrack", color = GoldPrimary, fontSize = 12.sp)
                }
            }
        }
    }
}
