package com.yogesh.streamer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.yogesh.streamer.core.scrapers.MediaItem
import com.yogesh.streamer.core.tmdb.TMDBService
import com.yogesh.streamer.ui.components.HeroBanner
import com.yogesh.streamer.ui.components.MediaRow
import com.yogesh.streamer.ui.components.SectionHeader
import com.yogesh.streamer.ui.theme.BgDark
import com.yogesh.streamer.ui.theme.GoldPrimary
import kotlinx.coroutines.async

@Composable
fun HomeScreen(
    onMediaClick: (MediaItem) -> Unit,
    onPlayClick: (MediaItem) -> Unit
) {
    var heroItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var gujaratiItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var bollywoodItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var southItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var hollywoodItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        val heroDeferred = async { TMDBService.getHeroBannerItems() }
        val gujaratiDeferred = async { TMDBService.getGujaratiCinema() }
        val bollywoodDeferred = async { TMDBService.getBollywoodHits() }
        val southDeferred = async { TMDBService.getSouthHindiDubbed() }
        val hollywoodDeferred = async { TMDBService.getHollywood4K() }

        heroItems = heroDeferred.await()
        gujaratiItems = gujaratiDeferred.await()
        bollywoodItems = bollywoodDeferred.await()
        southItems = southDeferred.await()
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
                // Dynamic Hero Carousel
                if (heroItems.isNotEmpty()) {
                    item {
                        HeroBanner(
                            items = heroItems,
                            onPlayClick = onPlayClick,
                            onInfoClick = onMediaClick
                        )
                    }
                }

                // Gujarati Cinema Row
                if (gujaratiItems.isNotEmpty()) {
                    item {
                        SectionHeader(title = "Gujarati Blockbusters", subtitle = "Pure Regional Cinema")
                        MediaRow(
                            items = gujaratiItems,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // Bollywood Blockbusters Row
                if (bollywoodItems.isNotEmpty()) {
                    item {
                        SectionHeader(title = "Bollywood Blockbusters", subtitle = "Latest Hindi Releases")
                        MediaRow(
                            items = bollywoodItems,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // South Hindi Dubbed Row
                if (southItems.isNotEmpty()) {
                    item {
                        SectionHeader(title = "South Hindi Dubbed", subtitle = "Action Epics & Thrillers")
                        MediaRow(
                            items = southItems,
                            onItemClick = onMediaClick
                        )
                    }
                }

                // Hollywood 4K Blockbusters Row
                if (hollywoodItems.isNotEmpty()) {
                    item {
                        SectionHeader(title = "Hollywood 4K Ultra HD", subtitle = "Worldwide Trending Hits")
                        MediaRow(
                            items = hollywoodItems,
                            onItemClick = onMediaClick
                        )
                    }
                }
            }
        }
    }
}
