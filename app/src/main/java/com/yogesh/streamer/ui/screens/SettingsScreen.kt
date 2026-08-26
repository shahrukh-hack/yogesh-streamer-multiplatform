package com.yogesh.streamer.ui.screens

import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.yogesh.streamer.R
import com.yogesh.streamer.core.audio.StartupAudioManager
import com.yogesh.streamer.core.updater.AppUpdater
import com.yogesh.streamer.core.updater.OTAScraperUpdater
import com.yogesh.streamer.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen() {
    val context = LocalContext.current
    var isAudioEnabled by remember { mutableStateOf(StartupAudioManager.isAudioEnabled(context)) }
    var isCheckingUpdates by remember { mutableStateOf(false) }
    var updateStatusText by remember { mutableStateOf("Current Version: v1.0.0 (Latest)") }
    val scope = rememberCoroutineScope()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(BgDark)
            .padding(16.dp),
        contentPadding = PaddingValues(bottom = 80.dp)
    ) {
        // App Identity Header
        item {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.splash_logo),
                    contentDescription = "Logo",
                    modifier = Modifier.size(72.dp)
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "YOGESH STREAMER",
                    color = GoldPrimary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "v1.0.0 Multi-Platform Edition",
                    color = CyanAccent,
                    fontSize = 12.sp
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ??? Spiritual Sound Setting
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCard)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.MusicNote, contentDescription = "Audio", tint = GoldPrimary)
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Om Namah Shivaya Startup Audio", color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("Play sacred chant on app launch", color = TextMuted, fontSize = 11.sp)
                        }
                    }
                    Switch(
                        checked = isAudioEnabled,
                        onCheckedChange = {
                            isAudioEnabled = it
                            StartupAudioManager.setAudioEnabled(context, it)
                        },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = BgDark,
                            checkedTrackColor = GoldPrimary
                        )
                    )
                }
            }
        }

        // ?? Over-The-Air Scraper Sync
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCard)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Refresh, contentDescription = "OTA Scrapers", tint = CyanAccent)
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Over-The-Air Scraper Sync", color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("Sync Cricify, Sktech & CastleTV rules", color = TextMuted, fontSize = 11.sp)
                        }
                    }
                    Button(
                        onClick = {
                            OTAScraperUpdater.syncScrapersAsync(context)
                            Toast.makeText(context, "Scrapers synced successfully!", Toast.LENGTH_SHORT).show()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = SurfaceVariant, contentColor = CyanAccent)
                    ) {
                        Text("Sync Now", fontSize = 11.sp)
                    }
                }
            }
        }

        // ?? In-App Binary Auto-Updater
        item {
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceCard)
            ) {
                Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.SystemUpdate, contentDescription = "Update", tint = GoldPrimary)
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text("Check For In-App Updates", color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                Text(updateStatusText, color = TextMuted, fontSize = 11.sp)
                            }
                        }
                        Button(
                            onClick = {
                                isCheckingUpdates = true
                                scope.launch {
                                    val updateInfo = AppUpdater.checkForUpdate()
                                    isCheckingUpdates = false
                                    if (updateInfo.hasUpdate) {
                                        updateStatusText = "Update available: v"
                                        Toast.makeText(context, "Downloading update...", Toast.LENGTH_LONG).show()
                                        AppUpdater.downloadAndInstallApk(context, updateInfo.downloadUrl) {}
                                    } else {
                                        updateStatusText = "You are on latest v1.0.0"
                                        Toast.makeText(context, "Already on latest version!", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = GoldPrimary, contentColor = BgDark)
                        ) {
                            if (isCheckingUpdates) {
                                CircularProgressIndicator(color = BgDark, modifier = Modifier.size(16.dp))
                            } else {
                                Text("Check", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }
}
