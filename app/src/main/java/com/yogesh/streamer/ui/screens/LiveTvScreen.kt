package com.yogesh.streamer.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.yogesh.streamer.core.channels.ChannelCategory
import com.yogesh.streamer.core.channels.LiveChannel
import com.yogesh.streamer.core.channels.LiveChannelService
import com.yogesh.streamer.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun LiveTvScreen(
    onPlayChannel: (String, String) -> Unit
) {
    var selectedCategory by remember { mutableStateOf(ChannelCategory.ALL) }
    var channels by remember { mutableStateOf<List<LiveChannel>>(emptyList()) }
    var searchQuery by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(selectedCategory) {
        isLoading = true
        channels = LiveChannelService.getChannels(selectedCategory)
        isLoading = false
    }

    val filteredChannels = remember(channels, searchQuery) {
        if (searchQuery.isBlank()) {
            channels
        } else {
            channels.filter { it.name.contains(searchQuery, ignoreCase = true) }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Live Indian TV Channels",
                    color = GoldPrimary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "100% Verified Working HLS Streams",
                    color = CyanAccent,
                    fontSize = 11.sp
                )
            }
            Surface(
                color = LiveRed,
                shape = RoundedCornerShape(12.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(modifier = Modifier.size(6.dp).clip(RoundedCornerShape(3.dp)).background(Color.White))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("LIVE", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Search Bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Search Indian TV Channels (Gujarati, News, Movies...)", color = TextMuted, fontSize = 12.sp) },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search", tint = GoldPrimary) },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = GoldPrimary,
                unfocusedBorderColor = SurfaceVariant,
                focusedContainerColor = SurfaceCard,
                unfocusedContainerColor = SurfaceCard,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary
            ),
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Category Filter Chips
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(ChannelCategory.values()) { cat ->
                val isSelected = selectedCategory == cat
                Surface(
                    color = if (isSelected) GoldPrimary else SurfaceVariant,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.clickable {
                        selectedCategory = cat
                    }
                ) {
                    Text(
                        text = cat.displayName,
                        color = if (isSelected) BgDark else TextPrimary,
                        fontSize = 11.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = GoldPrimary)
            }
        } else if (filteredChannels.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No channels found", color = TextMuted)
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 150.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(bottom = 80.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(filteredChannels) { channel ->
                    ChannelCard(
                        channel = channel,
                        onClick = { onPlayChannel(channel.streamUrl, channel.name) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ChannelCard(
    channel: LiveChannel,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceCard)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.White.copy(alpha = 0.05f))
                    .border(1.dp, SurfaceVariant, RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center
            ) {
                AsyncImage(
                    model = channel.logoUrl,
                    contentDescription = channel.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(56.dp)
                )

                // Quality Badge
                Surface(
                    color = Color.Black.copy(alpha = 0.75f),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.align(Alignment.TopEnd).padding(4.dp)
                ) {
                    Text(
                        text = channel.quality,
                        color = GoldPrimary,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = channel.name,
                color = TextPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Text(
                text = channel.category.displayName,
                color = CyanAccent,
                fontSize = 10.sp,
                maxLines = 1
            )

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = onClick,
                modifier = Modifier.fillMaxWidth().height(32.dp),
                colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary, contentColor = BgDark),
                shape = RoundedCornerShape(6.dp),
                contentPadding = PaddingValues(0.dp)
            ) {
                Icon(Icons.Default.PlayArrow, contentDescription = "Watch", modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Watch Live", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}
