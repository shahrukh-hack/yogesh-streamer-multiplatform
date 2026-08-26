package com.yogesh.streamer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SportsCricket
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.yogesh.streamer.core.scrapers.LiveCricketMatch
import com.yogesh.streamer.core.scrapers.ScraperManager
import com.yogesh.streamer.core.scrapers.StreamServer
import com.yogesh.streamer.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun LiveCricketScreen(
    onPlayLiveServer: (StreamServer, String) -> Unit
) {
    var liveMatches by remember { mutableStateOf<List<LiveCricketMatch>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        scope.launch {
            liveMatches = ScraperManager.getLiveCricketMatches()
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp),
        contentPadding = PaddingValues(bottom = 80.dp)
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.SportsCricket,
                    contentDescription = "Cricket",
                    tint = GoldPrimary,
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = "LIVE CRICKET & SPORTS HUB",
                        color = TextPrimary,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        text = "Powered by Cricify, Sktech & Sportzx • Zero Buffering",
                        color = CyanAccent,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        items(liveMatches) { match ->
            LiveMatchCard(
                match = match,
                onServerClick = { server -> onPlayLiveServer(server, match.matchTitle) }
            )
            Spacer(modifier = Modifier.height(14.dp))
        }
    }
}

@Composable
fun LiveMatchCard(
    match: LiveCricketMatch,
    onServerClick: (StreamServer) -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) GoldPrimary else SurfaceVariant,
                shape = RoundedCornerShape(12.dp)
            ),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = match.tournament,
                    color = CyanAccent,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )

                // LIVE Pulsing Badge
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .background(LiveRed.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(LiveRed)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = match.status,
                        color = LiveRed,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = match.matchTitle,
                color = TextPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Multi-Server Options
            Text(
                text = "SELECT STREAM SERVER:",
                color = TextMuted,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                match.servers.forEach { server ->
                    Button(
                        onClick = { onServerClick(server) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = SurfaceVariant,
                            contentColor = GoldPrimary
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = "Play",
                            modifier = Modifier.size(16.dp),
                            tint = GoldPrimary
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = server.serverName.substringBefore("(").trim(),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}
