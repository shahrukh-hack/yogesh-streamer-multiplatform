package com.yogesh.streamer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.yogesh.streamer.core.extractors.ExtractedMediaStreams
import com.yogesh.streamer.core.extractors.MasterExtractorManager
import com.yogesh.streamer.core.scrapers.MediaItem
import com.yogesh.streamer.core.scrapers.StreamServer
import com.yogesh.streamer.ui.theme.DarkNavy
import com.yogesh.streamer.ui.theme.NeonCyan
import com.yogesh.streamer.ui.theme.RoyalGold

@Composable
fun DetailsScreen(
    item: MediaItem,
    onBack: () -> Unit,
    onPlay: (String, String) -> Unit
) {
    var streams by remember { mutableStateOf<ExtractedMediaStreams?>(null) }
    var isLoadingStreams by remember { mutableStateOf(true) }
    val scrollState = rememberScrollState()

    LaunchedEffect(item.tmdbId) {
        val tmdbId = item.tmdbId ?: item.id.toIntOrNull() ?: 1139829
        streams = MasterExtractorManager.getMovieStreams(tmdbId, item.title)
        isLoadingStreams = false
    }

    Box(modifier = Modifier.fillMaxSize().background(DarkNavy)) {
        Column(modifier = Modifier.fillMaxSize().verticalScroll(scrollState)) {
            // Backdrop Header
            Box(modifier = Modifier.fillMaxWidth().height(280.dp)) {
                AsyncImage(
                    model = item.backdropUrl ?: item.posterUrl,
                    contentDescription = item.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, DarkNavy.copy(alpha = 0.8f), DarkNavy)
                            )
                        )
                )
                IconButton(
                    onClick = onBack,
                    modifier = Modifier.padding(16.dp).align(Alignment.TopStart)
                ) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
            }

            // Info Section
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = item.title,
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(text = "? ", color = RoyalGold, fontSize = 14.sp)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(text = item.releaseYear, color = Color.Gray, fontSize = 14.sp)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(text = "Multi-Audio (Hindi/Eng/Guj)", color = NeonCyan, fontSize = 12.sp)
                }

                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = item.overview ?: "High definition stream with multi-server playback and zero advertisements.",
                    color = Color(0xFFB0B8C4),
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )

                Spacer(modifier = Modifier.height(24.dp))

                // Play Button
                Button(
                    onClick = {
                        val firstServer = streams?.servers?.firstOrNull()
                        val url = firstServer?.streamUrl ?: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
                        onPlay(url, item.title)
                    },
                    modifier = Modifier.fillMaxWidth().height(50.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = RoyalGold),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = "Play", tint = Color.Black)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Play Movie (1080p Multi-Audio)", color = Color.Black, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Multi-Server Options
                Text(
                    text = "? Select Streaming Server (Auto-Fallback)",
                    color = RoyalGold,
                    fontSize = 16.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))

                if (isLoadingStreams) {
                    CircularProgressIndicator(color = RoyalGold, modifier = Modifier.padding(16.dp))
                } else {
                    streams?.servers?.forEach { server ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clickable { onPlay(server.streamUrl, " ()") },
                            colors = CardDefaults.cardColors(containerColor = Color(0xFF121824)),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(server.serverName, color = Color.White, fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
                                    Text("0% Ads • Multi-Audio Supported", color = NeonCyan, fontSize = 11.sp)
                                }
                                Text(server.quality, color = RoyalGold, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
