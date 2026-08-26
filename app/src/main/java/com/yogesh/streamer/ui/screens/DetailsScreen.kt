package com.yogesh.streamer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.yogesh.streamer.core.scrapers.MediaItem
import com.yogesh.streamer.core.scrapers.ScraperManager
import com.yogesh.streamer.core.scrapers.StreamServer
import com.yogesh.streamer.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun DetailsScreen(
    item: MediaItem,
    onBackClick: () -> Unit,
    onPlayServer: (StreamServer, String) -> Unit
) {
    var servers by remember { mutableStateOf<List<StreamServer>>(emptyList()) }
    var isLoadingServers by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(item) {
        scope.launch {
            item.tmdbId?.let { id ->
                servers = ScraperManager.resolveMovieStreams(id, item.title)
            }
            isLoadingServers = false
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(BgDark)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 80.dp)
        ) {
            // Backdrop Header
            item {
                Box(modifier = Modifier.fillMaxWidth().height(260.dp)) {
                    AsyncImage(
                        model = item.backdropUrl ?: item.posterUrl,
                        contentDescription = item.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                    Box(
                        modifier = Modifier.fillMaxSize().background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, BgDark.copy(alpha = 0.8f), BgDark)
                            )
                        )
                    )
                    IconButton(
                        onClick = onBackClick,
                        modifier = Modifier.padding(16.dp).align(Alignment.TopStart)
                    ) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                    }
                }
            }

            // Title & Info
            item {
                Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        text = item.title,
                        color = TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        item.rating?.let { rating ->
                            Icon(Icons.Default.Star, contentDescription = "Rating", tint = GoldPrimary, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(text = String.format("%.1f", rating), color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Spacer(modifier = Modifier.width(12.dp))
                        }
                        item.releaseYear?.let {
                            Text(text = it, color = TextMuted, fontSize = 13.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Text(
                        text = "SYNOPSIS",
                        color = GoldPrimary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = item.overview ?: "No description available.",
                        color = TextSecondary,
                        fontSize = 13.sp,
                        lineHeight = 20.sp
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    Text(
                        text = "AVAILABLE STREAMING SERVERS (CASTLETV / VIDSRC / AUTOEMBED):",
                        color = TextPrimary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    if (isLoadingServers) {
                        CircularProgressIndicator(color = GoldPrimary, modifier = Modifier.padding(16.dp))
                    } else if (servers.isEmpty()) {
                        Text("Resolving live links...", color = TextMuted, fontSize = 12.sp)
                    } else {
                        servers.forEach { server ->
                            Button(
                                onClick = { onPlayServer(server, item.title) },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = SurfaceCard,
                                    contentColor = GoldPrimary
                                ),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                contentPadding = PaddingValues(14.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.PlayArrow, contentDescription = "Play", tint = GoldPrimary)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(text = server.serverName, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    }
                                    Text(text = server.quality, color = CyanAccent, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
