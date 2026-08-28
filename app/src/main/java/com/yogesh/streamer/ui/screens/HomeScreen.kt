package com.yogesh.streamer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.yogesh.streamer.core.scrapers.MediaItem
import com.yogesh.streamer.core.tmdb.TMDBService
import com.yogesh.streamer.ui.components.HeroBanner
import com.yogesh.streamer.ui.components.MediaCard
import com.yogesh.streamer.ui.theme.BgDark
import com.yogesh.streamer.ui.theme.CyanAccent
import com.yogesh.streamer.ui.theme.GoldPrimary
import com.yogesh.streamer.ui.theme.TextPrimary
import kotlinx.coroutines.async

@Composable
fun HomeScreen(
    onMediaClick: (MediaItem) -> Unit,
    onPlayClick: (MediaItem) -> Unit
) {
    var heroItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var gujaratiItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var bollywoodItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var bollywoodSeries by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var kdramaItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var southItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var hollywoodSeries by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var hollywoodItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val heroDeferred = async { TMDBService.getHeroBannerItems() }
        val gujaratiDeferred = async { TMDBService.getGujaratiCinema() }
        val bollywoodDeferred = async { TMDBService.getBollywoodHits() }
        val seriesDeferred = async { TMDBService.getBollywoodSeries() }
        val kdramaDeferred = async { TMDBService.getKDramasHindiDubbed() }
        val southDeferred = async { TMDBService.getSouthHindiDubbed() }
        val hollywoodSeriesDeferred = async { TMDBService.getHollywoodSeries() }
        val hollywoodDeferred = async { TMDBService.getHollywood4K() }

        heroItems = heroDeferred.await()
        gujaratiItems = gujaratiDeferred.await()
        bollywoodItems = bollywoodDeferred.await()
        bollywoodSeries = seriesDeferred.await()
        kdramaItems = kdramaDeferred.await()
        southItems = southDeferred.await()
        hollywoodSeries = hollywoodSeriesDeferred.await()
        hollywoodItems = hollywoodDeferred.await()
        isLoading = false
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
    ) {
        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = GoldPrimary)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 80.dp)
            ) {
                // Dynamic Hero Banner
                if (heroItems.isNotEmpty()) {
                    val hero = heroItems.first()
                    item {
                        HeroBanner(
                            item = hero,
                            onPlayClick = { onPlayClick(hero) },
                            onDetailsClick = { onMediaClick(hero) }
                        )
                    }
                }

                // Gujarati Cinema Row
                if (gujaratiItems.isNotEmpty()) {
                    item {
                        HomeSection(
                            title = "Gujarati Blockbusters",
                            subtitle = "Pure Regional Cinema",
                            items = gujaratiItems,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // Bollywood Blockbusters Row
                if (bollywoodItems.isNotEmpty()) {
                    item {
                        HomeSection(
                            title = "Bollywood Blockbusters",
                            subtitle = "Latest Hindi Releases",
                            items = bollywoodItems,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // Bollywood Web Series Row
                if (bollywoodSeries.isNotEmpty()) {
                    item {
                        HomeSection(
                            title = "Bollywood Web Series",
                            subtitle = "Trending OTT Original Shows",
                            items = bollywoodSeries,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // K-Dramas Hindi Dubbed Row
                if (kdramaItems.isNotEmpty()) {
                    item {
                        HomeSection(
                            title = "K-Dramas (Hindi Dubbed)",
                            subtitle = "Top Korean Romances & Thrillers",
                            items = kdramaItems,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // South Hindi Dubbed Row
                if (southItems.isNotEmpty()) {
                    item {
                        HomeSection(
                            title = "South Hindi Dubbed",
                            subtitle = "Action Epics & Thrillers",
                            items = southItems,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // Hollywood Web Series Row
                if (hollywoodSeries.isNotEmpty()) {
                    item {
                        HomeSection(
                            title = "Hollywood TV Series & Shows",
                            subtitle = "Global Binge-Worthy Series",
                            items = hollywoodSeries,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // Hollywood 4K Blockbusters Row
                if (hollywoodItems.isNotEmpty()) {
                    item {
                        HomeSection(
                            title = "Hollywood 4K Ultra HD",
                            subtitle = "Worldwide Trending Hits",
                            items = hollywoodItems,
                            onItemClick = onMediaClick
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeSection(
    title: String,
    subtitle: String,
    items: List<MediaItem>,
    onItemClick: (MediaItem) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) {
        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
            Text(
                text = title,
                color = TextPrimary,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = subtitle,
                color = CyanAccent,
                fontSize = 11.sp
            )
        }
        Spacer(modifier = Modifier.height(10.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(items) { item ->
                MediaCard(
                    item = item,
                    onClick = { onItemClick(item) }
                )
            }
        }
    }
}
