package com.yogesh.streamer.core.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.util.Log
import com.yogesh.streamer.R

object StartupAudioManager {
    private const val TAG = "StartupAudioManager"
    private const val PREF_AUDIO_ENABLED = "pref_om_namah_shivaya_enabled"

    fun isAudioEnabled(context: Context): Boolean {
        val prefs = context.getSharedPreferences("yogesh_prefs", Context.MODE_PRIVATE)
        return prefs.getBoolean(PREF_AUDIO_ENABLED, true)
    }

    fun setAudioEnabled(context: Context, enabled: Boolean) {
        val prefs = context.getSharedPreferences("yogesh_prefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean(PREF_AUDIO_ENABLED, enabled).apply()
    }

    fun playStartupAudio(context: Context) {
        if (!isAudioEnabled(context)) return

        try {
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            audioManager?.setStreamVolume(
                AudioManager.STREAM_MUSIC,
                audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC) * 8 / 10,
                0
            )

            val mediaPlayer = MediaPlayer.create(context, R.raw.om_namah_shivaya) ?: return
            mediaPlayer.setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build()
            )
            mediaPlayer.setVolume(1.0f, 1.0f)
            mediaPlayer.setOnCompletionListener {
                try {
                    it.release()
                } catch (e: Exception) {
                    Log.e(TAG, "Error releasing media player", e)
                }
            }
            mediaPlayer.start()
            Log.i(TAG, "Sacred Om Namah Shivaya startup audio started with volume boost")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play startup audio", e)
        }
    }
}
