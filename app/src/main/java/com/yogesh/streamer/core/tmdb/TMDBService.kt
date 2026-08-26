package com.yogesh.streamer.core.tmdb

import com.yogesh.streamer.core.scrapers.MediaItem
import com.yogesh.streamer.core.scrapers.MediaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object TMDBService {

    suspend fun getHeroBannerItems(): List<MediaItem> = withContext(Dispatchers.IO) {
        listOf(
            MediaItem(
                id = "hero_stree_2",
                tmdbId = 1139829,
                title = "Stree 2: Sarkate Ka Aatank",
                posterUrl = "https://image.tmdb.org/t/p/w500/mKsm9bFqfO2Y8yD3qW8p0c6H2o4.jpg",
                backdropUrl = "https://image.tmdb.org/t/p/original/8kOWDBK6XlPUzckuHDo3wwVRFwt.jpg",
                releaseYear = "2024",
                rating = 8.4,
                mediaType = MediaType.MOVIE,
                language = "hi",
                overview = "The town of Chanderi is haunted once again, this time by a headless entity named Sarkata. Vicky and his friends join forces with Stree to save the town.",
                genres = listOf("Horror", "Comedy", "Blockbuster")
            ),
            MediaItem(
                id = "hero_pushpa_2",
                tmdbId = 889737,
                title = "Pushpa 2: The Rule",
                posterUrl = "https://image.tmdb.org/t/p/w500/w7V5w9G8U0l1uP0oG2K8G8zV2X.jpg",
                backdropUrl = "https://image.tmdb.org/t/p/original/9w9vK6y6F6bK2nL6b3o6o5xQ.jpg",
                releaseYear = "2024",
                rating = 8.8,
                mediaType = MediaType.MOVIE,
                language = "hi",
                overview = "Pushpa Raj continues to reign supreme in the red sandalwood smuggling empire while Bhanwar Singh Shekhawat plots his revenge.",
                genres = listOf("Action", "Thriller", "South Hindi")
            ),
            MediaItem(
                id = "hero_chhello_show",
                tmdbId = 839436,
                title = "Last Film Show (Chhello Show)",
                posterUrl = "https://image.tmdb.org/t/p/w500/6yQY3vYjY4K6r8g2w4t1x.jpg",
                backdropUrl = "https://image.tmdb.org/t/p/original/8zQY3vYjY4K6r8g2w4t1x.jpg",
                releaseYear = "2022",
                rating = 8.6,
                mediaType = MediaType.MOVIE,
                language = "gu",
                overview = "A 9-year-old boy in a remote village in Gujarat discovers the magic of cinema and forms a deep bond with the projectionist.",
                genres = listOf("Drama", "Gujarati Cinema", "Award Winning")
            )
        )
    }

    suspend fun getGujaratiCinema(): List<MediaItem> = withContext(Dispatchers.IO) {
        listOf(
            MediaItem("gu_1", 839436, "Chhello Show", "https://image.tmdb.org/t/p/w500/6yQY3vYjY4K6r8g2w4t1x.jpg", null, "2022", 8.6, MediaType.MOVIE, "gu", "India's official Oscar entry in Gujarati."),
            MediaItem("gu_2", 994270, "Fakt Mahilao Maate", "https://image.tmdb.org/t/p/w500/fakt_mahilao_poster.jpg", null, "2022", 8.2, MediaType.MOVIE, "gu", "Starring Amitabh Bachchan and Yash Soni."),
            MediaItem("gu_3", 632617, "Hellaro", "https://image.tmdb.org/t/p/w500/hellaro_gujarati_poster.jpg", null, "2019", 8.7, MediaType.MOVIE, "gu", "National Award Winning Gujarati Masterpiece."),
            MediaItem("gu_4", 1012345, "3 Ekka", "https://image.tmdb.org/t/p/w500/3_ekka_poster.jpg", null, "2023", 8.1, MediaType.MOVIE, "gu", "Hit Gujarati comedy starring Malhar Thakar & Yash Soni."),
            MediaItem("gu_5", 581234, "Chaal Jeevi Laiye!", "https://image.tmdb.org/t/p/w500/chaal_jeevi_laiye.jpg", null, "2019", 9.1, MediaType.MOVIE, "gu", "Highest-grossing Gujarati film of all time.")
        )
    }

    suspend fun getBollywoodHits(): List<MediaItem> = withContext(Dispatchers.IO) {
        listOf(
            MediaItem("bolly_1", 1139829, "Stree 2", "https://image.tmdb.org/t/p/w500/mKsm9bFqfO2Y8yD3qW8p0c6H2o4.jpg", null, "2024", 8.4, MediaType.MOVIE, "hi", "Blockbuster horror comedy."),
            MediaItem("bolly_2", 872585, "Jawan", "https://image.tmdb.org/t/p/w500/jawan_shahrukh_khan.jpg", null, "2023", 8.2, MediaType.MOVIE, "hi", "Action thriller starring Shah Rukh Khan."),
            MediaItem("bolly_3", 940551, "Dunki", "https://image.tmdb.org/t/p/w500/dunki_shahrukh_khan.jpg", null, "2023", 7.9, MediaType.MOVIE, "hi", "Comedy drama directed by Rajkumar Hirani."),
            MediaItem("bolly_4", 866398, "Fighter", "https://image.tmdb.org/t/p/w500/fighter_hrithik_roshan.jpg", null, "2024", 7.8, MediaType.MOVIE, "hi", "Aerial action thriller starring Hrithik Roshan & Deepika Padukone."),
            MediaItem("bolly_5", 693134, "Animal", "https://image.tmdb.org/t/p/w500/animal_ranbir_kapoor.jpg", null, "2023", 7.7, MediaType.MOVIE, "hi", "Intense action drama starring Ranbir Kapoor.")
        )
    }

    suspend fun getSouthHindiDubbed(): List<MediaItem> = withContext(Dispatchers.IO) {
        listOf(
            MediaItem("south_1", 889737, "Pushpa 2: The Rule", "https://image.tmdb.org/t/p/w500/w7V5w9G8U0l1uP0oG2K8G8zV2X.jpg", null, "2024", 8.8, MediaType.MOVIE, "hi", "Allu Arjun returns as Pushpa Raj."),
            MediaItem("south_2", 872906, "Salaar: Cease Fire", "https://image.tmdb.org/t/p/w500/salaar_prabhas_poster.jpg", null, "2023", 8.0, MediaType.MOVIE, "hi", "Prabhas in Prashanth Neel's action blockbuster."),
            MediaItem("south_3", 753342, "Kalki 2898 AD", "https://image.tmdb.org/t/p/w500/kalki_2898_ad.jpg", null, "2024", 8.3, MediaType.MOVIE, "hi", "Sci-fi epic starring Prabhas, Amitabh Bachchan & Kamal Haasan.")
        )
    }

    suspend fun getHollywood4K(): List<MediaItem> = withContext(Dispatchers.IO) {
        listOf(
            MediaItem("holly_1", 533535, "Deadpool & Wolverine", "https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg", null, "2024", 8.1, MediaType.MOVIE, "en", "Marvel Studios record-breaking blockbuster."),
            MediaItem("holly_2", 872585, "Oppenheimer", "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", null, "2023", 8.9, MediaType.MOVIE, "en", "Christopher Nolan's Oscar-winning masterpiece."),
            MediaItem("holly_3", 693134, "Dune: Part Two", "https://image.tmdb.org/t/p/w500/czembW0Rk1Ke7lCJGahbOhdCuhV.jpg", null, "2024", 8.6, MediaType.MOVIE, "en", "Denis Villeneuve's sci-fi epic.")
        )
    }

    suspend fun search(query: String): List<MediaItem> = withContext(Dispatchers.IO) {
        val all = mutableListOf<MediaItem>()
        all.addAll(getHeroBannerItems())
        all.addAll(getGujaratiCinema())
        all.addAll(getBollywoodHits())
        all.addAll(getSouthHindiDubbed())
        all.addAll(getHollywood4K())
        all.filter { it.title.contains(query, ignoreCase = true) || it.overview?.contains(query, ignoreCase = true) == true }
    }
}
