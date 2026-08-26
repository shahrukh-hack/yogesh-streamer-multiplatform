package com.yogesh.streamer.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.yogesh.streamer.R
import com.yogesh.streamer.core.scrapers.MediaItem
import com.yogesh.streamer.core.tmdb.TMDBService
import com.yogesh.streamer.ui.components.HeroBanner
import com.yogesh.streamer.ui.components.MediaCard
import com.yogesh.streamer.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    onMediaClick: (MediaItem) -> Unit,
    onPlayClick: (MediaItem) -> Unit
) {
    var heroItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var gujaratiMovies by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var bollywoodHits by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var southHindi by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var hollywood4K by remember { mutableStateOf<List<MediaItem>>(emptyList()) }

    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        scope.launch { heroItems = TMDBService.getHeroBannerItems() }
        scope.launch { gujaratiMovies = TMDBService.getGujaratiCinema() }
        scope.launch { bollywoodHits = TMDBService.getBollywoodHits() }
        scope.launch { southHindi = TMDBService.getSouthHindiDubbed() }
        scope.launch { hollywood4K = TMDBService.getHollywood4K() }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(horizontal = 16.dp),
        contentPadding = PaddingValues(bottom = 80.dp)
    ) {
        // App Bar / Royal Branding Header
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.splash_logo),
                    contentDescription = "Y+M Luxury Crest",
                    modifier = Modifier.size(40.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column {
                    Text(
                        text = "YOGESH STREAMER",
                        color = GoldPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.2.sp
                    )
                    Text(
                        text = "Luxury Multi-Platform Streaming",
                        color = CyanAccent,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        // Hero Banner
        item {
            heroItems.firstOrNull()?.let { hero ->
                HeroBanner(
                    item = hero,
                    onPlayClick = { onPlayClick(hero) },
                    onDetailsClick = { onMediaClick(hero) }
                )
                Spacer(modifier = Modifier.height(20.dp))
            }
        }

        // ?? Gujarati Cinema Row
        item {
            SectionHeader(title = "?? Gujarati Blockbusters", subtitle = "Pure Regional Cinema")
            LazyRow(modifier = Modifier.padding(vertical = 8.dp)) {
                items(gujaratiMovies) { item ->
                    MediaCard(item = item, onClick = { onMediaClick(item) })
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ?? Bollywood Blockbusters Row
        item {
            SectionHeader(title = "?? Bollywood Blockbusters", subtitle = "Latest Hindi Releases")
            LazyRow(modifier = Modifier.padding(vertical = 8.dp)) {
                items(bollywoodHits) { item ->
                    MediaCard(item = item, onClick = { onMediaClick(item) })
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ?? South Hindi Dubbed Row
        item {
            SectionHeader(title = "?? South Hindi Dubbed", subtitle = "Action Epics & Thrillers")
            LazyRow(modifier = Modifier.padding(vertical = 8.dp)) {
                items(southHindi) { item ->
                    MediaCard(item = item, onClick = { onMediaClick(item) })
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ?? Hollywood 4K Blockbusters Row
        item {
            SectionHeader(title = "?? Hollywood 4K Ultra HD", subtitle = "Worldwide Trending Hits")
            LazyRow(modifier = Modifier.padding(vertical = 8.dp)) {
                items(hollywood4K) { item ->
                    MediaCard(item = item, onClick = { onMediaClick(item) })
                }
            }
        }
    }
}

@Composable
fun SectionHeader(title: String, subtitle: String) {
    Column {
        Text(
            text = title,
            color = TextPrimary,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = subtitle,
            color = TextMuted,
            fontSize = 11.sp
        )
    }
}
