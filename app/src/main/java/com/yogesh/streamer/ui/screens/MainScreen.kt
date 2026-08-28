package com.yogesh.streamer.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SportsCricket
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.yogesh.streamer.core.scrapers.MediaItem
import com.yogesh.streamer.core.tv.TvNavigationHelper
import com.yogesh.streamer.ui.theme.*

enum class NavDestination(val title: String, val icon: ImageVector) {
    HOME("Home", Icons.Default.Home),
    LIVE_TV("Live TV", Icons.Default.Tv),
    SPORTS("Sports", Icons.Default.SportsCricket),
    SEARCH("Search", Icons.Default.Search),
    SETTINGS("Settings", Icons.Default.Settings)
}

@Composable
fun MainScreen() {
    val context = LocalContext.current
    val isTv = remember { TvNavigationHelper.isTelevision(context) }

    var currentTab by remember { mutableStateOf(NavDestination.HOME) }
    var selectedMediaItem by remember { mutableStateOf<MediaItem?>(null) }
    var activePlaybackUrl by remember { mutableStateOf<String?>(null) }
    var activePlaybackTitle by remember { mutableStateOf("") }

    // Hierarchical BackHandler Navigation Hierarchy
    if (activePlaybackUrl != null) {
        BackHandler {
            activePlaybackUrl = null
        }
        PlayerScreen(
            videoUrl = activePlaybackUrl!!,
            title = activePlaybackTitle,
            onBack = { activePlaybackUrl = null }
        )
    } else if (selectedMediaItem != null) {
        BackHandler {
            selectedMediaItem = null
        }
        DetailsScreen(
            item = selectedMediaItem!!,
            onBackClick = { selectedMediaItem = null },
            onPlayServer = { url: String, title: String ->
                activePlaybackUrl = url
                activePlaybackTitle = title
            }
        )
    } else {
        if (currentTab != NavDestination.HOME) {
            BackHandler {
                currentTab = NavDestination.HOME
            }
        }

        Scaffold(
            bottomBar = {
                if (!isTv) {
                    NavigationBar(
                        containerColor = SurfaceDark,
                        contentColor = TextPrimary,
                        tonalElevation = 8.dp
                    ) {
                        NavDestination.values().forEach { dest ->
                            NavigationBarItem(
                                selected = currentTab == dest,
                                onClick = { currentTab = dest },
                                icon = { Icon(dest.icon, contentDescription = dest.title) },
                                label = { Text(dest.title) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = GoldPrimary,
                                    selectedTextColor = GoldPrimary,
                                    unselectedIconColor = TextMuted,
                                    unselectedTextColor = TextMuted,
                                    indicatorColor = SurfaceVariant
                                )
                            )
                        }
                    }
                }
            }
        ) { paddingValues ->
            Row(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
                if (isTv) {
                    NavigationRail(
                        containerColor = SurfaceDark,
                        contentColor = TextPrimary
                    ) {
                        NavDestination.values().forEach { dest ->
                            NavigationRailItem(
                                selected = currentTab == dest,
                                onClick = { currentTab = dest },
                                icon = { Icon(dest.icon, contentDescription = dest.title) },
                                label = { Text(dest.title) },
                                colors = NavigationRailItemDefaults.colors(
                                    selectedIconColor = GoldPrimary,
                                    selectedTextColor = GoldPrimary,
                                    unselectedIconColor = TextMuted,
                                    unselectedTextColor = TextMuted,
                                    indicatorColor = SurfaceVariant
                                )
                            )
                        }
                    }
                }

                Box(modifier = Modifier.weight(1f)) {
                    when (currentTab) {
                        NavDestination.HOME -> HomeScreen(
                            onMediaClick = { selectedMediaItem = it },
                            onPlayClick = { selectedMediaItem = it }
                        )
                        NavDestination.LIVE_TV -> LiveTvScreen(
                            onPlayChannel = { url: String, name: String ->
                                activePlaybackUrl = url
                                activePlaybackTitle = name
                            }
                        )
                        NavDestination.SPORTS -> LiveCricketScreen(
                            onPlayLiveServer = { url: String, title: String ->
                                activePlaybackUrl = url
                                activePlaybackTitle = title
                            }
                        )
                        NavDestination.SEARCH -> SearchScreen(
                            onMediaClick = { selectedMediaItem = it }
                        )
                        NavDestination.SETTINGS -> SettingsScreen()
                    }
                }
            }
        }
    }
}
