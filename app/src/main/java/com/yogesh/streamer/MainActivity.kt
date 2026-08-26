package com.yogesh.streamer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.yogesh.streamer.core.audio.StartupAudioManager
import com.yogesh.streamer.ui.screens.MainScreen
import com.yogesh.streamer.ui.theme.BgDark
import com.yogesh.streamer.ui.theme.YogeshStreamerTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Guaranteed Om Namah Shivaya intro audio playback
        StartupAudioManager.playStartupAudio(this)

        setContent {
            YogeshStreamerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = BgDark
                ) {
                    MainScreen()
                }
            }
        }
    }
}
