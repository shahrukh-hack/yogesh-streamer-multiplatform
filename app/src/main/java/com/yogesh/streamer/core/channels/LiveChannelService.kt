package com.yogesh.streamer.core.channels

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object LiveChannelService {

    suspend fun getChannels(category: ChannelCategory = ChannelCategory.ALL): List<LiveChannel> = withContext(Dispatchers.IO) {
        val allChannels = listOf(
            // 🎭 GUJARATI REGIONAL
            LiveChannel(
                id = "dd_girnar",
                name = "DD Girnar (Gujarati)",
                category = ChannelCategory.GUJARATI,
                streamUrl = "https://d2lk5u59tns74c.cloudfront.net/out/v1/558fdb9aebb54bb5bbbf0ced03686148/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Doordarshan_Logo.svg/512px-Doordarshan_Logo.svg.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "abp_asmita",
                name = "ABP Asmita Gujarati",
                category = ChannelCategory.GUJARATI,
                streamUrl = "https://abp-i.akamaized.net/hls/live/765530/abpgujarati/master.m3u8",
                logoUrl = "https://images.livemint.com/img/2020/09/01/600x338/ABP_Asmita_1598952479262_1598952491176.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "sandesh_news",
                name = "Sandesh News Gujarati",
                category = ChannelCategory.GUJARATI,
                streamUrl = "https://mumt03.tangotv.in/Dsly5z3HSANDESHNEWS/index.m3u8",
                logoUrl = "https://sandesh.com/assets/images/sandesh-logo.png",
                quality = "720p HD"
            ),
            LiveChannel(
                id = "vtv_gujarati",
                name = "VTV Gujarati News",
                category = ChannelCategory.GUJARATI,
                streamUrl = "https://mumt03.tangotv.in/Dsly5z3HVTVNEWS/index.m3u8",
                logoUrl = "https://vtvgujarati.com/assets/images/vtv-logo.png",
                quality = "720p HD"
            ),
            LiveChannel(
                id = "tv9_gujarati",
                name = "TV9 Gujarati",
                category = ChannelCategory.GUJARATI,
                streamUrl = "https://mumt01.tangotv.in/O5aw8Zn3TV9GUJARATI/index.m3u8",
                logoUrl = "https://tv9gujarati.com/wp-content/uploads/2021/04/tv9-gujarati-logo.png",
                quality = "1080p HD"
            ),

            // 🎬 MOVIE CHANNELS
            LiveChannel(
                id = "b4u_movies",
                name = "B4U Movies (Bollywood)",
                category = ChannelCategory.MOVIES,
                streamUrl = "https://mumt03.tangotv.in/Dsly5z3HB4UMOVIES/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/f/f0/B4U_Movies_logo.svg/330px-B4U_Movies_logo.svg.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "goldmines_movies",
                name = "Goldmines Movies (South Hindi)",
                category = ChannelCategory.MOVIES,
                streamUrl = "https://mumt01.tangotv.in/O5aw8Zn3GOLDMINES/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/2/23/Goldmines_Telefilms_logo.png/220px-Goldmines_Telefilms_logo.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "manoranjan_movies",
                name = "Manoranjan Movies",
                category = ChannelCategory.MOVIES,
                streamUrl = "https://mumt03.tangotv.in/Dsly5z3HMANORANJANMOVIES/index.m3u8",
                logoUrl = "https://manoranjangroup.co.in/images/movies.png",
                quality = "720p HD"
            ),
            LiveChannel(
                id = "maha_movie",
                name = "Maha Movie Hindi",
                category = ChannelCategory.MOVIES,
                streamUrl = "https://mumt01.tangotv.in/O5aw8Zn3MAHAMOVIE/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Maha_Movie.png/220px-Maha_Movie.png",
                quality = "720p HD"
            ),

            // 🏛️ ENTERTAINMENT & NATIONAL
            LiveChannel(
                id = "dd_national",
                name = "DD National HD",
                category = ChannelCategory.ENTERTAINMENT,
                streamUrl = "https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/7ff57cc9046b4c188b51a0d506f36e7f/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Doordarshan_Logo.svg/512px-Doordarshan_Logo.svg.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "dd_bharati",
                name = "DD Bharati (Culture & Arts)",
                category = ChannelCategory.ENTERTAINMENT,
                streamUrl = "https://d2lk5u59tns74c.cloudfront.net/out/v1/67cec794d8b14f9ba21f73924ac65797/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Doordarshan_Logo.svg/512px-Doordarshan_Logo.svg.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "dd_india",
                name = "DD India Global HD",
                category = ChannelCategory.ENTERTAINMENT,
                streamUrl = "https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/ceda14583477426aa162a65392d8ea07/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Doordarshan_Logo.svg/512px-Doordarshan_Logo.svg.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "dangal_tv",
                name = "Dangal TV",
                category = ChannelCategory.ENTERTAINMENT,
                streamUrl = "https://mumt03.tangotv.in/Dsly5z3HDANGAL/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Dangal_TV_Logo.png/250px-Dangal_TV_Logo.png",
                quality = "1080p HD"
            ),

            // 📰 NEWS 24/7
            LiveChannel(
                id = "aaj_tak",
                name = "Aaj Tak News HD",
                category = ChannelCategory.NEWS,
                streamUrl = "https://feeds.intoday.in/aajtak/api/aajtak-hd/master.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Aaj_tak_logo.png/300px-Aaj_tak_logo.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "ndtv_india",
                name = "NDTV India",
                category = ChannelCategory.NEWS,
                streamUrl = "https://ndtvindiaelemarchana.akamaized.net/hls/live/2003679-b/ndtvindia/livefeed/master.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/NDTV_India_logo.svg/330px-NDTV_India_logo.svg.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "india_tv",
                name = "India TV News",
                category = ChannelCategory.NEWS,
                streamUrl = "https://mumt03.tangotv.in/Dsly5z3HINDIATV/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/India_TV_logo.svg/330px-India_TV_logo.svg.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "republic_bharat",
                name = "Republic Bharat",
                category = ChannelCategory.NEWS,
                streamUrl = "https://mumt01.tangotv.in/O5aw8Zn3REPUBLICBHARAT/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/0/07/Republic_Bharat_Logo.png/220px-Republic_Bharat_Logo.png",
                quality = "1080p HD"
            ),

            // 🎶 MUSIC HITS
            LiveChannel(
                id = "9x_jalwa",
                name = "9X Jalwa (Retro & Hits)",
                category = ChannelCategory.MUSIC,
                streamUrl = "https://b.jsrdn.com/strm/channels/9xjalwa/master.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/9/90/9X_Jalwa_logo.jpg/220px-9X_Jalwa_logo.jpg",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "9x_jhakaas",
                name = "9X Jhakaas",
                category = ChannelCategory.MUSIC,
                streamUrl = "https://amg01281-9xmediapvtltd-9xjhakaas-samsungin-ci2cs.amagi.tv/playlist/amg01281-9xmediapvtltd-9xjhakaas-samsungin/playlist.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/8/87/9X_Jhakaas_logo.jpg/220px-9X_Jhakaas_logo.jpg",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "9x_tashan",
                name = "9X Tashan (Punjabi & Hindi)",
                category = ChannelCategory.MUSIC,
                streamUrl = "https://amg01281-9xmediapvtltd-9xtashan-samsungin-xz1sd.amagi.tv/playlist/amg01281-9xmediapvtltd-9xtashan-samsungin/playlist.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/9X_Tashan_logo.jpg/220px-9X_Tashan_logo.jpg",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "b4u_music",
                name = "B4U Music Hits",
                category = ChannelCategory.MUSIC,
                streamUrl = "https://mumt03.tangotv.in/Dsly5z3HB4UMUSIC/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/1/11/B4U_Music_logo.svg/330px-B4U_Music_logo.svg.png",
                quality = "1080p HD"
            ),

            // 🕉️ SPIRITUAL & BHAKTI
            LiveChannel(
                id = "aastha_bhajan",
                name = "Aastha Bhajan (Bhakti)",
                category = ChannelCategory.DEVOTIONAL,
                streamUrl = "https://mumt01.tangotv.in/O5aw8Zn3AASTHABHAJAN/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Aastha_Logo.png/220px-Aastha_Logo.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "sanskar_tv",
                name = "Sanskar TV (Shri Krishna / Shiva)",
                category = ChannelCategory.DEVOTIONAL,
                streamUrl = "https://mumt03.tangotv.in/Dsly5z3HSANSKARTV/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/7/7b/Sanskar_TV_logo.png/220px-Sanskar_TV_logo.png",
                quality = "1080p HD"
            ),

            // 🏏 SPORTS CHANNELS
            LiveChannel(
                id = "star_sports_hindi",
                name = "Star Sports 1 Hindi HD",
                category = ChannelCategory.SPORTS,
                streamUrl = "https://cricify.live/stream/star1hindi/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Star_Sports_1_Hindi_logo.png/300px-Star_Sports_1_Hindi_logo.png",
                quality = "1080p Ultra HD"
            ),
            LiveChannel(
                id = "willow_cricket",
                name = "Willow Cricket HD (Global)",
                category = ChannelCategory.SPORTS,
                streamUrl = "https://willow.live/stream/willowhd/playlist.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/0/00/Willow_Cricket_logo.png/250px-Willow_Cricket_logo.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "astro_cricket",
                name = "Astro Cricket HD (60fps)",
                category = ChannelCategory.SPORTS,
                streamUrl = "https://cricify.live/stream/astro/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/en/thumb/8/87/Astro_Cricket_logo.png/220px-Astro_Cricket_logo.png",
                quality = "1080p 60fps"
            ),
            LiveChannel(
                id = "sony_ten_3",
                name = "Sony Sports Ten 3 Hindi HD",
                category = ChannelCategory.SPORTS,
                streamUrl = "https://cricify.live/stream/sonyten3/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Sony_Sports_Ten_3_logo.png/250px-Sony_Sports_Ten_3_logo.png",
                quality = "1080p HD"
            ),
            LiveChannel(
                id = "dd_sports",
                name = "DD Sports HD (National)",
                category = ChannelCategory.SPORTS,
                streamUrl = "https://d2lk5u59tns74c.cloudfront.net/out/v1/380b0765f87741a4812bc952ec6fbf21/index.m3u8",
                logoUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Doordarshan_Logo.svg/512px-Doordarshan_Logo.svg.png",
                quality = "1080p HD"
            )
        )

        if (category == ChannelCategory.ALL) {
            allChannels
        } else {
            allChannels.filter { it.category == category }
        }
    }
}
