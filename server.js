const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = process.env.PORT || 10000;
const UPSTREAM_RESOLVERS = (process.env.UPSTREAM_RESOLVERS || process.env.UPSTREAM_RESOLVER || 'https://cncverse.dpdns.org')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
const UPSTREAM_RESOLVER = UPSTREAM_RESOLVERS[0];
const PLUGINS_MANIFEST_URL = 'https://raw.githubusercontent.com/shahrukh-hack/yogesh-streamer-plugins/builds/plugins.json';
const SCRAPERS_MANIFEST_URL = 'https://raw.githubusercontent.com/shahrukh-hack/yogesh-streamer-plugins/builds/scrapers.json';
const BRAND_LOGO = 'https://raw.githubusercontent.com/shahrukh-hack/yogesh-streamer-plugins/builds/logo.jpg';
const APP_PIN = process.env.APP_PIN || '778899';
const ANDROID_APK_URL = 'https://github.com/shahrukh-hack/yogesh-streamer/releases/download/v5.6.1/YogeshStreamer-v5.6.1.apk';
const ANDROID_RELEASES_URL = 'https://github.com/shahrukh-hack/yogesh-streamer-multiplatform/releases';
const ANDROID_SHORT_URL = 'tinyurl.com/y-streamer-apk';

// In-memory manifest cache
let cachedManifest = null;
let lastManifestFetch = 0;
const MANIFEST_CACHE_TTL = 1800000; // 30 minutes

// In-memory stream resolution cache (5 minutes TTL for instant response)
const streamCache = new Map();
const cloudSyncStore = new Map(); // ☁️ In-Memory Cross-Device Progress & Watchlist Sync
const STREAM_CACHE_TTL = 300000; // 5 minutes
const MAX_CACHE_CAPACITY = 500; // Cap in-memory entries to eliminate OOM risks on Render free tier

function setStreamCache(key, val) {
    if (streamCache.size >= MAX_CACHE_CAPACITY) {
        const oldestKey = streamCache.keys().next().value;
        if (oldestKey !== undefined) streamCache.delete(oldestKey);
    }
    streamCache.set(key, val);
}

function setCloudSyncStore(key, val) {
    if (cloudSyncStore.size >= MAX_CACHE_CAPACITY) {
        const oldestKey = cloudSyncStore.keys().next().value;
        if (oldestKey !== undefined) cloudSyncStore.delete(oldestKey);
    }
    cloudSyncStore.set(key, val);
}


function getDecompressedStream(res) {
    const encoding = (res.headers['content-encoding'] || '').toLowerCase();
    if (encoding === 'gzip') {
        return res.pipe(zlib.createGunzip());
    } else if (encoding === 'deflate') {
        return res.pipe(zlib.createInflate());
    } else if (encoding === 'br' && zlib.createBrotliDecompress) {
        return res.pipe(zlib.createBrotliDecompress());
    }
    return res;
}

function fetchJson(targetUrl, extraHeaders = {}, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const parsed = url.parse(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate, br',
                ...extraHeaders
            },
            timeout: timeoutMs
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = res.headers.location.startsWith('http') ? res.headers.location : url.resolve(targetUrl, res.headers.location);
                return fetchJson(nextUrl, extraHeaders, timeoutMs).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Upstream returned HTTP ${res.statusCode}`));
            }
            const stream = getDecompressedStream(res);
            let body = '';
            stream.setEncoding('utf8');
            stream.on('data', chunk => body += chunk);
            stream.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : null);
                } catch (e) {
                    reject(new Error(`JSON parse error: ${e.message} (body length: ${body.length})`));
                }
            });
            stream.on('error', reject);
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

async function fetchJsonWithFailover(apiPath) {
    let lastError = null;
    const cleanPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
    for (const base of UPSTREAM_RESOLVERS) {
        try {
            const targetUrl = `${base}${cleanPath}`;
            const res = await fetchJson(targetUrl);
            if (res) return res;
        } catch (err) {
            lastError = err;
            console.warn(`Upstream resolver ${base} failed for ${cleanPath}: ${err.message}`);
        }
    }
    throw lastError || new Error(`All upstream resolvers failed for ${cleanPath}`);
}

function postData(targetUrl, postBody, extraHeaders = {}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const parsed = url.parse(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;
        const postDataStr = typeof postBody === 'string' ? postBody : Object.keys(postBody).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(postBody[k])}`).join('&');

        const req = client.request(targetUrl, {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Content-Length': Buffer.byteLength(postDataStr),
                'X-Requested-With': 'XMLHttpRequest',
                ...extraHeaders
            },
            timeout: timeoutMs
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : null);
                } catch(e) {
                    resolve(body);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postDataStr);
        req.end();
    });
}

function fetchHtml(targetUrl, extraHeaders = {}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        const parsed = url.parse(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                ...extraHeaders
            },
            timeout: timeoutMs
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = res.headers.location.startsWith('http') ? res.headers.location : url.resolve(targetUrl, res.headers.location);
                return fetchHtml(nextUrl, extraHeaders, timeoutMs).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} from ${targetUrl}`));
            }
            const stream = getDecompressedStream(res);
            let body = '';
            stream.setEncoding('utf8');
            stream.on('data', chunk => body += chunk);
            stream.on('end', () => resolve(body));
            stream.on('error', reject);
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Timeout fetching ${targetUrl}`));
        });
    });
}


// ========================================================
// ⚡ NATIVE IN-PROCESS SCRAPERS (REVERSE ENGINEERED FROM CS3)
// ========================================================

const NATIVE_LIVE_CHANNELS = [
    { id: 'native:tv:abp_asmita', name: 'ABP Asmita HD (Gujarati)', cat: 'GUJARATI', url: 'https://d2l4ar6y3mrs4k.cloudfront.net/live-streaming/asmita-livetv/master.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/ABP_Asmita.png', quality: '1080p HD' },
    { id: 'native:tv:tv9_gujarati', name: 'TV9 Gujarati HD', cat: 'GUJARATI', url: 'https://dyjmyiv3bp2ez.cloudfront.net/pub-iotv9guj3ki8lu/liveabr/playlist.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/Tv_9_Gujarat.png', quality: '720p HD' },
    { id: 'native:tv:news18_gujarati', name: 'News18 Gujarati HD', cat: 'GUJARATI', url: 'https://n18syndication.akamaized.net/bpk-tv/News18_Gujarati_NW18_MOB/output01/master.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/News18Gujarati.png', quality: '1080p HD' },
    { id: 'native:tv:vtv_gujarati', name: 'VTV News Gujarati', cat: 'GUJARATI', url: 'https://d1msejlow1t3l4.cloudfront.net/fta/vtvgujarati/playlist.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/VTV_Gujarati.png', quality: '576p HD' },
    { id: 'native:tv:zee24_kalak', name: 'Zee 24 Kalak (Gujarati)', cat: 'GUJARATI', url: 'https://vg-zeefta.akamaized.net/ptnr-yupptv/title-zee24kalak/v1/manifest/611d79b11b77e2f571934fd80ca1413453772ac7/497f7199-758d-495d-9d2f-a5489231c428/14b7c8ec-16da-47f2-8d7e-5bbaec67b3e2/3.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/Zee_24_Kalak.png', quality: '720p HD' },
    { id: 'native:tv:gs_tv', name: 'GS TV (Gujarat)', cat: 'GUJARATI', url: 'https://cdnplay.peanutsquare.com/560828843292539228453915.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/GS_TV.png', quality: '576p' },
    { id: 'native:tv:aastha_gujarati', name: 'Aastha Gujarati', cat: 'GUJARATI', url: 'https://aasthaott.akamaized.net/110923/smil:aasthagujrati.smil/playlist.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/Aastha.png', quality: '480p' },

    { id: 'native:tv:dd_sports', name: 'DD Sports 1 HD (Live Cricket)', cat: 'SPORTS', url: 'https://mumbai-edge.smartplaytv.in/DDSportsHD/index.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/DD_Sports.png', quality: '1080p 60fps' },
    { id: 'native:tv:willow_cricket', name: 'Willow Cricket HD (Live Matches)', cat: 'SPORTS', url: 'https://baila-lentoo.pages.dev/all-sp/809386.m3u8', logo: 'https://s21.q4cdn.com/819998841/files/doc_news/2024/May/Willow-logo-transparent-cb.png', quality: '1080p 60fps' },
    { id: 'native:tv:a_sports', name: 'A Sports HD (Live Sports)', cat: 'SPORTS', url: 'https://playztv-apps.pages.dev/a-sports/index.m3u8', logo: 'https://img.media.jio.com/tvpimages/96/65/302113_1749664252703_l_medium.jpg', quality: '1080p HD' },
    { id: 'native:tv:ptv_sports', name: 'PTV Sports HD (Live Cricket)', cat: 'SPORTS', url: 'https://playztv-apps.pages.dev/ptv-sports/index.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/Jio_Sports.png', quality: '720p HD' },

    { id: 'native:tv:aaj_tak', name: 'Aaj Tak HD', cat: 'NEWS', url: 'https://feeds.intoday.in/aajtak/api/aajtakhd/master.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/Aaj_Tak.png', quality: '1080p HD' },
    { id: 'native:tv:news18_india', name: 'News18 India HD', cat: 'NEWS', url: 'https://n18syndication.akamaized.net/bpk-tv/News18_India_NW18_MOB/output01/master.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/News18_India_NW18.png', quality: '1080p HD' },

    { id: 'native:tv:9x_jalwa', name: '9X Jalwa HD (Hindi Hits)', cat: 'MUSIC', url: 'https://wiselp.wiseplayout.com/9X_Jalwa/master.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/9XJalwa.png', quality: '1080p HD' },
    { id: 'native:tv:9x_jhakaas', name: '9X Jhakaas HD', cat: 'MUSIC', url: 'https://wiselp.wiseplayout.com/9X_Jhakaas/master.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/9X_Jhakaas.png', quality: '1080p HD' },
    { id: 'native:tv:7s_music', name: '7S Music HD', cat: 'MUSIC', url: 'https://cdn.pishow.tv/ott/live/1257/master.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/9XJalwa.png', quality: '576p' },

    { id: 'native:tv:aastha_hd', name: 'Aastha TV HD (Bhakti & Satsang)', cat: 'DEVOTIONAL', url: 'https://mumbai-edge.smartplaytv.in/Aastha/index.m3u8', logo: 'https://jiotv.catchup.cdn.jio.com/dare_images/images/Aastha.png', quality: '720p HD' }
];

async function getNativeLiveTVCatalog() {
    const list = NATIVE_LIVE_CHANNELS.map(c => ({
        id: c.id,
        name: c.name,
        type: 'tv',
        poster: c.logo || BRAND_LOGO,
        cat: c.cat,
        url: c.url,
        quality: c.quality
    }));
    try {
        const sports = await getNativeSportsCatalog();
        if (Array.isArray(sports)) {
            sports.forEach(s => {
                list.push({
                    id: s.id,
                    name: s.name,
                    type: 'tv',
                    poster: s.poster || BRAND_LOGO,
                    cat: 'SPORTS',
                    quality: 'Live Match'
                });
            });
        }
    } catch(e) {}
    return list;
}

function getNativeLiveTVStream(channelId) {
    const channel = NATIVE_LIVE_CHANNELS.find(c => c.id === channelId);
    if (!channel || !channel.url) return { streams: [] };
    return {
        streams: [{
            name: `⚡ [In-App Player] ${channel.name}`,
            title: `${channel.name} • Direct Verified Live Feed (${channel.quality || '1080p'})`,
            url: channel.url,
            behaviorHints: { notWebReady: false },
            isWebPlayable: true
        }]
    };
}


// 🦁 Native Gujarati Cinema & OTT Vault Catalog (136+ Blockbusters & Web Series)
const NATIVE_GUJARATI_CATALOG = [{"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2xhc3QtZmlsbS1zaG93LTIwMjEtd2ViLWRsLWhpbmRpLw==", "name": "Chhello Show (Last Film Show) (2021) WEB-DL [Gujarati / Hindi DD5.1] 1080p 720p & 480p", "type": "movie", "poster": "https://myimg.click/images/2022/11/25/Last-Film-Show-2021e4f0e666f67ba239.jpg", "imdbRating": "8.2", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2NoYWFsLWplZXZpLWxhaXllLTIwMTktZ3VqYXJhdGktd2VicmlwLWZ1bGwtbW92aWUv", "name": "Chaal Jeevi Laiye (2019) WEB-DL [Gujarati DD5.1] 1080p 720p & 480p | Full Movie", "type": "movie", "poster": "https://catimages.org/images/2025/01/27/Chaal-Jeevi-Laiye-2019-Gujrati-HDRip-Full-Movie-HDHub4u.Tv06549485b22ef850.jpg", "imdbRating": "8.4", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL3BhYXRraS0yMDI2LWhpbmRpLWd1amFyYXRpLXdlYnJpcC1mdWxsLW1vdmllLw==", "name": "Paatki (2026) WEB-DL [Hindi (DD5.1) & Gujarati] 1080p 720p & 480p Dual Audio [x264/HEVC] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/paKX1n7qw8VfoombF6HhjJAaIk8.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2phZ2F0LTIwMjQtd2VicmlwLWd1amFyYXRpLWZ1bGwtbW92aWUv", "name": "Jagat (2024) WEB-DL [Gujarati DD2.0] 4K 1080p 720p & 480p [x264] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w400/sBA2CjonkQYOoE54lbAVG0IGRWb.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL3NvbnUtdGFuZS1tYXJhLXBhci1iaGFyb3NvLW5haS1rZS0yMDIyLXdlYnJpcC1ndWphcmF0aS1mdWxsLW1vdmllLw==", "name": "Sonu Tane Mara Par Bharoso Nai Ke (2022) WEB-DL [Gujarati 5.1] 4K 1080p 720p & 480p [x264/HEVC] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w400/a7i5k8a25OfzPipw1aKqdISZ2cg.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2xhYWxvLWtyaXNobmEtc2FkYS1zYWhhYXlhdGUtMjAyNS1oaW5kaS13ZWJyaXAtZnVsbC1tb3ZpZS8=", "name": "Laalo: Krishna Sada Sahaayate (2025) DS4K WEB-DL [Hindi (DD5.1) & Gujarati] 4K 1080p 720p & 480p Dual Audio [x264/10Bit-HEVC] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/tViDPmnjZG7MHFssC2duXjOgxd4.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL3Zhc2gtbGV2ZWwtMi0yMDI1LWhpbmRpLXdlYnJpcC1mdWxsbC1tb3ZpZS8=", "name": "Vash Level 2 (2025) DS4K WEB-DL [Hindi (DD5.1) & Gujarati] 4K 1080p 720p & 480p Dual Audio [x264/10Bit-HEVC] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/4kFKAGcyEAMg6M5OegMLdTLcROn.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2poYW1rdWRpLTIwMjQtaGluZGktd2VicmlwLWZ1bGwtbW92aWUv", "name": "Jhamkudi (2024) DS4K WEB-DL [Hindi (2.0) & Gujarati] 4K 1080p 720p & 480p Dual Audio [x264/HEVC] | Full Movie", "type": "movie", "poster": "https://catimages.org/images/2025/09/18/Untitled.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2ppamEtc2FsYS1qaWphLTIwMjUtd2VicmlwLWhpbmRpLWZ1bGwtbW92aWUv", "name": "Jija Sala Jija (2025) WEB-DL [Hindi (DD2.0) & Gujarati] 1080p 720p & 480p [x264/HEVC] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w400/5qehtvUl1qKekFfTf2uBJy7wIGd.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL3Zhc2gtMjAyMy1ndWphcmF0aS13ZWJyaXAtZnVsbGwtbW92aWUv", "name": "Vash (2023) DS4K WEB-DL [Gujarati 2.0] 4K 1080p 720p & 480p [x264/HEVC] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/u7M4LAaFVcwLr3sLsuORHPncTup.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2FsbC10aGUtYmVzdC1wYW5keWEtMjAyNS1ndWphcmF0aS13ZWJyaXAtZnVsbC1tb3ZpZS8=", "name": "All the Best Pandya (2025) WEB-DL [Gujarati DD5.1] 4K 1080p 720p & 480p [x264/HEVC] | Full Movie", "type": "movie", "poster": "https://catimages.org/images/2025/06/19/All-the-Best-Pandya-2025-HDHub4u.Ms.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2hhaGFjYXItMjAyNC1ndWphcmF0aS13ZWJyaXAtZnVsbC1tb3ZpZS8=", "name": "Hahacar (2024) WEB-DL [Gujarati 2.0] 1080p 720p & 480p [x264/HEVC] | Full Movie", "type": "movie", "poster": "https://catimages.org/images/2025/03/15/Hahacar-2024-HDHub4u.Ms.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL3RyaXNoYS1vbi10aGUtcm9ja3MtMjAyNC1oaW5kaS13ZWJyaXAtZnVsbC1tb3ZpZS8=", "name": "Trisha on the Rocks (2024) WEB-DL [Hindi (ORG 5.1) & Gujarati] 1080p 720p & 480p Dual Audio [x264/HEVC] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w400/k3zltzxeK7JpGd3lYH4OwzACHyj.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2h1bi1pcWJhbC0yMDIzLWd1amFyYXRpLXdlYnJpcC1mdWxsLW1vdmllLw==", "name": "Hun Iqbal (2023) Gujarati WEB-DL 1080p 720p & 480p [x264/HEVC 10bit] DD2.0 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/5bYxTszrasq4NtLMtXQwVDhIZmN.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2xha2lyby0yMDIzLWd1amFyYXRpLXdlYnJpcC1mdWxsLW1vdmllLw==", "name": "Lakiro (2023) Gujarati WEB-DL 1080p 720p & 480p x264 DD2.0 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/soJ8hEtdVrRSanaeEAIej6vGeoz.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXR1LWR1bml5YS1jaGhlLW1hcmktMjAyNi1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Tu Duniya Chhe Mari (2026) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2.3GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/11/Tu-Duniya-Chhe-Mari.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJpY2hhcm8tYmFjaGVsb3ItMjAyNi1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Bicharo Bachelor (2026) Gujarati WEB-DL Full Movie 480p [400MB] | 720p [1.1GB] | 1080p [2.3GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/5hLNzaSKHzKfMolMShHWsGvXEVV.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWppbmRhZ2ktb25jZS1tb3JlLTIwMjYtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Jindagi Once More (2026) Gujarati Full Movie WEB-DL 480p [450MB] | 720p [1.1GB] | 1080p [2.6GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/qg2jvsZbN1UOMtK4czCHy4TQAiy.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWRoYWJrYWFyby0yMDI2LWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Dhabkaaro (2026) Gujarati WEB-DL Full Movie 480p [400MB] | 720p [1.2GB] | 1080p [2.6GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/mWgizqlIbPD8PBbhhJGlZSVSgwa.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXZhYW5raS1jaHVraS1sb3ZlLXN0b3J5LTIwMjYtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Vaanki Chuki Love Story (2026) Gujarati Full Movie WEB-DL 480p [500MB] | 720p [1.4GB] | 1080p [3GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/l9hUXnqODri1uDFjOPWUQpCc6Wk.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXByZW0tcHJha2FyYW4tMjAyMi1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Prem Prakaran (2022) WEB-DL {Gujarati DD2.0} Full Movie 480p [500MB] | 720p [1.3GB] | 1080p [2.9GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/jmxE1gtujmwospcEw99zwyxBGpN.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWRoYXJwYWthZC0yMDI2LWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Dharpakad (2026) WEB-DL {Gujarati DD2.0} Full Movie 480p [350MB] | 720p [1GB] | 1080p [2.1GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/abVIgGZxvSSCT5wW6KNssRWtNY5.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJlaHJ1cGl5by0yMDI2LWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Behrupiyo (2026) WEB-DL {Gujarati DD2.0} Full Movie 480p [480MB] | 720p [1.3GB] | 1080p [3GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/7KmndJmTbKFDqaOb73XDCGl8snc.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJlaGFkZC0yMDI2LWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Behadd (2026) WEB-DL {Gujarati DD2.0} Full Movie 480p [400MB] | 720p [1.1GB] | 1080p [2.5GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/nC20D4ghO8iZMHuhtzxinJ1hPcT.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWphaS1rYW5oYWl5YWxhbGwta2lpLTIwMjYtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Jai Kanhaiyalall Kii (2026) Gujarati Full Movie WEB-DL 480p [450MB] | 720p [1.3GB] | 1080p [2.7GB]", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/7nNvhnBVgI1XrER6jPiULFWK7da.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWxhdHRoYS1zYWRhbi0yMDI0LWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Lattha Sadan (2024) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2.3GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/04/Lattha-Sadan.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJoYWktbmktYmVuaS1sYWRraS0yMDI0LWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Bhai Ni Beni Ladki (2024) Gujarati Full Movie WEB-DL 480p [430MB] | 720p [1GB] | 1080p [2.4GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/04/FFFF.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWZhYXRpLW5lLTIwMjUtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Faati Ne? (2025) WEB-DL {Gujarati DD2.0} Full Movie 480p [500MB] | 720p [1.4GB] | 1080p [3.1GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/03/Faati-Ne.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXNldmEtYmhhdmktMjAyNS1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Seva Bhavi (2025) Gujarati Full Movie WEB-DL 480p [460MB] | 720p [1.2GB] | 1080p [2.7GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/03/Seva-Bhavi.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW5hYW5raGF0YWktMjAyNS1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Naankhatai (2025) Gujarati Full Movie WEB-DL 480p [500MB] | 720p [1.4GB] | 1080p [3.1GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/03/Naankhatai.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2FhemFhZC1zZWFzb24tMS1ndWphcmF0aS13ZWJyaXAtYWxsLWVwaXNvZGVzLw==", "name": "Aazaad (Season 1) Gujarati WEB-DL 720p & 480p x264 DD2.0 | Full Series", "type": "series", "poster": "https://image.tmdb.org/t/p/original/hNUkHWbguweR2SAmS8DI3NKTXlV.jpg", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL3ZpdHRoYWwtdGVlZGktc2Vhc29uLTEtZ3VqYXJhdGktd2VicmlwLWFsbC1lcGlzb2Rlcy8=", "name": "Vitthal Teedi: Chapter 1 (Season 1) Gujarati WEB-DL 1080p / 720p / 480p x264 HD [ALL Episodes] | OHO Series", "type": "series", "poster": "https://upload.wikimedia.org/wikipedia/en/6/69/Vitthal_Teedi.jpeg", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXdhcnNvLTIwMjQtc2Vhc29uLTEtY29tcGxldGUtZ3VqYXJhdGktd2ViLXNlcmllcy00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Warso (2024) Season 1 Complete Gujarati WEB Series 480p | 720p | 1080p WEB-DL", "type": "series", "poster": "https://rogmovies.asia/wp-content/uploads/2024/01/2.png", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXRhYXJpLW1hYXJpLW11bGFrYXRvLTIwMjMtc2Vhc29uLTEtY29tcGxldGUtZ3VqYXJhdGktd2ViLXNlcmllcy00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Taari Maari Mulakato (2023) Season 1 Complete Gujarati WEB Series 480p | 720p | 1080p WEB-DL", "type": "series", "poster": "https://rogmovies.asia/wp-content/uploads/2023/12/3.png", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXdoYXQtdGhlLWZhZmRhLTIwMjMtc2Vhc29uLTEtY29tcGxldGUtZ3VqYXJhdGktd2ViLXNlcmllcy00ODBwLTcyMHAv", "name": "What The Fafda (2023) Season 1 Complete Gujarati WEB Series 480p | 720p WEB-DL ESubs", "type": "series", "poster": "https://rogmovies.asia/wp-content/uploads/2023/09/What-The-Fafda.jpg", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1hdHN5YXZlZGgtMjAyMi1zZWFzb24tMS1jb21wbGV0ZS1ndWphcmF0aS13ZWItc2VyaWVzLTQ4MHAtNzIwcC1oZHJpcC8=", "name": "Matsyavedh (2022) Season 1 Complete Gujarati WEB Series 480p | 720p HDRip ESubs", "type": "series", "poster": "https://rogmovies.asia/wp-content/uploads/2022/10/Matsyavedh.png", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1lbWUtYm95cy1zZWFzb24tMS1oaW5kaS1zb255bGl2LWNvbXBsZXRlLXNlcmllcy00ODBwLTcyMHAv", "name": "Meme Boys Season 1 (2022) Hindi SonyLIV Complete Web Series 480p | 720p WEB-DL", "type": "series", "poster": "https://rogmovies.asia/wp-content/uploads/2022/07/Meme-Boys-Season-1-2022.jpg", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL29oby1lbnRoYW4tYmFieS0yMDI1LWhpbmRpLXdlYnJpcC1mdWxsLW1vdmllLw==", "name": "Oho Enthan Baby (2025) WEB-DL [Hindi (DD5.1) & Tamil] 4K 1080p 720p & 480p Dual Audio [x264/10Bit-HEVC] | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/w500/txbcjZ3lt1oqbcH5NM7ZVLyKaUy.jpg", "imdbRating": "8.0", "cat": "OTT"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1pc3NpbmctbWFoaWxhLXNlYXNvbi0xLWhpbmRpLXNlcmllcy00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Missing Mahila - Kajodu (Season 1) Hindi Shemaroo Complete Web Series 480p | 720p | 1080p WEB-DL", "type": "series", "poster": "https://image.tmdb.org/t/p/w500/i7K4JzjyECfPOh6mvejA8qnsU1j.jpg", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWVrLWthbnlhLWt1bndhcmktczAxLWhpbmRpLWNvbXBsZXRlLXdlYi1zZXJpZXMtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Ek Kanya Kunwari (Season 1) Hindi Shemaroome Complete Web Series 480p | 720p | 1080p WEB-DL", "type": "series", "poster": "https://rogmovies.asia/wp-content/uploads/2026/10/Ek-Kanya-Kunwari.png", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWRpbC1wYWRvc2ktc2Vhc29uLTEtaGluZGktc2hlbWFyb29tZS1jb21wbGV0ZS1zZXJpZXMtNDgwcC03MjBwLTEwODBwLw==", "name": "Dil Padosi (Season 1) Hindi ShemarooMe Complete Web Series 480p | 720p | 1080p WEB-DL", "type": "series", "poster": "https://image.tmdb.org/t/p/w500/hl9CVzOP0pRIxAVPZcEPjc0zVC0.jpg", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJlaW50ZWhhLWVrLWFub2toaS1kYXN0YWFuLXNlYXNvbi0xLWhpbmRpLXNlcmllcy00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Beinteha – Ek Anokhi Dastaan (Season 1) Hindi Complete Web Series 480p | 720p | 1080p WEB-DL", "type": "series", "poster": "https://image.tmdb.org/t/p/w500/llNcq8gkJfWkJqlrEB5Y009nM67.jpg", "imdbRating": "8.0", "cat": "SERIES"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXNoYW5heWEtYW4tdW5zb2x2ZWQtbXlzdGVyeS0yMDIzLWhpbmRpLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Shanaya An Unsolved Mystery (2023) Hindi Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/06/Shanaya.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLTMtZWtrYS0yMDIzLWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "3 Ekka - JOJO (2023) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/01/3-Ekka-1.jpg", "imdbRating": "8.0", "cat": "OTT"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWFzbGktcmFraHdhbGEtbmF0YWthbS0yMDIxLWhpbmRpLWR1YmJlZC1tb3ZpZS00ODBwLTcyMHAtaGRyaXAv", "name": "Asli Rakhwala (Natakam) (2021) Hindi Dubbed Full Movie 480p [350MB] | 720p [800MB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2021/03/Asli-Rakhwala.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2hleS1rZW0tY2hoby1sb25kb24tMjAyMi1ndWphcmF0aS13ZWJyaXAtZnVsbC1tb3ZpZS8=", "name": "Hey Kem Chho London (2022) Gujarati WEB-DL 1080p 720p & 480p x264 DD2.0 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/vjB8M5URYlACuLufUOpUAKPNIwL.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2hlbGxvLXppbmRhZ2ktMjAyMi1ndWphcmF0aS13ZWJyaXAtZnVsbC1tb3ZpZS8=", "name": "Hello Zindagi (2022) Gujarati WEB-DL 1080p 720p & 480p x264 DD2.0 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/liPrulNapj6nAXXULD41RRr0ig6.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL3ZlZXItaXNoYS1udS1zZWVtYW50LTIwMjItZ3VqYXJhdGktd2VicmlwLWZ1bGwtbW92aWUv", "name": "Veer-Isha nu seemant (2022) Gujarati WEB-DL 1080p 720p & 480p x264 DD5.1 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/mbSJE2455uL4PkLZ2KznZiRxuxU.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2doYW50YWRpLTIwMjItd2ViLWhkLWd1amFyYXRpLw==", "name": "Ghantadi (2022) WEB-HD [Gujarati DD2.0] 1080p & 720p & 480p x264 ESubs HD | Full Movie", "type": "movie", "poster": "https://myimg.click/images/2022/10/24/MV5BNGJiM2NjMmUtODY0My00ODUxLWFhNzctZDRlMjViODBhOGQ0XkEyXkFqcGdeQXVyMTI5MTU3MTAx._V1_.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsLzUzLW11LXBhYW51LTIwMjItZ3VqYXJhdGktd2VicmlwLWZ1bGwtbW92aWUv", "name": "53 Mu Paanu (2022) Gujarati WEB-DL 1080p 720p & 480p x264 DD2.0 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/dccpJsduu9N5YdrOaKwaWRVlRRh.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL3R1LXJhamVlLXJlLTIwMjItZ3VqYXJhdGktd2ViLWRsLTEwODBwLTcyMHAtNDgwcC14MjY0LWRkMi0wLWZ1bGwtbW92aWUv", "name": "Tu Rajee Re (2022) Gujarati WEB-DL 1080p 720p & 480p x264 DD2.0 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/ifyprOTzVVOk5DAr0jpEs5cA6t.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL25hYWRpLWRvc2gtMjAyMi1ndWphcmF0aS13ZWJyaXAtZnVsbC1tb3ZpZS8=", "name": "Naadi Dosh (2022) Gujarati WEB-DL 1080p 720p & 480p x264 DD2.0 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/bDR3HJIXSOgUFLxRIU4eDLEQmcz.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2pheXN1ay16ZHBheW8tMjAyMi1ndWphcmF0aS13ZWItZGwtMTA4MHAtNzIwcC00ODBwLXgyNjQtaGV2Yy1kZDUtMS1mdWxsLW1vdmllLw==", "name": "Jaysuk Zdpayo (2022) Gujarati WEB-DL 1080p 720p & 480p [x264/HEVC] DD5.1 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/ygEqHq7TlMkBKrJv4lyGKn9rlbX.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2dhamFiLXRoYWktZ2F5by0yMDIyLWd1amFyYXRpLXdlYnJpcC1mdWxsLW1vdmllLw==", "name": "Gajab Thai Gayo! (2022) Gujarati WEB-DL 1080p 720p & 480p x264 DD5.1 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/brTxylT2EfAfTcxxBTLHhu5msjY.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:SERIdWI0VTo6aHR0cHM6Ly9uZXcxMi5oZGh1YjR1LmNsL2RlYXItZmF0aGVyLTIwMjItZ3VqYXJhdGktd2ViLWRsLTEwODBwLTcyMHAtNzIwcC1oZXZjLWRkNS0xLWZ1bGwtbW92aWUv", "name": "Dear Father (2022) Gujarati WEB-DL 1080p 720p & 720p HEVC DD5.1 | Full Movie", "type": "movie", "poster": "https://image.tmdb.org/t/p/original/m262VNffqL7joufVpMhbP0O4qGp.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1pc3JpLTIwMjUtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Misri (2025) Gujarati Full Movie WEB-DL 480p [500MB] | 720p [1.3GB] | 1080p [2.8GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/02/misri.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWdvdGktbG8tMjAyNS1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Goti Lo (2025) Gujarati Full Movie 480p [360MB] | 720p [1.1GB] | 1080p [2.3GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/02/Goti-Lo.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWNvbW1vbi1tYW4tMjAyNS1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Common Man (2025) Gujarati Full Movie WEB-DL 480p [350MB] | 720p [900MB] | 1080p [1.9GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/02/xxx.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1haGFyYW5pLTIwMjUtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Maharani (2025) Gujarati Full Movie WEB-DL 480p [450MB] | 720p [1.2GB] | 1080p [2.6GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/01/Maharani.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJob2xhLW5vLWJoYWd3YW4tMjAyNS1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Bhola No Bhagwan (2025) Gujarati Full Movie 480p [480MB] | 720p [1.2GB] | 1080p [2.7GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/01/Bhola-No-Bhagwan.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWphbHNvLWEtZmFtaWx5LWludml0YXRpb24tMjAyNS1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Jalso: A Family Invitation (2025) Gujarati Full Movie 480p [390MB] | 720p [1GB] | 1080p [2.3GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/11/Jalso.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXNhbmdoYXZpLWFuZC1zb25zLTIwMjUtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Sanghavi and Sons (2025) Gujarati Full Movie 480p [500MB] | 720p [1.2GB] | 1080p [2.6GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/09/Sanghavi-and-Sons.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXRoZS1kdXJnYS1tZWh0YS1jYXNlLTIwMjUtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "The Durga Mehta Case (2025) Gujarati Full Movie 480p [380MB] | 720p [1GB] | 1080p [2.5GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/06/Screenshot_5.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXVtYmFycm8tMjAyNS1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Umbarro (2025) Gujarati WEB-DL Full Movie 480p [430MB] | 720p [1.1GB] | 1080p [2.4GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/04/Umbarro.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWF1bnR5cHJlbmV1ci0yMDI1LWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Auntypreneur (2025) WEB-DL {Gujarati DD2.0} Full Movie 480p [420MB] | 720p [1.5GB] | 1080p [2.8GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/11/Auntypreneur.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWphaS1tYXRhLWppLWxldHMtcm9jay0yMDI1LWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Jai Mata ji - lets Rock (2025) WEB-DL {Gujarati DD2.0} Full Movie 480p [320MB] | 720p [1.4GB] | 1080p [2.5GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/10/Jai-Mata-ji-lets-Rock.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1vbS10YW5lLW5haS1zYW1qYXktMjAyNS1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Mom Tane Nai Samjay (2025) WEB-DL {Gujarati DD2.0} Full Movie 480p [360MB] | 720p [1GB] | 1080p [2.1GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/07/Mom-Tane-Nai-Samjay.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW5hc29vci1sZXRzLXJlc3RhcnQtMjAyNC1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Nasoor - Let's Restart (2024) Gujarati Full Movie WEB-DL 480p [370MB] | 720p [1GB] | 1080p [2.2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/02/Nasoor.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWphZ2F0LTIwMjQtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "Jagat (2024) Gujarati Full Movie 480p [470MB] | 720p [1.2GB] | 1080p [2.7GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/03/Jagat.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJoYWxsZS1wYWRoYXJ5YS0yMDI0LWd1anJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Bhalle Padharya (2024) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1.1GB] | 1080p [2.5GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/10/Bhalle.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1hcmEtcGFwcGEtc3VwZXJoZXJvLTIwMjQtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Mara Pappa Superhero (2024) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2.3GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/09/papp.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWhhaGFjYXItMjAyNC1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC13ZWItZGwv", "name": "Hahacar (2024) Gujarati Full Movie 480p [440MB] | 720p [1.2GB] | 1080p [2.6GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/07/Hahacar.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWFqYWItcmFhdC1uaS1nYWphYi12YWF0LTIwMjQtaGluZGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Ajab Raat Ni Gajab Vaat (2024) Gujarati WEB-DL Full Movie 480p [400MB] | 720p [1GB] | 1080p [2.3GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/04/Ajab-Raat-Ni-Gajab-Vaat.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1hcnUtbWFubi10YXJ1LXRoYXl1LTIwMjQtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Maru Mann Taru Thayu (2024) Gujarati WEB-DL Full Movie 480p [450MB] | 720p [1.2GB] | 1080p [2.7GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/01/Maru-Mann-Taru-Thayu.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXRoZS1ncmVhdC1ndWphcmF0aS1tYXRyaW1vbnktMjAyNC1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "The Great Gujarati Matrimony (2024) Gujarati WEB-DL Full Movie 480p [450MB] | 720p [1.2GB] | 1080p [2.5GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2025/01/The-Great-Gujarati-Matrimony.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWZyZW5kby0yMDI0LWd1amFyYXRpLXdlYi1kbC1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Frendo (2024) Gujarati WEB-DL Full Movie 480p [450MB] | 720p [1.3GB] | 1080p [2.7GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/12/Frendo.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1hdW5hbS0yMDI0LWd1amFyYXRpLXdlYi1kbC1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Maunam (2024) Gujarati WEB-DL Full Movie 480p [350MB] | 720p [900MB] | 1080p [1.9GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/12/Maunam.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWxvY2hhLWxhYXBzaS0yMDI0LWd1amFyYXRpLXdlYi1kbC1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Locha Laapsi (2024) Gujarati WEB-DL Full Movie 480p [360MB] | 720p [960MB] | 1080p [2.1GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/12/Locha-Laapsi.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXVkYW4tY2hob28tMjAyNC1ndWphcmF0aS13ZWItZGwtZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Udan Chhoo (2024) Gujarati WEB-DL Full Movie 480p [400MB] | 720p [1.1GB] | 1080p [2.4GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/12/Udan-Chhoo.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWpoYW1rdWRpLTIwMjQtZ3VqYXJhdGktd2ViLWRsLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "Jhamkudi (2024) Gujarati WEB-DL Full Movie 480p [470MB] | 720p [1.4GB] | 1080p [2.9GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/10/Screenshot_1-2.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXBvcGFhdC0yMDIzLWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLXdlYi1kbC8=", "name": "Popaat (2023) Gujarati Full Movie 480p [330MB] | 720p [900MB] | 1080p [2GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/03/Popaat.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW15LWJlc3QtZnJpZW5kLWRhYWR1LTIwMjMtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAtd2ViLWRsLw==", "name": "My Best Friend Daadu (2023) Gujarati Full Movie 480p [400MB] | 720p [1.1GB] | 1080p [2.3GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2026/03/My-Best-Friend-Daadu.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXdlbGNvbWUtcHVybmltYS0yMDIzLWd1amFyYXRpLW1vdmllLw==", "name": "Welcome Purnima (2023) Gujarati Full Movie 480p [410MB] | 720p [1.2GB] | 1080p [2.3GB] WEB-DL", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/09/Welcome-Purnima-2023-Gujarati.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJhY2h1YmhhaS0yMDIzLWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "Bachubhai (2023) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/08/Bachubhai.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXNhc3UtbWFhLTIwMjMtZ3VqYXJhdGktd2ViLWRsLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "Sasu Maa (2023) Gujarati WEB-DL Full Movie 480p [450MB] | 720p [1.1GB] | 1080p [2.4GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/07/Sasu-Maa.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWZ1bGVrdS0yMDIzLWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "Fuleku (2023) Gujarati WEB-DL Full Movie 480p [400MB] | 720p [1GB] | 1080p [2.2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/06/Fuleku.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWppbmRhZ2ktaml2aS1sZS0yMDIzLWd1amFyYXRpLXdlYi1kbC1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Jindagi Jivi Le (2023) Gujarati WEB-DL Full Movie 480p [500MB] | 720p [1.3GB] | 1080p [2.8GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/03/Screenshot_1.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWthaGktZGUtbmUtcHJlbS1jaGhlLTIwMjMtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Kahi De Ne Prem Chhe (2023) Gujarati WEB-DL Full Movie 480p [400MB] | 720p [1.1GB] | 1080p [2.4GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/01/Kahi-De-Ne-Prem-Chhe.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWh1cnJ5LW9tLWh1cnJ5LTIwMjMtZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Hurry Om Hurry (2023) Gujarati WEB-DL Full Movie 480p [450MB] | 720p [1.3GB] | 1080p [2.8GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/01/Screenshot_1-6.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWhlbGxvLTIwMjMtZ3VqYXJhdGktbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "Hello (2023) Gujarati Full Movie WEB-DL 480p [380MB] | 720p [1.3GB] | 1080p [2.5GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/01/Hello-GUJ.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWZhbWlseS1jaXJjdXMtMjAyMy1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Family Circus (2023) Gujarati Full Movie WEB-DL 480p [450MB] | 720p [1.1GB] | 1080p [2.6GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/11/Screenshot_3-2.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWVrLXBlcmZlY3Qtc2hvdC0yMDIzLWd1amFyYXRpLWZ1bGwtbW92aWUtd2ViLWRsLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Ek Perfect Shot (2023) Gujarati Full Movie WEB-DL 480p [520MB] | 720p [1.4GB] | 1080p [3GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/10/Screenshot_4.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWFha2hldC0yMDIzLWd1amFyYXRpLWZ1bGwtbW92aWUtd2ViLWRsLTcyMHAtMTA4MHAv", "name": "Aakhet (2023) Gujarati Full Movie WEB-DL 720p [780MB] | 1080p [3.1GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/10/Screenshot_3.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWNoYXItZmVyYS1udS1jaGFrZG9sLTIwMjMtZ3VqYXJhdGktZnVsbC1tb3ZpZS13ZWItZGwtNDgwcC03MjBwLTEwODBwLw==", "name": "Char Fera Nu Chakdol (2023) Gujarati Full Movie WEB-DL 480p [460MB] | 720p [1.2GB] | 1080p [2.6GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/10/Char-Fera-Nu-Chakdol.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXJhYWRvLTIwMjItZ3VqYXJhdGktd2ViLWRsLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "Raado (2022) Gujarati WEB-DL Full Movie 480p [450MB] | 720p [1.2GB] | 1080p [2.6GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/11/Raado.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1hZGhhdi0yMDIyLWd1amFyYXRpLXdlYi1kbC1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Madhav (2022) Gujarati DD5.1 WEB-DL Full Movie 480p [350MB] | 720p [1GB] | 1080p [2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/07/Screenshot_1-1.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXNodS10YW1lLWt1bndhcmEtY2hoby0yMDIyLWd1amFyYXRpLWZ1bGwtbW92aWUtd2ViLWRsLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Shu Tame Kunwara Chho (2022) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2.2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/10/Screenshot_2.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWFnaGF0dGl0LTIwMjItZ3VqYXJhdGktZnVsbC1tb3ZpZS13ZWItZGwtNDgwcC03MjBwLTEwODBwLw==", "name": "Aghattit (2022) Gujarati Full Movie WEB-DL 480p [330MB] | 720p [880MB] | 1080p [1.9GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/10/Screenshot_1.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWJhYWdhZC1iaWxsYWEtMjAyMi1ndWphcmF0aS1mdWxsLW1vdmllLXdlYi1kbC00ODBwLTcyMHAtMTA4MHAv", "name": "Baagad Billaa (2022) Gujarati Full Movie WEB-DL 480p [350MB] | 720p [950MB] | 1080p [2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/10/BaagadBillaa.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXZhYWhsYW0tamFhby1uZS0yMDIyLWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "Vaahlam Jaao Ne (2022) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1.3GB] | 1080p [2.8GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/05/Vaahlam-Jaao-Ne.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXBlbnRhZ29uLTIwMjItZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Pentagon (2022) Gujarati Full Movie WEB-DL 480p [350MB] | 720p [900MB] | 1080p [1.9GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/04/Pentagon-2022-Gujarati-movie.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW5heWlrYS1kZXZpLXRoZS13YXJyaW9yLXF1ZWVuLTIwMjItZ3VqYXJhdGktNDgwcC03MjBwLTEwODBwLw==", "name": "Nayika Devi: The Warrior Queen (2022) Gujarati Full Movie WEB-DL 480p [450MB] | 720p [1.3GB] | 1080p [2.7GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2023/03/Nayika-Devi.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWNoYWJ1dHJvLTIwMjItZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Chabutro (2022) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1.3GB] | 1080p [3.3GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2022/12/Chabutro.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLWRhcmQtMjAyMi1ndWphcmF0aS1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Dard (2022) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2.1GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2022/10/Dard.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1hbmUtbGFpLWphLTIwMjItZ3VqYXJhdGktZnVsbC1tb3ZpZS00ODBwLTcyMHAtMTA4MHAv", "name": "Mane Lai Ja (2022) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1GB] | 1080p [2.2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2022/09/Mane-Lai-Ja.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLXR1LXN0YXItY2hoZS0yMDIyLWd1amFyYXRpLWZ1bGwtbW92aWUtNDgwcC03MjBwLTEwODBwLw==", "name": "Tu Star Chhe (2022) Gujarati Full Movie WEB-DL 480p [400MB] | 720p [1.1GB] | 1080p [2.1GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2022/08/Tu-Star-Chhe-2022-Gujarati.jpg", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Um9nbW92aWVzOjpodHRwczovL3JvZ21vdmllcy5hc2lhL2Rvd25sb2FkLW1hbGhhci0yMDI0LWhpbmRpLWNhbXJpcC1mdWxsLW1vdmllLTQ4MHAtNzIwcC0xMDgwcC8=", "name": "Malhar (2024) Hindi CAMRip Full Movie 480p [300MB] | 720p [1GB] | 1080p [2GB]", "type": "movie", "poster": "https://rogmovies.asia/wp-content/uploads/2024/06/Screenshot_1-3.png", "imdbRating": "8.0", "cat": "MOVIE"}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS81ODIzMDM3MjI5NjE1MTA0", "name": "Gujarati Wedding In Goa", "type": "movie", "poster": "https://img1.fodcyy.com/image/4027798eedca7d2355a77808364aa06dfb92cd76.jpg", "imdbRating": "8.0", "cat": "MOVIE"}];
function getNativeGujaratiCatalog() {
    return [...NATIVE_GUJARATI_CATALOG].sort((a, b) => {
        const matchA = (a.name || '').match(/\b(19\d\d|20\d\d)\b/);
        const matchB = (b.name || '').match(/\b(19\d\d|20\d\d)\b/);
        const yA = matchA ? parseInt(matchA[1], 10) : 2026;
        const yB = matchB ? parseInt(matchB[1], 10) : 2026;
        return yB - yA;
    });
}

const FANCODE_API_URL = 'https://raw.githubusercontent.com/Jitendra-unatti/fancode/refs/heads/main/data/fancode.json';
const DOMAINS_API_URL = 'https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json';
const FIREBASE_DOMAINS_URL = 'https://cloudstreampluginhelper-default-rtdb.firebaseio.com/.json';

let cachedDomains = null;
let lastDomainsFetch = 0;

async function getLiveDomains() {
    const now = Date.now();
    if (cachedDomains && (now - lastDomainsFetch < 3600000)) {
        return cachedDomains;
    }
    const merged = {
        HDHUB4u: 'https://new11.hdhub4u.cl',
        vegamovies: 'https://vegamovies.lease',
        themoviesflix: 'https://themoviesflix.forum/',
        multimovies: 'https://m1.multimovies.courses/',
        cinestream: 'https://cinestream.kje.us/',
        animeworld: 'https://watchanimeworld.one/',
        anikoto: 'https://anikototv.to'
    };
    try {
        const d = await fetchJson(DOMAINS_API_URL);
        if (d && typeof d === 'object') Object.assign(merged, d);
    } catch(e) {}
    try {
        const fb = await fetchJson(FIREBASE_DOMAINS_URL);
        if (fb && typeof fb === 'object') {
            if (fb.themoviesflix_url) merged.themoviesflix = fb.themoviesflix_url;
            if (fb.multimovies_url) merged.multimovies = fb.multimovies_url;
            if (fb.cinestream_url) merged.cinestream = fb.cinestream_url;
            if (fb.animeworldindia_url) merged.animeworld = fb.animeworldindia_url;
            if (fb.anikoto_url) merged.anikoto = fb.anikoto_url;
        }
    } catch(e) {}
    cachedDomains = merged;
    lastDomainsFetch = now;
    return cachedDomains;
}

async function getNativeSportsCatalog() {
    try {
        const raw = await fetchJson(FANCODE_API_URL);
        const matches = raw.matches || raw.liveMatches || [];
        return matches.filter(m => m && m.match_id).map(m => {
            const title = m.title || 'Live Match';
            const category = m.category || 'Sports';
            const poster = m.image || BRAND_LOGO;
            const tournament = m.tournament || 'Live Tournament';
            const teams = Array.isArray(m.team) ? m.team.map(t => t.name).join(' vs ') : title;
            return {
                id: `native:fc:${m.match_id}`,
                name: `⚡ ${title} (${category})`,
                type: 'tv',
                poster: poster,
                background: poster,
                description: `🏆 ${tournament} | ${teams} | Direct 0ms HLS Stream`
            };
        });
    } catch(err) {
        console.error('Error fetching native sports catalog:', err.message);
        return [];
    }
}

async function getNativeSportsStream(matchId) {
    try {
        const raw = await fetchJson(FANCODE_API_URL);
        const matches = raw.matches || raw.liveMatches || [];
        const match = matches.find(m => String(m.match_id) === String(matchId));
        if (!match) return { streams: [] };

        const streams = [];
        const primaryUrl = match.STREAMING_CDN?.Primary_Playback_URL || match.STREAMING_CDN?.fancode_cdn;
        if (primaryUrl && primaryUrl.startsWith('http')) {
            streams.push({
                name: `⚡ [Web Play] Live Stream (Adaptive 1080p)`,
                title: `${match.title} - Official Master Stream`,
                url: primaryUrl,
                isWebPlayable: true
            });
        }

        if (Array.isArray(match.auto_streams)) {
            match.auto_streams.forEach(as => {
                const lines = (as.auto || '').split('\n');
                let curRes = 'HD';
                lines.forEach(l => {
                    if (l.includes('RESOLUTION=')) {
                        const m = l.match(/RESOLUTION=\d+x(\d+)/);
                        if (m && m[1]) curRes = `${m[1]}p`;
                    } else if (l.startsWith('http')) {
                        streams.push({
                            name: `⚡ [Web Play] ${curRes} Stream`,
                            title: `${match.title} (${curRes})`,
                            url: l.trim(),
                            isWebPlayable: true
                        });
                    }
                });
            });
        }
        return { streams };
    } catch(err) {
        console.error('Error resolving native sports stream:', err.message);
        return { streams: [] };
    }
}

// 💎 Native In-House Scraper: HDHub4u 4K & 1080p Direct Extractor (Zero Bridge Dependency)
let cachedHDHubCatalog = null;
let lastHDHubCatalogFetch = 0;

function unpackDeanEdwards(packed) {
    const match = packed.match(new RegExp("}\\s*\\('([\\s\\S]*?)',\\s*(\\d+),\\s*(\\d+),\\s*'([\\s\\S]*?)'\\.split\\('\\|'\\)"));
    if (!match) return null;
    let [_, p, a, c, k] = match;
    a = parseInt(a, 10);
    c = parseInt(c, 10);
    const keywords = k.split('|');

    function base36(n, b) {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (n === 0) return '0';
        let res = '';
        while (n > 0) {
            res = chars[n % b] + res;
            n = Math.floor(n / b);
        }
        return res;
    }

    const dict = {};
    for (let i = 0; i < c; i++) {
        const key = base36(i, a);
        dict[key] = (keywords[i] !== undefined && keywords[i] !== '') ? keywords[i] : key;
    }

    return p.replace(/\b\w+\b/g, (token) => {
        return dict.hasOwnProperty(token) ? dict[token] : token;
    });
}


const CASTLE_CURATED_SERIES = [{"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS8xMDI2MjI0Mjc4OTcwMzIwNw==", "name": "Panchayat", "type": "series", "poster": "https://img1.fodcyy.com/image/cae47aafa442ab9d6f78541d4ab9a38a1f8e5edc.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Panchayat • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS83ODQ3MTQzMjUyNTM1Mjk2", "name": "Mirzapur", "type": "series", "poster": "https://img1.fhxod.com/7d0be6c4-fbfe-4746-8324-4978b621a087.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Mirzapur • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS85MjIzMTYxNDc5NzA0NTM0", "name": "The Family Man", "type": "series", "poster": "https://img1.fhxod.com/d8abc2fc-9386-477f-8ef2-2ec8ba0d022d.webp", "cat": "SERIES", "imdbRating": "8.6", "description": "The Family Man • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS84ODQ2NjQyNjk2MzkxNjgw", "name": "Special OPS", "type": "series", "poster": "https://img1.bhcxy.com/45853c67-c80c-46fe-a9e6-064716457ca2.jpeg", "cat": "SERIES", "imdbRating": "8.6", "description": "Special OPS • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS81NTkwMTA4MDIyNjUxOTA0", "name": "Sacred Games", "type": "series", "poster": "https://img1.bhcxy.com/film-movie-photo/e2f9f17524ef4decac90c6cfccbf8040.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Sacred Games • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS81Njk5MzM2NTQxNzg5MTg0", "name": "Scam 1992 - The Harshad Mehta Story", "type": "series", "poster": "https://img1.bhcxy.com/image/4dc813cba366712f14529f18ca46a3c5.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Scam 1992 - The Harshad Mehta Story • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS83OTM3MzcyODI1MTcyOTky", "name": "Farzi", "type": "series", "poster": "https://img1.fodcyy.com/image/fce2ce0a6aa3cbb6582556a1f907eb40.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Farzi • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS82ODk4NjIwNTkxMDQ4NzA0", "name": "Asur: Welcome to Your Dark Side", "type": "series", "poster": "https://img1.fhxod.com/image/b947a3f59734b1991b284d86ad21cbca228dca88.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Asur: Welcome to Your Dark Side • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS85ODQ1NTAxMDE4MjUyOTA5", "name": "Gullak", "type": "series", "poster": "https://img1.fhxod.com/image/06b65b2d5cc59c3f95a5fb3125356242f0f2982d.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Gullak • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS83ODIyMDk0MzcyODQxNDcy", "name": "Kota Factory", "type": "series", "poster": "https://img1.fhxod.com/09397378-9ae0-4736-8c9c-49d45efe72fd.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Kota Factory • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS85NTk5MDc3OTkyMzc5MTA1", "name": "Aspirants", "type": "series", "poster": "https://img1.fhxod.com/4274a2a0-c2c5-4b89-816c-1d60dd0b8b8c.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Aspirants • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS84MTAxNDM5MTY4OTQ2MTc2", "name": "Taaza Khabar", "type": "series", "poster": "https://img1.fhxod.com/68e929b7-5846-4c5e-918b-c6eceb3e855e.jfif", "cat": "SERIES", "imdbRating": "8.6", "description": "Taaza Khabar • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS82OTQzNTg5NTU1OTAzNDg4", "name": "Loki", "type": "series", "poster": "https://img1.fhxod.com/image/e4f6d043cb4395c8f273a8e272bae6e088e6b791.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Loki • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS84NjkzMjMyMzk3NjQ5OTIw", "name": "Wednesday", "type": "series", "poster": "https://img1.fodcyy.com/image/0637ed23d6ac03ca0dfd87a0469d9171b51900b7.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Wednesday • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS85NDI3MjM4OTA4ODExNjU3", "name": "The Boys", "type": "series", "poster": "https://img1.fhxod.com/image/9017d5902c8a2a02f7aeb180456cabbc02bce00c.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "The Boys • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS84ODE5MzMxMDAwODE1NjE2", "name": "Stranger Things", "type": "series", "poster": "https://img1.fodcyy.com/image/5bbda328b46682363a3c940466d2e0617b53a2e0.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Stranger Things • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS81NjU4MDk4MDk4MTU2NTQ0", "name": "Money Heist", "type": "series", "poster": "https://img1.fodcyy.com/image/0ac7e2779773ad917431254b26e41270.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Money Heist • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}, {"id": "cnc:Q2FzdGxlVFY6Omh0dHBzOi8vYXBpLmhsb3diLmNvbS84NzI3Mjc0MTk3NDkwNjg4", "name": "Squid Game", "type": "series", "poster": "https://img1.fodcyy.com/image/9965fc61bd82704357e628fb62377e9acb07fb0a.jpg", "cat": "SERIES", "imdbRating": "8.6", "description": "Squid Game • Castle TV In-App Web Play (No VLC Required)", "isWebPlayable": true}];

let cachedWebSeriesCatalog = null;
let lastWebSeriesCatalogFetch = 0;

async function getNativeWebSeriesCatalog() {
    const now = Date.now();
    if (cachedWebSeriesCatalog && (now - lastWebSeriesCatalogFetch < 900000)) { // 15 mins cache
        return cachedWebSeriesCatalog;
    }

    const items = [...CASTLE_CURATED_SERIES];
    const seenSlugs = new Set(CASTLE_CURATED_SERIES.map(s => s.id));

    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.HDHUB4u || 'https://new12.hdhub4u.cl';

        // Concurrently scrape pages 1, 2, 3 from /category/web-series/
        const pagePromises = [1, 2, 3].map(page => {
            const pageUrl = page === 1 ? `${baseDomain}/category/web-series/` : `${baseDomain}/category/web-series/page/${page}/`;
            return fetchHtml(pageUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 8000).catch(() => null);
        });

        const pagesHtml = await Promise.all(pagePromises);
        const regex = /<a[^>]+href="([^"]+)"[^>]+(?:aria-label|title)="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/gi;

        for (const html of pagesHtml) {
            if (!html) continue;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const href = match[1];
                const rawTitle = match[2];
                const poster = match[3];

                if (rawTitle && href && href !== '/' && !href.includes('/disclaimer/') && !href.includes('app-download')) {
                    const slug = href.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '').replace(/\/$/, '');
                    if (slug && !seenSlugs.has(slug)) {
                        seenSlugs.add(slug);
                        const cleanTitle = rawTitle.replace(/&#038;/g, '&').replace(/&#8211;/g, '-').replace(/\|.*$/, '').trim();
                        const fullPoster = poster.startsWith('http') ? poster : `${baseDomain}${poster}`;

                        items.push({
                            id: `native:hdhub:${slug}`,
                            name: cleanTitle,
                            type: 'series',
                            poster: fullPoster,
                            background: fullPoster,
                            description: `${cleanTitle} • Complete Seasons & Episodes with Multi-Audio Direct Streams.`,
                            cat: 'SERIES',
                            imdbRating: '8.4',
                            genres: ['Web Series', 'Drama']
                        });
                    }
                }
            }
        }

        if (items.length > 0) {
            cachedWebSeriesCatalog = items;
            lastWebSeriesCatalogFetch = now;
            return items;
        }
    } catch (err) {
        console.error('Error fetching native web series catalog:', err.message);
    }
    return items.length > 0 ? items : (cachedWebSeriesCatalog || CASTLE_CURATED_SERIES);
}

async function getNativeHDHub4uCatalog() {
    const now = Date.now();
    if (cachedHDHubCatalog && (now - lastHDHubCatalogFetch < 900000)) { // 15 mins cache
        return cachedHDHubCatalog;
    }

    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.HDHUB4u || 'https://new11.hdhub4u.cl';
        const html = await fetchHtml(baseDomain);
        
        const regex = /<a[^>]+href="([^"]+)"[^>]+(?:aria-label|title)="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/gi;
        let match;
        const items = [];
        const seenSlugs = new Set();
        
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const rawTitle = match[2];
            const poster = match[3];
            
            if (rawTitle && href && href !== '/' && !href.includes('/disclaimer/') && !href.includes('app-download')) {
                const slug = href.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '').replace(/\/$/, '');
                if (slug && !seenSlugs.has(slug)) {
                    seenSlugs.add(slug);
                    const cleanTitle = rawTitle.replace(/&#038;/g, '&').replace(/\|.*$/, '').trim();
                    const isSeries = cleanTitle.toLowerCase().includes('season') || cleanTitle.toLowerCase().includes('series') || cleanTitle.toLowerCase().includes('ep-');
                    const fullPoster = poster.startsWith('http') ? poster : `${baseDomain}${poster}`;
                    
                    items.push({
                        id: `native:hdhub:${slug}`,
                        name: cleanTitle,
                        type: isSeries ? 'series' : 'movie',
                        poster: fullPoster,
                        background: fullPoster,
                        description: `${cleanTitle} • Available in 4K UHD & 1080p Multi-Audio directly extracted from HDHub4u high-speed mirrors.`,
                        genres: isSeries ? ['Web Series', 'Drama'] : ['Movie', 'Action']
                    });
                }
            }
        }
        
        if (items.length > 0) {
            cachedHDHubCatalog = items;
            lastHDHubCatalogFetch = now;
            return items;
        }
    } catch(err) {
        console.error('Error fetching native HDHub4u catalog:', err.message);
    }
    return cachedHDHubCatalog || [];
}

async function getNativeHDHub4uStreams(slug) {
    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.HDHUB4u || 'https://new11.hdhub4u.cl';
        const moviePageUrl = `${baseDomain}/${slug}/`;
        const pageHtml = await fetchHtml(moviePageUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

        const streams = [];

        // 1. Direct HLS 1080p via hdstream4u / hubstream player unpacker
        const streamLinkMatch = pageHtml.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:hdstream4u|hubstream)\.[a-z]+\/file\/[a-zA-Z0-9]+/i);
        if (streamLinkMatch) {
            try {
                const streamUrl = streamLinkMatch[0];
                const streamPageHtml = await fetchHtml(streamUrl, {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': moviePageUrl
                }, 5000);

                const scripts = streamPageHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
                for (const s of scripts) {
                    if (s.includes('eval(function(p,a,c,k,e,d)')) {
                        const unpacked = unpackDeanEdwards(s);
                        if (unpacked) {
                            const m3u8Match = unpacked.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
                            if (m3u8Match) {
                                streams.push({
                                    name: '⚡ HDHub4u [Direct 1080p HLS]',
                                    title: 'Full HD 1080p • Multi-Audio (Hindi / English / Tamil / Telugu)',
                                    url: m3u8Match[0],
                                    isWebPlayable: true,
                                    behaviorHints: {
                                        notWebReady: false
                                    }
                                });
                                break;
                            }
                        }
                    }
                }
            } catch(e) {
                console.error('Error resolving hdstream4u for slug:', slug, e.message);
            }
        }

        // 2. Quality mirrors (hubcdn, hubdrive, hubcloud, etc.)
        const linkRegex = /href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
        let lMatch;
        const qualityLinks = [];
        while ((lMatch = linkRegex.exec(pageHtml)) !== null) {
            const lHref = lMatch[1];
            const lText = lMatch[2].trim();
            if (lHref.includes('hubcdn') || lHref.includes('hubdrive') || lHref.includes('hubcloud') || lHref.includes('greenmotors')) {
                qualityLinks.push({ url: lHref, text: lText });
            }
        }

        // Resolve each hub file link to direct video bucket (e.g. Cloudflare R2 / HubCDN direct)
        for (const item of qualityLinks.slice(0, 4)) {
            try {
                const hubHtml = await fetchHtml(item.url, { 'Referer': moviePageUrl }, 4500);
                const base64Match = hubHtml.match(/\?r=([a-zA-Z0-9+/=]+)/);
                if (base64Match) {
                    const decoded = Buffer.from(base64Match[1], 'base64').toString('utf8');
                    const linkParam = decoded.match(/link=([^&]+)/);
                    if (linkParam) {
                        const directUrl = decodeURIComponent(linkParam[1]);
                        const qName = item.text.replace(/⚡/g, '').trim() || 'Direct Video';
                        streams.push({
                            name: `💎 [Direct R2] ${qName}`,
                            title: `${qName} • High-Speed Direct Stream (Multi-Audio)`,
                            url: directUrl,
                            isWebPlayable: true,
                            behaviorHints: { notWebReady: false }
                        });
                    }
                }
            } catch(e) {
                // If resolving direct link times out, skip to next
            }
        }

        if (streams.length === 0 && qualityLinks.length > 0) {
            qualityLinks.forEach(q => {
                streams.push({
                    name: `💎 HDHub4u ${q.text}`,
                    title: `${q.text} (Web Stream)`,
                    url: q.url,
                    behaviorHints: { notWebReady: false }
                });
            });
        }

        return { streams };
    } catch(err) {
        console.error(`Error resolving HDHub4u stream for ${slug}:`, err.message);
        return { streams: [] };
    }
}

// 🍿 Native In-House Scraper: VegaMovies 4K UHD & Dual Audio Direct Extractor (Zero Bridge Dependency)
let cachedVegaCatalog = null;
let lastVegaCatalogFetch = 0;

async function getNativeVegaMoviesCatalog() {
    const now = Date.now();
    if (cachedVegaCatalog && (now - lastVegaCatalogFetch < 900000)) { // 15 mins cache
        return cachedVegaCatalog;
    }

    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.vegamovies || 'https://vegamovies.lease';
        const html = await fetchHtml(baseDomain);

        const regex = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/gi;
        let match;
        const items = [];
        const seenSlugs = new Set();

        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const poster = match[2];
            const rawTitle = match[3];

            if (rawTitle && href && href.includes('/download-')) {
                const slug = href.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '').replace(/\/$/, '');
                if (slug && !seenSlugs.has(slug)) {
                    seenSlugs.add(slug);
                    const cleanTitle = rawTitle.replace(/^Download\s+/i, '').replace(/&#038;/g, '&').replace(/WEB-DL.*$/i, '').replace(/BluRay.*$/i, '').trim();
                    const isSeries = slug.includes('season') || cleanTitle.toLowerCase().includes('season');
                    const fullPoster = poster.startsWith('http') ? poster : `${baseDomain}${poster}`;

                    items.push({
                        id: `native:vega:${slug}`,
                        name: cleanTitle,
                        type: isSeries ? 'series' : 'movie',
                        poster: fullPoster,
                        background: fullPoster,
                        description: `${cleanTitle} • Available in 4K UHD, HDR & Dual Audio directly extracted from VegaMovies.`,
                        genres: isSeries ? ['Web Series', 'Dual Audio'] : ['Movie', '4K UHD']
                    });
                }
            }
        }

        if (items.length > 0) {
            cachedVegaCatalog = items;
            lastVegaCatalogFetch = now;
            return items;
        }
    } catch(err) {
        console.error('Error fetching native VegaMovies catalog:', err.message);
    }
    return cachedVegaCatalog || [];
}

async function getNativeVegaMoviesStreams(slug) {
    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.vegamovies || 'https://vegamovies.lease';
        const moviePageUrl = `${baseDomain}/${slug}/`;
        const pageHtml = await fetchHtml(moviePageUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

        const streams = [];

        // 1. Direct playdrive.vip web player
        const playMatch = pageHtml.match(/https?:\/\/(?:www\.)?playdrive\.vip\/e\/[a-zA-Z0-9_-]+/i);
        if (playMatch) {
            streams.push({
                name: '🍿 VegaMovies [Direct Web Player]',
                title: 'Full HD 1080p • Multi-Audio (Hindi / English / Tamil / Telugu)',
                url: playMatch[0],
                isWebPlayable: true,
                behaviorHints: { notWebReady: false }
            });
        }

        // 2. Nexdrive & fastdl direct download / stream mirrors
        const nexRegex = /href="([^"]*nexdrive[^"]*)"/gi;
        let nMatch;
        const nexLinks = [];
        while ((nMatch = nexRegex.exec(pageHtml)) !== null) {
            if (!nexLinks.includes(nMatch[1])) {
                nexLinks.push(nMatch[1]);
            }
        }

        for (const nexUrl of nexLinks.slice(0, 4)) {
            try {
                const nexHtml = await fetchHtml(nexUrl, { 'Referer': moviePageUrl }, 4500);
                const fastMatch = /href="([^"]*fastdl[^"]*)"/i.exec(nexHtml);
                if (fastMatch) {
                    const fastUrl = fastMatch[1];
                    const fastHtml = await fetchHtml(fastUrl, { 'Referer': nexUrl }, 4500);
                    const linkMatch = /link=(https:\/\/video-downloads\.googleusercontent\.com\/[^"&]+)/i.exec(fastHtml);
                    if (linkMatch) {
                        const directUrl = linkMatch[1];
                        streams.push({
                            name: `🍿 VegaMovies 4K HDR`,
                            title: `Google Direct Fast Server ${streams.length + 1}`,
                            url: directUrl,
                            behaviorHints: {
                                notWebReady: false
                            }
                        });
                    }
                }
            } catch(e) {}
        }

        return { streams };
    } catch(err) {
        console.error(`Error resolving VegaMovies stream for ${slug}:`, err.message);
        return { streams: [] };
    }
}


// ========================================================
// 💎 Native In-House Scraper: MoviesDrive High-Speed Cloud & Gujarati Provider
// ========================================================
const cachedMoviesDriveSearch = new Map();

async function getNativeMoviesDriveCatalog(searchQuery = '') {
    const q = (searchQuery || '2026').trim();
    const cacheKey = q.toLowerCase();
    const cached = cachedMoviesDriveSearch.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 600000)) { // 10 mins cache
        return cached.metas;
    }

    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.moviesdrive || 'https://new3.moviesdrive.cyou';
        const page1Url = `${baseDomain}/search.php?q=${encodeURIComponent(q)}&page=1`;
        const page1Data = await fetchJson(page1Url, { 'Referer': baseDomain });
        const totalFound = page1Data?.found || 0;
        let hits = Array.isArray(page1Data?.hits) ? [...page1Data.hits] : [];

        // If more than 15 items exist (e.g. 93 Gujarati movies), fetch all remaining pages concurrently!
        const totalPages = Math.min(Math.ceil(totalFound / 15), 8);
        if (totalPages > 1) {
            const pagePromises = [];
            for (let p = 2; p <= totalPages; p++) {
                pagePromises.push(
                    fetchJson(`${baseDomain}/search.php?q=${encodeURIComponent(q)}&page=${p}`, { 'Referer': baseDomain })
                        .then(d => Array.isArray(d?.hits) ? d.hits : [])
                        .catch(() => [])
                );
            }
            const pageResults = await Promise.allSettled(pagePromises);
            pageResults.forEach(res => {
                if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                    hits.push(...res.value);
                }
            });
        }
        const metas = [];
        const seenSlugs = new Set();

        for (const h of hits) {
            const doc = h?.document || {};
            const rawTitle = doc.post_title || '';
            const permalink = doc.permalink || '';
            if (!rawTitle || !permalink) continue;

            const cleanSlug = permalink.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '').replace(/\/$/, '');
            if (!cleanSlug || seenSlugs.has(cleanSlug)) continue;
            seenSlugs.add(cleanSlug);

            const isSeries = cleanSlug.includes('season') || rawTitle.toLowerCase().includes('season') || rawTitle.toLowerCase().includes('series');
            const poster = doc.post_thumbnail || 'https://raw.githubusercontent.com/shahrukh-hack/yogesh-streamer-plugins/builds/logo.jpg';
            const yearMatch = rawTitle.match(/\b(19\d\d|20\d\d)\b/);
            const year = yearMatch ? yearMatch[1] : '';

            metas.push({
                id: `native:mdrive:${cleanSlug}`,
                name: rawTitle,
                type: isSeries ? 'series' : 'movie',
                poster: poster,
                background: poster,
                year: year,
                imdb_id: doc.imdb_id || undefined,
                description: `${rawTitle} • High-speed cloud streaming directly extracted from MoviesDrive. Available in 480p, 720p, 1080p and 4K SDR with multi-audio support.`,
                genres: Array.isArray(doc.category) ? doc.category : ['Movie', 'Dual Audio']
            });
        }

        if (metas.length > 0) {
            cachedMoviesDriveSearch.set(cacheKey, { timestamp: Date.now(), metas });
        }
        return metas;
    } catch (err) {
        console.error('Error fetching MoviesDrive catalog:', err.message);
        return [];
    }
}

async function getNativeMoviesDriveStreams(slug) {
    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.moviesdrive || 'https://new3.moviesdrive.cyou';
        const pageUrl = `${baseDomain}/${slug}/`;
        const pageHtml = await fetchHtml(pageUrl, { 'Referer': baseDomain }, 6000);
        const mdriveLinks = pageHtml.match(/https?:\/\/mdrive\.lol\/archive\/\d+\/?/g) || [];
        const uniqueMdrive = [...new Set(mdriveLinks)];
        const streams = [];

        for (let i = 0; i < uniqueMdrive.length; i++) {
            const mUrl = uniqueMdrive[i];
            let qualityLabel = '1080p Full HD';
            if (uniqueMdrive.length === 3) {
                if (i === 0) qualityLabel = '480p SD';
                else if (i === 1) qualityLabel = '720p HD';
                else qualityLabel = '1080p Full HD';
            } else if (uniqueMdrive.length === 2) {
                if (i === 0) qualityLabel = '720p HD';
                else qualityLabel = '1080p Full HD';
            }

            try {
                const mHtml = await fetchHtml(mUrl, { 'Referer': pageUrl }, 5000);
                const hubMatch = mHtml.match(/https?:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-zA-Z0-9]+/i);
                if (!hubMatch) continue;

                const hubUrl = hubMatch[0];
                const hubHtml = await fetchHtml(hubUrl, { 'Referer': mUrl }, 5000);
                const gamerMatch = hubHtml.match(/href="(https?:\/\/gamerxyt\.com\/hubcloud\.php[^"]+)"/i);
                if (!gamerMatch) continue;

                const gamerUrl = gamerMatch[1].replace(/&amp;/g, '&');
                const gamerHtml = await fetchHtml(gamerUrl, { 'Referer': hubUrl }, 5000);

                const r2Match = gamerHtml.match(/href="([^"]*r2\.cloudflarestorage\.com[^"]*)"/i);
                if (r2Match) {
                    const directR2 = r2Match[1].replace(/&amp;/g, '&');
                    streams.push({
                        name: `💎 [Cloudflare R2] ${qualityLabel}`,
                        title: `MoviesDrive • ${qualityLabel} High-Speed Direct Stream (Multi-Audio)`,
                        url: directR2,
                        isWebPlayable: true,
                        behaviorHints: {
                            notWebReady: false,
                            proxyHeaders: {
                                request: {
                                    'Referer': 'https://hbplay.pages.dev/',
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                                }
                            }
                        }
                    });
                }

                const pxMatch = gamerHtml.match(/href="([^"]*pixeldrain\.dev\/u\/[a-zA-Z0-9]+)"/i);
                if (pxMatch) {
                    const pxId = pxMatch[1].split('/u/')[1];
                    streams.push({
                        name: `⚡ [PixelDrain CDN] ${qualityLabel}`,
                        title: `MoviesDrive • ${qualityLabel} PixelDrain Direct CDN`,
                        url: `https://pixeldrain.com/api/file/${pxId}`,
                        isWebPlayable: true,
                        behaviorHints: { notWebReady: false }
                    });
                }
            } catch (e) {}
        }
        return { streams };
    } catch(err) {
        console.error(`Error resolving MoviesDrive stream for ${slug}:`, err.message);
        return { streams: [] };
    }
}

// ========================================================
// 👑 Native In-House Scraper: UHDMovies 4K UHD & 2160p HEVC Provider
// ========================================================
async function getNativeUHDMoviesCatalog(query = '') {
    const q = (query || '2026').trim();
    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.UHDMovies || 'https://uhdmovies.beauty';
        const searchUrl = `${baseDomain}/?s=${encodeURIComponent(q)}`;
        const html = await fetchHtml(searchUrl, { 'Referer': baseDomain }, 6000);

        const regex = /<a\s+href="([^"]*download-[^"]*)"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<img[^>]+src="([^"]*)"/gi;
        let match;
        const metas = [];
        const seenSlugs = new Set();

        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const rawTitle = match[2];
            const poster = match[3];

            if (href && rawTitle && href.includes('/download-')) {
                const slug = href.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '').replace(/\/$/, '');
                if (slug && !seenSlugs.has(slug)) {
                    seenSlugs.add(slug);
                    const cleanTitle = rawTitle.replace(/^Download\s+/i, '').replace(/&#038;/g, '&').trim();
                    const isSeries = slug.includes('season') || cleanTitle.toLowerCase().includes('season') || cleanTitle.toLowerCase().includes('series');
                    const fullPoster = poster.startsWith('http') ? poster : `${baseDomain}${poster}`;

                    metas.push({
                        id: `native:uhd:${slug}`,
                        name: cleanTitle,
                        type: isSeries ? 'series' : 'movie',
                        poster: fullPoster,
                        background: fullPoster,
                        description: `${cleanTitle} • Premium 4K UHD, 2160p HEVC, 10Bit HDR & Dual Audio from UHDMovies.`,
                        genres: isSeries ? ['Web Series', '4K UHD'] : ['Movie', '4K UHD', 'Dual Audio']
                    });
                }
            }
        }
        return metas;
    } catch (err) {
        console.error('Error fetching UHDMovies catalog:', err.message);
        return [];
    }
}

// ========================================================
// 🎨 Native In-House Scraper: Toonstream Multi-Language Cartoons & Anime
// ========================================================
let cachedToonstreamCatalog = null;
let lastToonstreamCatalogFetch = 0;

async function getNativeToonstreamCatalog(query = '') {
    const now = Date.now();
    if (!query && cachedToonstreamCatalog && (now - lastToonstreamCatalogFetch < 900000)) {
        return cachedToonstreamCatalog;
    }
    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.toonstream || 'https://toonstream.us';
        const targetUrl = query ? `${baseDomain}/?s=${encodeURIComponent(query)}` : `${baseDomain}/category/hindi/`;
        const html = await fetchHtml(targetUrl, { 'Referer': baseDomain }, 6000);

        const regex = /<article[^>]*>[\s\S]*?<a\s+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/gi;
        let match;
        const metas = [];
        const seenSlugs = new Set();

        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const poster = match[2];
            const rawTitle = match[3];

            if (href && rawTitle && !href.includes('/category/') && !href.includes('/tag/')) {
                const slug = href.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '').replace(/\/$/, '');
                if (slug && !seenSlugs.has(slug)) {
                    seenSlugs.add(slug);
                    const cleanTitle = rawTitle.replace(/&#038;/g, '&').trim();
                    const fullPoster = poster.startsWith('http') ? poster : `${baseDomain}${poster}`;

                    metas.push({
                        id: `native:toonstream:${slug}`,
                        name: cleanTitle,
                        type: 'series',
                        poster: fullPoster,
                        background: fullPoster,
                        description: `${cleanTitle} • Classic & Modern Hindi/Tamil/Telugu Dubbed Cartoons & Anime from Toonstream.`,
                        genres: ['Cartoon', 'Animation', 'Hindi Dubbed']
                    });
                }
            }
        }

        if (!query && metas.length > 0) {
            cachedToonstreamCatalog = metas;
            lastToonstreamCatalogFetch = now;
        }
        return metas;
    } catch (err) {
        console.error('Error fetching Toonstream catalog:', err.message);
        return cachedToonstreamCatalog || [];
    }
}


// ========================================================
// 🔴 YogTube: Ad-Free SmartTube & YouTube Streaming Engine
// ========================================================
const PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.leptons.xyz',
    'https://piped-api.garudalinux.org'
];

let cachedYogTubeTrending = { data: null, timestamp: 0 };
const cachedYogTubeSearch = new Map();

async function getPipedTrending() {
    const now = Date.now();
    if (cachedYogTubeTrending.data && (now - cachedYogTubeTrending.timestamp < 300000)) { // 5 mins
        return cachedYogTubeTrending.data;
    }

    for (const base of PIPED_INSTANCES) {
        try {
            const url = `${base}/trending?region=IN`;
            const data = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
            if (Array.isArray(data) && data.length > 0) {
                const items = data.slice(0, 30).map(i => {
                    const videoId = (i.url || '').replace('/watch?v=', '');
                    return {
                        id: videoId,
                        title: i.title || 'YouTube Video',
                        uploader: i.uploaderName || '',
                        uploaderAvatar: i.uploaderAvatar || '',
                        thumbnail: i.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        duration: i.duration ? Math.floor(i.duration / 60) + ' min' : 'Video',
                        views: i.views ? (i.views > 1000000 ? (i.views / 1000000).toFixed(1) + 'M' : (i.views / 1000).toFixed(0) + 'K') : ''
                    };
                });
                cachedYogTubeTrending.data = items;
                cachedYogTubeTrending.timestamp = now;
                return items;
            }
        } catch (e) {}
    }
    return cachedYogTubeTrending.data || [];
}

async function getPipedSearch(query) {
    const q = (query || '').trim();
    if (!q) return getPipedTrending();

    const cacheKey = q.toLowerCase();
    const cached = cachedYogTubeSearch.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 600000)) { // 10 mins
        return cached.items;
    }

    for (const base of PIPED_INSTANCES) {
        try {
            const url = `${base}/search?q=${encodeURIComponent(q)}&filter=all`;
            const data = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
            const rawItems = (data.items || []).filter(i => i.type === 'stream' || (i.url && i.url.includes('/watch?v=')));
            if (rawItems.length > 0) {
                const items = rawItems.slice(0, 30).map(i => {
                    const videoId = (i.url || '').replace('/watch?v=', '');
                    return {
                        id: videoId,
                        title: i.title || 'YouTube Video',
                        uploader: i.uploaderName || '',
                        uploaderAvatar: i.uploaderAvatar || '',
                        thumbnail: i.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        duration: i.duration ? Math.floor(i.duration / 60) + ' min' : 'Video',
                        views: i.views ? (i.views > 1000000 ? (i.views / 1000000).toFixed(1) + 'M' : (i.views / 1000).toFixed(0) + 'K') : ''
                    };
                });
                cachedYogTubeSearch.set(cacheKey, { timestamp: Date.now(), items });
                return items;
            }
        } catch (e) {}
    }
    return [];
}

// ========================================================
// ⚔️ Native In-House Scraper: AniKoto Multi-Audio Direct HLS Extractor (Reverse-Engineered from CS3 & MegaPlay AES)
// ========================================================
function decryptMegaPlay(enc) {
    if (!enc || typeof enc !== 'string') return null;
    try {
        let b64 = enc.replace(/-/g, '+').replace(/_/g, '/');
        const rem = b64.length % 4;
        if (rem) {
            b64 += '='.repeat(4 - rem);
        }
        const ciphertext = Buffer.from(b64, 'base64');
        const key = Buffer.alloc(32);
        Buffer.from("i?LMTAx0Q6,:}50U", 'utf8').copy(key);
        const iv = Buffer.from("W0;27ToaUpl_P%'c", 'utf8');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(ciphertext, null, 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (err) {
        console.error('MegaPlay decryption error:', err.message);
        return null;
    }
}

const NATIVE_CARTOONS_AND_ANIME_CATALOG = [
    {
        "id": "native:cartoon:doraemon",
        "name": "Doraemon",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/321/803650.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/321/803650.jpg",
        "imdbRating": "8.8",
        "description": "A robot cat Doraemon is sent back in time to help make Nobita Nobi, a boy without much talent, a better person.",
        "genres": [
            "Cartoon",
            "Kids",
            "Comedy",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:shinchan",
        "name": "Crayon Shin-chan",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/116/291841.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/116/291841.jpg",
        "imdbRating": "5.7",
        "description": "Young Shinnosuke, or Shin-chan for short, is a very creative young boy that lives with his eccentric parents, Misae and Hiroshi, as well as his Prima Donna younger sister, Himawari",
        "genres": [
            "Cartoon",
            "Kids",
            "Comedy",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:ben-10",
        "name": "Ben 10",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/80/201155.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/80/201155.jpg",
        "imdbRating": "6.9",
        "description": "Cartoon Network's fresh take on Ben 10 will center upon a new animated series re-introducing the energetic, fun-loving, 10-year-old Ben Tennyson. At the core of the new Ben is a he",
        "genres": [
            "Cartoon",
            "Kids",
            "Action",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:pokemon",
        "name": "Pok\u00e9mon",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/630/1576025.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/630/1576025.jpg",
        "imdbRating": "7.4",
        "description": "Pocket Monsters, or Pok\u00e9mon for short. These are<br />the mysterious and wondrous creatures of this planet. They can be seen everywhere in the world\u2014in the sky, in the sea, in the ",
        "genres": [
            "Cartoon",
            "Kids",
            "Adventure",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:oggy-and-the-cockroaches",
        "name": "Oggy et les Cafards",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/417/1043665.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/417/1043665.jpg",
        "imdbRating": "7.6",
        "description": "The show centers on Oggy, a content and lazy, albeit very tender fat blue cat, who would usually spend his days watching TV and cooking - if it wasn't for the three pesky roaches i",
        "genres": [
            "Cartoon",
            "Kids",
            "Comedy",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:dragon-ball-z",
        "name": "Dragon Ball Z",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/11/29190.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/11/29190.jpg",
        "imdbRating": "8",
        "description": "Part 2 of the Dragonball madness, this story starts when Goku is an adult and introduces him to his Saiyan origin. The main theme of Dragonball Z is fighting although it still reta",
        "genres": [
            "Anime",
            "Action",
            "Shonen",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:naruto",
        "name": "Naruto",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/3/9744.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/3/9744.jpg",
        "imdbRating": "7.8",
        "description": "Naruto closely follows the life of a boy who is feared and detested by the villagers of the hidden leaf village of Konoha. The distrust of the boy has little to do with the boy him",
        "genres": [
            "Anime",
            "Action",
            "Ninja",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:tom-and-jerry",
        "name": "Tom and Jerry",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/483/1209807.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/483/1209807.jpg",
        "imdbRating": "8.8",
        "description": "An all-new Tom and Jerry series produced in Asia: Journey into the heart of Singapore with Tom and Jerry as they weave through the labyrinth of towering estates and skyscrapers and",
        "genres": [
            "Cartoon",
            "Kids",
            "Comedy",
            "Classic"
        ]
    },
    {
        "id": "native:cartoon:ninja-hattori",
        "name": "Ninja Hattori-Kun",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/83/207765.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/83/207765.jpg",
        "imdbRating": "8.8",
        "description": "10-year old Ken'ichi Mitsuba is an average kid who goes to elementary school and struggles with his studies. Meanwhile a little ninja named Kanzo Hattori, Shishi-maru (a ninja dog)",
        "genres": [
            "Cartoon",
            "Kids",
            "Comedy",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:beyblade",
        "name": "Beyblade",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/253/634524.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/253/634524.jpg",
        "imdbRating": "6.4",
        "description": "Thirteen-year-old Tyson Granger (Takao Kinomiya), along with his fellow teammates, Kai Hiwatari, Max Tate (Max Mizuhura), and Ray Kon (Rei Kon), strive to become the greatest Beybl",
        "genres": [
            "Anime",
            "Kids",
            "Action",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:spiderman-animated",
        "name": "Spider-Man",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/8/21945.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/8/21945.jpg",
        "imdbRating": "8.1",
        "description": "Spider-Man (1994) tells the story of a 19-year-old Peter Parker in his first year at Empire State University, and his alter-ego Spider-Man. The show features Spider-Man's classic v",
        "genres": [
            "Cartoon",
            "Action",
            "Superhero",
            "Marvel"
        ]
    },
    {
        "id": "native:cartoon:batman-animated",
        "name": "Batman: The Animated Series",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/80/202273.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/80/202273.jpg",
        "imdbRating": "8.5",
        "description": "Experience the thrills of vigilante justice as millionaire playboy Bruce Wayne and alter-ego Batman protect the streets of Gotham City from a host of villains including archnemesis",
        "genres": [
            "Cartoon",
            "Action",
            "Superhero",
            "DC"
        ]
    },
    {
        "id": "native:cartoon:avatar-the-last-airbender",
        "name": "Avatar: The Last Airbender",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/633/1582667.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/633/1582667.jpg",
        "imdbRating": "7.4",
        "description": "A young boy known as the Avatar must master the four elemental powers to save a world at war \u2014 and fight a ruthless enemy bent on stopping him.",
        "genres": [
            "Cartoon",
            "Anime",
            "Action",
            "Adventure"
        ]
    },
    {
        "id": "native:cartoon:phineas-and-ferb",
        "name": "Phineas and Ferb",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/595/1489325.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/595/1489325.jpg",
        "imdbRating": "7.3",
        "description": "Phineas and Ferb are Phineas Flynn and his stepbrother, Ferb Fletcher who are determined to make every day of their summer vacation fun. They try building a full-scale roller coast",
        "genres": [
            "Cartoon",
            "Kids",
            "Comedy",
            "Disney"
        ]
    },
    {
        "id": "native:cartoon:courage-the-cowardly-dog",
        "name": "Courage the Cowardly Dog",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/609/1523655.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/609/1523655.jpg",
        "imdbRating": "7.8",
        "description": "The things he does for love! Welcome to the middle of Nowhere, Kansas. Population: one kind old lady, one crabby old man, one timid dog and all sorts of creepy creatures, scary mon",
        "genres": [
            "Cartoon",
            "Kids",
            "Horror",
            "Comedy"
        ]
    },
    {
        "id": "native:cartoon:scooby-doo",
        "name": "Scooby-Doo! Mystery Incorporated",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/14/36568.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/14/36568.jpg",
        "imdbRating": "8",
        "description": "A sleepy little village, Crystal Cove boasts a long history of ghost sightings, poltergeists, demon possessions, phantoms and other paranormal occurrences. The renowned sleuthing t",
        "genres": [
            "Cartoon",
            "Kids",
            "Mystery",
            "Comedy"
        ]
    },
    {
        "id": "native:cartoon:motu-patlu",
        "name": "Motu Patlu",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/147/369024.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/147/369024.jpg",
        "imdbRating": "8.8",
        "description": "Motu Patlu is an Indian animated children's television series about two friends, a rotund man named Motu and a skinny one named Patlu, living in the fictional city Furfuri Nagar. I",
        "genres": [
            "Cartoon",
            "Kids",
            "Comedy",
            "Hindi Dubbed"
        ]
    },
    {
        "id": "native:cartoon:dexters-laboratory",
        "name": "Dexter's Laboratory",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/11/27891.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/11/27891.jpg",
        "imdbRating": "7.3",
        "description": "Deep in the depths of his secret laboratory, boy genius Dexter computes, experiments, invents and builds incredible creations like mom robots, interdimensional portals, talking ani",
        "genres": [
            "Cartoon",
            "Kids",
            "Comedy",
            "Classic"
        ]
    },
    {
        "id": "native:cartoon:powerpuff-girls",
        "name": "The Powerpuff Girls",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/11/27896.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/11/27896.jpg",
        "imdbRating": "6.9",
        "description": "The Powerpuff Girls is an award-winning animated action series about three super-powered little girls Bubbles, Blossom and Buttercup with one very big mission: saving the world bef",
        "genres": [
            "Cartoon",
            "Kids",
            "Action",
            "Superhero"
        ]
    },
    {
        "id": "native:cartoon:transformers",
        "name": "Transformers",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/62/156745.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/62/156745.jpg",
        "imdbRating": "7.7",
        "description": "Transformers is an animated television series depicting a war between giant robots who could transform into vehicles, animals, and other objects.",
        "genres": [
            "Cartoon",
            "Action",
            "Sci-Fi"
        ]
    },
    {
        "id": "native:cartoon:teen-titans",
        "name": "Teen Titans",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/6/15290.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/6/15290.jpg",
        "imdbRating": "7.3",
        "description": "Five teen superheroes led by Robin the Boy Wonder team up to protect Earth from a new generation of villains. His partners are Starfire, an alien who can fly; Cyborg, a half-human,",
        "genres": [
            "Cartoon",
            "Action",
            "Superhero",
            "DC"
        ]
    },
    {
        "id": "native:cartoon:demon-slayer",
        "name": "Demon Slayer",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/456/1140750.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/456/1140750.jpg",
        "imdbRating": "7.9",
        "description": "Since ancient times, rumors have abounded of man-eating demons lurking in the woods. Because of this, the local townsfolk never venture outside at night. Legend has it that a demon",
        "genres": [
            "Anime",
            "Action",
            "Dark Fantasy",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:jujutsu-kaisen",
        "name": "Jujutsu Kaisen",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/608/1521905.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/608/1521905.jpg",
        "imdbRating": "7.6",
        "description": "Although Yuji Itadori looks like your average teenager, his immense physical strength is something to behold! Every sports club wants him to join, but Itadori would rather hang out",
        "genres": [
            "Anime",
            "Action",
            "Supernatural",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:solo-leveling",
        "name": "Solo Leveling",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/497/1244908.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/497/1244908.jpg",
        "imdbRating": "8",
        "description": "Ten years ago, \"the Gate\" appeared and connected the real world with the realm of magic and monsters. To combat these vile beasts, ordinary people received superhuman powers and be",
        "genres": [
            "Anime",
            "Action",
            "Fantasy",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:one-piece",
        "name": "One Piece",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/617/1543011.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/617/1543011.jpg",
        "imdbRating": "7.7",
        "description": "With his straw hat and ragtag crew, young pirate Monkey D. Luffy goes on an epic voyage for treasure in this live-action adaptation of the popular manga.",
        "genres": [
            "Anime",
            "Action",
            "Adventure",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:death-note",
        "name": "Death Note",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/499/1249019.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/499/1249019.jpg",
        "imdbRating": "8.8",
        "description": "Death Note is an anime series based around a manga of the same name whereby a human finds a death god's notebook. Any person's name written in this notebook will die. The main char",
        "genres": [
            "Anime",
            "Mystery",
            "Psychological",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:attack-on-titan",
        "name": "Attack on Titan",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/632/1582290.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/632/1582290.jpg",
        "imdbRating": "8.9",
        "description": "Known in Japan as Shingeki no Kyojin, many years ago, the last remnants of humanity were forced to retreat behind the towering walls of a fortified city to escape the massive, man-",
        "genres": [
            "Anime",
            "Action",
            "Dark Fantasy",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:chainsaw-man",
        "name": "Chainsaw Man",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/422/1056726.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/422/1056726.jpg",
        "imdbRating": "7.8",
        "description": "Denji has a simple dream\u2014to live a happy and peaceful life, spending time with a girl he likes. This is a far cry from reality, however, as Denji is forced by the yakuza into killi",
        "genres": [
            "Anime",
            "Action",
            "Gore",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:bleach",
        "name": "Bleach",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/459/1148800.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/459/1148800.jpg",
        "imdbRating": "7.9",
        "description": "Ichigo Kurosaki is a teenager gifted with the ability to see spirits. His life is drastically changed by the sudden appearance of a Soul Reaper\u2014one who governs the flow of souls be",
        "genres": [
            "Anime",
            "Action",
            "Supernatural",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:dragon-ball-super",
        "name": "Dragon Ball Super",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/498/1247253.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/498/1247253.jpg",
        "imdbRating": "7.8",
        "description": "Dragon Ball Super, a brand new television anime inspired by Akira Toriyama's Dragon Ball manga, will premiere on Fuji TV and other channels in July on Sundays at 9:00 a.m. This wil",
        "genres": [
            "Anime",
            "Action",
            "Shonen",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:hunter-x-hunter",
        "name": "Hunter x Hunter",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/223/559165.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/223/559165.jpg",
        "imdbRating": "8.6",
        "description": "Remake of the 1999 TV series of Hunter x Hunter based on the manga by Togashi Yoshihiro. A Hunter is one who travels the world doing all sorts of dangerous tasks. From capturing cr",
        "genres": [
            "Anime",
            "Action",
            "Adventure",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:spy-x-family",
        "name": "Spy\u00d7Family",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/590/1477119.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/590/1477119.jpg",
        "imdbRating": "7.4",
        "description": "Master spy Twilight is the best at what he does when it comes to going undercover on dangerous missions in the name of a better world. But when he receives the ultimate impossible ",
        "genres": [
            "Anime",
            "Comedy",
            "Action",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:tokyo-ghoul",
        "name": "Tokyo Ghoul",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/604/1510953.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/604/1510953.jpg",
        "imdbRating": "7.4",
        "description": "The story follows Ken Kaneki, a college student who meets a woman named Rize Kamishiro at Anteiku, a coffee shop. They share an interest in literature and plan a date. While walkin",
        "genres": [
            "Anime",
            "Action",
            "Dark Fantasy",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:fullmetal-alchemist-brotherhood",
        "name": "Fullmetal Alchemist: Brotherhood",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/485/1214095.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/485/1214095.jpg",
        "imdbRating": "7.8",
        "description": "Fullmetal Alchemist: Brotherhood is set in a fictional world where alchemy \u2013 the transmutation of raw materials into objects \u2013 is science, and the way of life. The series follows t",
        "genres": [
            "Anime",
            "Action",
            "Adventure",
            "Sub & Dub"
        ]
    },
    {
        "id": "native:cartoon:my-hero-academia",
        "name": "My Hero Academia",
        "type": "series",
        "poster": "https://static.tvmaze.com/uploads/images/original_untouched/599/1499141.jpg",
        "background": "https://static.tvmaze.com/uploads/images/original_untouched/599/1499141.jpg",
        "imdbRating": "7.5",
        "description": "People are not born equal, a realization that 4-year-old Midoriya Izuku faced when bullied by his classmates who had unique special powers. Izuku was one of the rare cases where he",
        "genres": [
            "Anime",
            "Action",
            "Superhero",
            "Sub & Dub"
        ]
    }
];

async function getNativeCartoonsCatalog() {
    return NATIVE_CARTOONS_AND_ANIME_CATALOG;
}

let cachedAniKotoCatalog = null;
let lastAniKotoCatalogFetch = 0;

async function getNativeAniKotoCatalog() {
    const now = Date.now();
    if (cachedAniKotoCatalog && (now - lastAniKotoCatalogFetch < 900000)) { // 15 mins cache
        return cachedAniKotoCatalog;
    }

    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.anikoto || 'https://anikototv.to';

        const pagesToFetch = [
            `${baseDomain}/home`,
            `${baseDomain}/filter?sort=trending&page=1`,
            `${baseDomain}/filter?sort=trending&page=2`
        ];

        const htmlResults = await Promise.allSettled(pagesToFetch.map(url => fetchHtml(url).catch(() => '')));
        const items = [];
        const seenSlugs = new Set();

        htmlResults.forEach(res => {
            const html = res.status === 'fulfilled' ? res.value : '';
            if (!html) return;

            // Pattern 1: Home page cards
            const cardMatches = html.match(/<div class="item">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi) || [];
            for (const card of cardMatches) {
                const aMatch = /href="https?:\/\/[^\/]+\/watch\/([^"/?]+)(?:\/[^"]*)?"/i.exec(card);
                let imgMatch = /src="([^"]+)"\s*alt="([^"]+)"/i.exec(card) || /alt="([^"]+)"\s*src="([^"]+)"/i.exec(card);
                if (aMatch && imgMatch) {
                    const slug = aMatch[1].trim();
                    let title = (imgMatch[2] || imgMatch[1]).replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim();
                    let poster = imgMatch[1].startsWith('http') ? imgMatch[1] : imgMatch[2];
                    if (slug && !seenSlugs.has(slug)) {
                        seenSlugs.add(slug);
                        items.push({
                            id: `native:anikoto:${slug}`,
                            name: title,
                            type: 'series',
                            poster: poster,
                            background: poster,
                            description: `${title} • Multi-Audio Anime with Japanese SUB & English DUB direct HLS master streams.`,
                            genres: ['Anime', 'Animation', 'Action', 'Sub & Dub']
                        });
                    }
                }
            }

            // Pattern 2: Filter page cards
            const filterRegex = /<a\s+[^>]*href="https?:\/\/[^\/]+\/watch\/([^"/?]+)(?:\/ep-[0-9]+)?"[^>]*>\s*<img\s+[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gi;
            let m;
            while ((m = filterRegex.exec(html)) !== null) {
                const slug = m[1].trim();
                let poster = m[2];
                let title = m[3].replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim();
                if (slug && !seenSlugs.has(slug)) {
                    seenSlugs.add(slug);
                    items.push({
                        id: `native:anikoto:${slug}`,
                        name: title,
                        type: 'series',
                        poster: poster,
                        background: poster,
                        description: `${title} • High-definition Anime Master with Multi-Audio SUB & DUB streams.`,
                        genres: ['Anime', 'Animation', 'Trending', 'Sub & Dub']
                    });
                }
            }
        });

        if (items.length > 0) {
            cachedAniKotoCatalog = items;
            lastAniKotoCatalogFetch = now;
            return items;
        }
    } catch(err) {
        console.error('Error fetching native AniKoto catalog:', err.message);
    }
    return cachedAniKotoCatalog || [];
}

const getNativeAnimeWorldCatalog = getNativeAniKotoCatalog;

async function getNativeAniKotoStreams(rawSlug) {
    console.log(`[AniKoto] Resolving stream for slug: ${rawSlug}`);
    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.anikoto || 'https://anikototv.to';

        let animeSlug = rawSlug || '';
        let epNum = '1';
        if (animeSlug.includes(':')) {
            const parts = animeSlug.split(':');
            animeSlug = parts[0];
            if (parts.length >= 3) {
                epNum = parts[2];
            } else if (parts.length === 2) {
                epNum = parts[1];
            }
        } else if (animeSlug.includes('/ep-')) {
            const parts = animeSlug.split('/ep-');
            animeSlug = parts[0];
            epNum = parts[1];
        }
        animeSlug = animeSlug.replace(/\.json$/, '').replace(/^\//, '').replace(/\/$/, '');

        const watchUrl = `${baseDomain}/watch/${animeSlug}`;
        const watchHtml = await fetchHtml(watchUrl);
        const idMatch = /data-id="([0-9]+)"/i.exec(watchHtml);
        if (!idMatch) {
            console.warn(`[AniKoto] data-id not found for ${watchUrl}`);
            return { streams: [] };
        }
        const animeId = idMatch[1];

        const epListRes = await fetchJson(`${baseDomain}/ajax/episode/list/${animeId}`, {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': watchUrl
        });
        const epHtml = epListRes?.result || '';

        let targetIds = '';
        let foundEpNum = epNum;
        const epRegex = new RegExp(`<a href="#"[^>]*data-num="${epNum}"[^>]*data-ids="([^"]+)"`, 'i');
        let epMatch = epRegex.exec(epHtml);
        if (!epMatch) {
            epMatch = /<a href="#"[^>]*data-num="([^"]+)"[^>]*data-ids="([^"]+)"/i.exec(epHtml);
            if (epMatch) {
                foundEpNum = epMatch[1];
                targetIds = epMatch[2];
            }
        } else {
            targetIds = epMatch[1];
        }

        if (!targetIds) {
            console.warn(`[AniKoto] No episode items found for animeId ${animeId}`);
            return { streams: [] };
        }

        const serverListRes = await fetchJson(`${baseDomain}/ajax/server/list?servers=${encodeURIComponent(targetIds)}`, {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': watchUrl
        });
        const serverHtml = serverListRes?.result || '';

        const servers = [];
        const typeSections = serverHtml.split(/data-type=["']/i);
        for (const sec of typeSections) {
            const mode = sec.toLowerCase().startsWith('sub') ? 'SUB' : (sec.toLowerCase().startsWith('dub') ? 'DUB' : null);
            if (!mode) continue;
            const itemRegex = /data-link-id=["']([^"']+)["'][^>]*>([^<]+)<\/li>/gi;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(sec)) !== null) {
                servers.push({
                    mode,
                    server: itemMatch[2].trim(),
                    linkId: itemMatch[1]
                });
            }
        }

        if (servers.length === 0) {
            const anyRegex = /data-link-id=["']([^"']+)["'][^>]*>([^<]+)<\/li>/gi;
            let m;
            while ((m = anyRegex.exec(serverHtml)) !== null) {
                servers.push({
                    mode: 'SUB',
                    server: m[2].trim(),
                    linkId: m[1]
                });
            }
        }

        const streams = [];
        const selectedServers = [];
        let subCount = 0;
        let dubCount = 0;
        for (const s of servers) {
            if (s.mode === 'SUB' && subCount < 2) {
                selectedServers.push(s);
                subCount++;
            } else if (s.mode === 'DUB' && dubCount < 2) {
                selectedServers.push(s);
                dubCount++;
            }
        }

        for (const s of selectedServers) {
            try {
                const sIframe = await fetchJson(`${baseDomain}/ajax/server?get=${encodeURIComponent(s.linkId)}`, {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': watchUrl
                });
                const embedUrl = sIframe?.result?.url || '';
                if (!embedUrl) continue;

                let fileId = null;
                const sParam = embedUrl.includes('?s=') ? embedUrl.split('?s=')[1].split('&')[0] : 'tcdn';

                try {
                    const embedHtml = await fetchHtml(embedUrl, {
                        'Referer': `${baseDomain}/`,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                    });
                    const fileIdMatch = /File\s+([0-9]+)/i.exec(embedHtml);
                    if (fileIdMatch) {
                        fileId = fileIdMatch[1];
                    }
                } catch(ehErr) {}

                if (!fileId) {
                    const streamIdMatch = /\/(?:stream|embed)\/[^\/]+\/([^/?]+)/i.exec(embedUrl);
                    if (streamIdMatch) fileId = streamIdMatch[1];
                }

                let srcData = null;
                if (fileId) {
                    try {
                        srcData = await fetchJson(`https://megaplay.buzz/stream/getSources?id=${fileId}&platform=OTHER&s=${sParam}`, {
                            'X-Requested-With': 'XMLHttpRequest',
                            'Referer': embedUrl
                        });
                    } catch(srcErr) {
                        try {
                            srcData = await fetchJson(`https://megaplay.buzz/stream/getSources?id=${fileId}`, {
                                'X-Requested-With': 'XMLHttpRequest',
                                'Referer': embedUrl
                            });
                        } catch(e2) {}
                    }
                }

                let decrypted = null;
                if (srcData && srcData.enc) {
                    decrypted = decryptMegaPlay(srcData.enc);
                }

                if (decrypted && decrypted.file) {
                    const subTracks = (srcData.tracks || []).map(t => ({
                        id: t.file,
                        url: t.file,
                        lang: t.label || 'English'
                    }));

                    streams.push({
                        name: `⚔️ AniKoto ${s.mode} • ${s.server}`,
                        title: `Episode ${foundEpNum} • Direct HLS Master (1080p Multi-Track)`,
                        url: decrypted.file,
                        behaviorHints: {
                            notWebReady: false,
                            proxyHeaders: {
                                request: {
                                    'Referer': 'https://megaplay.buzz/',
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                                }
                            }
                        },
                        subtitles: subTracks
                    });
                } else if (embedUrl) {
                    streams.push({
                        name: `⚔️ AniKoto ${s.mode} • ${s.server}`,
                        title: `Episode ${foundEpNum} • Cloud Stream (${s.server} Mirror)`,
                        url: embedUrl,
                        behaviorHints: {
                            notWebReady: false
                        }
                    });
                }
            } catch (sErr) {
                console.warn(`[AniKoto] Server error ${s.mode} ${s.server}:`, sErr.message);
            }
        }

        return { streams };
    } catch(err) {
        console.error(`Error resolving AniKoto stream for ${rawSlug}:`, err.message);
        return { streams: [] };
    }
}

const getNativeAnimeWorldStreams = getNativeAniKotoStreams;

async function getNativeCartoonStreams(rawSlug) {
    const slug = (rawSlug || '').replace('native:cartoon:', '').toLowerCase();
    const keywordMap = {
        'doraemon': 'doraemon',
        'pokemon': 'pokemon',
        'shinchan': 'shinchan',
        'naruto': 'naruto',
        'dragon-ball-z': 'dragon ball z',
        'dragon-ball-super': 'dragon ball super',
        'ben-10': 'ben 10',
        'avatar-the-last-airbender': 'avatar the last airbender',
        'one-piece': 'one piece',
        'demon-slayer': 'demon slayer',
        'jujutsu-kaisen': 'jujutsu kaisen',
        'solo-leveling': 'solo leveling',
        'attack-on-titan': 'attack on titan',
        'chainsaw-man': 'chainsaw man',
        'death-note': 'death note',
        'bleach': 'bleach',
        'hunter-x-hunter': 'hunter x hunter',
        'spy-x-family': 'spy x family',
        'tokyo-ghoul': 'tokyo ghoul',
        'fullmetal-alchemist-brotherhood': 'fullmetal alchemist',
        'my-hero-academia': 'my hero academia'
    };

    const keyword = keywordMap[slug] || slug.replace(/-/g, ' ');

    try {
        const domains = await getLiveDomains();
        const baseDomain = domains.anikoto || 'https://anikototv.to';
        const searchHtml = await fetchHtml(`${baseDomain}/filter?keyword=${encodeURIComponent(keyword)}`);
        const match = /href="https?:\/\/[^\/]+\/watch\/([^"/?]+)/i.exec(searchHtml);
        if (match) {
            const matchedSlug = match[1];
            return await getNativeAniKotoStreams(matchedSlug);
        }
    } catch(e) {}

    return await getNativeAniKotoStreams(slug);
}

async function getRebrandedManifest() {
    const now = Date.now();
    if (cachedManifest && (now - lastManifestFetch) < MANIFEST_CACHE_TTL) {
        return cachedManifest;
    }

    try {
        const upstream = await fetchJsonWithFailover('/manifest.json');
        if (upstream && Array.isArray(upstream.catalogs)) {
            // Rebrand catalogs: convert "other" into "movie" so Stremio can display them in Discover
            const rebrandedCatalogs = upstream.catalogs.map(c => {
                let clean = (c.name || '').replace(/•?\s*CNCVerse Bridge/gi, '').replace(/\(other\)|\(tv\)/g, '').trim();
                let type = c.type === 'other' ? 'movie' : c.type;

                if (c.id === 'cnc_CastleTVUseVLC_other') {
                    clean = '🏰 Castle Cinema (Instant Web Play • 1080p)';
                } else if (c.id === 'cnc_Kisskh_other') {
                    clean = '🌟 Kisskh Series & Cinema (Instant Web Play)';
                } else if (c.id === 'cnc_SportzXLiveEvents_tv') {
                    clean = '⚡ SportzX Live Events & Cricket';
                } else if (c.id === 'cnc_SportzXHighlights_tv') {
                    clean = '🎬 SportzX Highlights';
                } else if (c.id === 'cnc_VegaMovies_other') {
                    clean = '🚀 VegaMovies (Ultra HD MKV • Use VLC)';
                } else if (c.id === 'cnc_Rogmovies_other') {
                    clean = '🚀 Rogmovies (Ultra HD MKV • Use VLC)';
                } else if (c.id === 'cnc_4KHDHUB_other') {
                    clean = '🚀 4K HDHUB (Ultra HD MKV • Use VLC)';
                } else if (c.id === 'cnc_HDHub4U_other') {
                    clean = '🚀 HDHub4U (Ultra HD MKV • Use VLC)';
                } else if (c.id === 'cnc_Cinefreak_other') {
                    clean = '🚀 Cinefreak (HD MKV • Use VLC)';
                } else if (c.id === 'cnc_Movies4u_other') {
                    clean = '🚀 Movies4u (HD MKV • Use VLC)';
                } else if (c.id === 'cnc_RingZ_other') {
                    clean = '🚀 RingZ (HD MKV • Use VLC)';
                } else {
                    clean = `🌟 ${clean}`;
                }

                return {
                    ...c,
                    type: type,
                    name: clean
                };
            });

            // Filter out dead/abandoned NetMirror scrapers upstream (0 streams, blank titles)
            const deadCatalogIds = new Set([
                'cnc_Netflix_other',
                'cnc_PrimeVideo_other',
                'cnc_Hotstar_other',
                'cnc_Disney_other',
                'cnc_Marvel_other',
                'cnc_StarWars_other',
                'cnc_Pixar_other',
                'cnc_Kisskh_other'
            ]);
            const filteredCatalogs = rebrandedCatalogs.filter(c => !deadCatalogIds.has(c.id));

            // Priority sorting: verified working streaming catalogs & live sports first
            const priorityIds = [
                'cnc_CastleTVUseVLC_other',
                'cnc_PlayFyLiveEvents_tv',
                'cnc_PlayFyHighlights_tv',
                'cnc_HDHub4U_other',
                'cnc_Rogmovies_other',
                'cnc_LivXowLiveEvents_tv',
                'cnc_PlayZTVLiveEvents_tv',
                'cnc_JIOTVPlusWW_tv',
                'cnc_ReANIME_Reanime_other',
                'cnc_RingZ_other',
                'cnc_IPTV_tv',
                'cnc_MovieBoxIN_other',
                'cnc_MultiMovies_other',
                'cnc_SportzXLiveEvents_tv',
                'cnc_SportzXHighlights_tv'
            ];

            filteredCatalogs.sort((a, b) => {
                const idxA = priorityIds.indexOf(a.id);
                const idxB = priorityIds.indexOf(b.id);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return 0;
            });

                        // Prepend Native In-House Scraper Catalog (Reverse-Engineered from CS3)
            const nativeSportsCatalog = {
                type: 'tv',
                id: 'native_live_sports_tv',
                name: '⚡ Live Cricket & Sports (Direct 0ms HD)',
                extra: [
                    { name: 'search', isRequired: false },
                    { name: 'skip', isRequired: false }
                ]
            };
            const nativeHDHubCatalog = {
                type: 'movie',
                id: 'native_hdhub4u_movies',
                name: '💎 HDHub4u (4K & 1080p Direct Engine)',
                extra: [
                    { name: 'search', isRequired: false },
                    { name: 'skip', isRequired: false }
                ]
            };
            const nativeVegaCatalog = {
                type: 'movie',
                id: 'native_vegamovies_movies',
                name: '🍿 VegaMovies (4K HDR & Dual Audio)',
                extra: [
                    { name: 'search', isRequired: false },
                    { name: 'skip', isRequired: false }
                ]
            };
                        const nativeGujaratiCatalog = {
                type: 'movie',
                id: 'native_gujarati_movies',
                name: '🦁 Gujarati Cinema Vault (140+ Blockbusters & Series)',
                extra: [
                    { name: 'search', isRequired: false },
                    { name: 'skip', isRequired: false }
                ]
            };
const nativeAnimeCatalog = {
                type: 'series',
                id: 'native_anikoto_series',
                name: '⚔️ AniKoto & Anime (Multi-Audio HD Anime)',
                extra: [
                    { name: 'search', isRequired: false },
                    { name: 'skip', isRequired: false }
                ]
            };
                        const nativeCartoonsCatalog = {
                type: 'series',
                id: 'native_cartoons_series',
                name: '👶 Kids & Hindi Cartoons (Doraemon, Shinchan, Ben 10)',
                extra: [
                    { name: 'search', isRequired: false },
                    { name: 'skip', isRequired: false }
                ]
            };

const nativeWebSeriesCatalog = {
                type: 'series',
                id: 'native_web_series',
                name: '🔥 Top Trending Web Series (Netflix, Prime, Hotstar)',
                extra: [
                    { name: 'search', isRequired: false },
                    { name: 'skip', isRequired: false }
                ]
            };
            const finalCatalogs = [nativeSportsCatalog, nativeWebSeriesCatalog, nativeAnimeCatalog, nativeCartoonsCatalog, nativeGujaratiCatalog, nativeHDHubCatalog, nativeVegaCatalog, ...filteredCatalogs];
            cachedManifest = {
                id: 'org.yogeshstreamer.addon',
                version: '1.2.1',
                name: 'Yogesh Streamer',
                description: 'Official Multi-Device Addon for Movies, Web Series, Bollywood & Live Sports',
                logo: BRAND_LOGO,
                background: BRAND_LOGO,
                types: ['movie', 'series', 'tv'],
                idPrefixes: ['tt', 'cnc:'],
                catalogs: finalCatalogs,
                resources: [
                    'stream',
                    'catalog',
                    {
                        name: 'meta',
                        types: ['movie', 'series', 'tv'],
                        idPrefixes: ['cnc:']
                    },
                    'subtitles'
                ],
                behaviorHints: {
                    configurable: false,
                    configurationRequired: false,
                    adult: false
                }
            };
            lastManifestFetch = now;
            return cachedManifest;
        }
    } catch (err) {
        console.error('Error fetching upstream manifest:', err.message);
    }

    // Safe fallback if upstream is unreachable
    return {
        id: 'org.yogeshstreamer.addon',
        version: '1.2.1',
        name: 'Yogesh Streamer',
        description: 'Official Multi-Device Addon for Movies, Web Series, Bollywood & Live Sports',
        logo: BRAND_LOGO,
        background: BRAND_LOGO,
        types: ['movie', 'series', 'tv'],
        idPrefixes: ['tt', 'cnc:'],
        resources: ['stream'],
        behaviorHints: {
            configurable: false,
            configurationRequired: false,
            adult: false
        },
        catalogs: []
    };
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function renderLandingHtml(host) {
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const manifestUrl = `${protocol}://${host}/manifest.json`;
    const stremioProtocolUrl = `stremio://${host}/manifest.json`;
    const stremioWebUrl = `https://web.stremio.com/#/addons?addon=${encodeURIComponent(manifestUrl)}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yogesh Streamer • Multi-Device Addon</title>
    <link rel="icon" href="${BRAND_LOGO}">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #0b0914 0%, #000000 100%);
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }
        .card {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 215, 0, 0.28);
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 24px rgba(255, 215, 0, 0.12);
            border-radius: 24px;
            max-width: 640px;
            width: 100%;
            padding: 40px 32px;
            text-align: center;
            backdrop-filter: blur(14px);
        }
        .logo-img {
            width: 100px;
            height: 100px;
            border-radius: 22px;
            object-fit: cover;
            border: 2px solid #FFD700;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.45);
            margin-bottom: 20px;
        }
        h1 {
            font-size: 30px;
            font-weight: 800;
            background: linear-gradient(90deg, #FFD700, #FFA500);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }
        p.subtitle {
            color: #b5b5c0;
            font-size: 15px;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(34, 197, 94, 0.15);
            border: 1px solid #22c55e;
            color: #4ade80;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 28px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 8px #22c55e;
        }
        .btn-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 28px;
        }
        .btn-primary {
            background: linear-gradient(135deg, #FFD700 0%, #D4AF37 100%);
            color: #000000;
            font-weight: 800;
            font-size: 16px;
            padding: 15px 24px;
            border-radius: 14px;
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 4px 16px rgba(255, 215, 0, 0.3);
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(255, 215, 0, 0.5);
        }
        .btn-app {
            background: rgba(255, 255, 255, 0.08);
            color: #ffffff;
            font-weight: 600;
            font-size: 14px;
            padding: 12px 20px;
            border-radius: 12px;
            text-decoration: none;
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: background 0.2s;
        }
        .btn-app:hover {
            background: rgba(255, 255, 255, 0.16);
        }
        .btn-android {
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
            color: #ffffff;
            font-weight: 800;
            font-size: 16px;
            padding: 15px 24px;
            border-radius: 14px;
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 4px 16px rgba(16, 185, 129, 0.35);
        }
        .btn-android:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(16, 185, 129, 0.6);
        }
        .btn-secondary {
            background: transparent;
            color: #d1d5db;
            font-weight: 500;
            font-size: 13px;
            padding: 10px 16px;
            border-radius: 10px;
            border: 1px dashed rgba(255, 215, 0, 0.35);
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-secondary:hover {
            background: rgba(255, 215, 0, 0.08);
            color: #FFD700;
        }
        .guide {
            text-align: left;
            background: rgba(0, 0, 0, 0.45);
            border-radius: 16px;
            padding: 20px 22px;
            margin-top: 8px;
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .guide h3 {
            font-size: 15px;
            color: #FFD700;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .guide ol {
            padding-left: 20px;
            font-size: 13px;
            color: #cccccc;
            line-height: 1.8;
        }
        .guide b {
            color: #ffffff;
        }
        .code-box {
            background: #111;
            padding: 10px 14px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            color: #FFD700;
            word-break: break-all;
            margin-top: 10px;
            border: 1px solid rgba(255, 215, 0, 0.3);
        }
    </style>
</head>
<body>
    <div class="card">
        <img class="logo-img" src="${BRAND_LOGO}" alt="Yogesh Streamer Logo">
        <h1>Yogesh Streamer</h1>
        <p class="subtitle">Official Multi-Device Addon for iPhone, iPad, Mac, Windows, Android & Smart TVs.</p>
        
        <div class="status-badge">
            <span class="status-dot"></span> 24/7 Stremio Cloud Addon Online
        </div>

        <div class="btn-group">
            <a class="btn-primary" href="/app" style="background: linear-gradient(135deg, #00E5FF 0%, #0066FF 100%); color: #FFF; box-shadow: 0 4px 20px rgba(0, 229, 255, 0.4);">
                ✨ Launch Standalone Web App (No Stremio Needed)
            </a>
            <a class="btn-android" href="${ANDROID_APK_URL}">
                🤖 Download Native Android App (APK v5.6.1)
            </a>
            <a class="btn-primary" href="${stremioWebUrl}" target="_blank">📱 1-Tap Install in Stremio Web (iOS / Mac / PC)</a>
            <a class="btn-app" href="${stremioProtocolUrl}">🚀 Open in Stremio App (Android / Windows / Linux)</a>
            <button class="btn-secondary" onclick="navigator.clipboard.writeText('${manifestUrl}'); alert('Copied Manifest URL to Clipboard!')">📋 Copy Addon Manifest URL</button>
        </div>

        <div class="guide" style="border-color: rgba(16, 185, 129, 0.4); margin-top: 14px; background: rgba(6, 78, 59, 0.15);">
            <h3 style="color: #34d399;">🤖 Native Android App (Phone, Tablet, Google TV, Fire TV)</h3>
            <p style="font-size: 13px; color: #b5b5c0; margin-bottom: 12px;">High-performance native Android app built with Google Media3 ExoPlayer hardware decoding for seamless 4K/1080p playback and live streams.</p>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <a href="${ANDROID_APK_URL}" style="flex: 1; min-width: 170px; background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #fff; text-decoration: none; padding: 12px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; text-align: center; display: inline-block;">
                    ⬇️ Download APK v5.6.1 (Direct)
                </a>
                <a href="${ANDROID_RELEASES_URL}" target="_blank" style="flex: 1; min-width: 140px; background: rgba(255,255,255,0.08); color: #fff; text-decoration: none; padding: 12px 16px; border-radius: 10px; font-weight: 600; font-size: 13px; text-align: center; border: 1px solid rgba(255,255,255,0.2); display: inline-block;">
                    📦 GitHub Releases
                </a>
            </div>
            <div class="code-box" style="border-color: rgba(16, 185, 129, 0.4); color: #4ade80;">TV Downloader short link: ${ANDROID_SHORT_URL}</div>
        </div>

        <div class="guide">
            <h3>📱 iPhone & iPad (iOS) 2-Minute Setup</h3>
            <ol>
                <li>Install <b>Outplayer</b> or <b>VLC</b> free from the iOS App Store.</li>
                <li>In Safari on your iPhone, visit <b>web.stremio.com</b>.</li>
                <li>Tap Safari Share button (square with arrow up) ➔ <b>Add to Home Screen</b>.</li>
                <li>In Stremio Web: Go to <b>Settings ➔ Player</b> ➔ Set <i>External Player</i> to <b>Outplayer</b>.</li>
                <li>Click the gold <b>"1-Tap Install"</b> button above, then tap <b>Install</b>!</li>
            </ol>
            <div class="code-box">${manifestUrl}</div>
        </div>

        <div class="guide" style="border-color: rgba(0, 229, 255, 0.35); margin-top: 14px;">
            <h3>📺 Smart TV Quick Shortcuts (Samsung, Toshiba, LG, Android TV)</h3>
            <p style="font-size: 13px; color: #b5b5c0; margin-bottom: 8px;">No need to type long URLs on your TV remote! Use these simple shortcuts:</p>
            <div style="display: flex; flex-direction: column; gap: 8px; margin: 12px 0;">
                <div style="background: rgba(0, 240, 255, 0.08); border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 10px; padding: 10px 14px; text-align: left;">
                    <span style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">1. Direct TV Browser App (Zero Install):</span>
                    <div style="font-size: 16px; font-weight: 800; color: #00F0FF; font-family: monospace; margin-top: 4px;">tinyurl.com/y-stream-tv</div>
                </div>
                <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 10px 14px; text-align: left;">
                    <span style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">2. Android TV / Fire TV APK Download:</span>
                    <div style="font-size: 16px; font-weight: 800; color: #10B981; font-family: monospace; margin-top: 4px;">${ANDROID_SHORT_URL}</div>
                </div>
                <div style="background: rgba(255, 215, 0, 0.08); border: 1px solid rgba(255, 215, 0, 0.3); border-radius: 10px; padding: 10px 14px; text-align: left;">
                    <span style="font-size: 11px; color: #aaa; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">3. Stremio TV Addon Manifest:</span>
                    <div style="font-size: 16px; font-weight: 800; color: #FFD700; font-family: monospace; margin-top: 4px;">tinyurl.com/y-stremio-tv</div>
                </div>
            </div>
            <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 14px;">
                <div style="text-align: center;">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=https%3A%2F%2Ftinyurl.com%2Fy-stream-tv" alt="Scan to open web app" style="width: 120px; height: 120px; border-radius: 12px; border: 2px solid #00E5FF; box-shadow: 0 0 12px rgba(0, 229, 255, 0.3); display: inline-block;">
                    <div style="font-size: 11px; color: #00E5FF; margin-top: 6px; font-weight: 700;">📱 Web App QR</div>
                </div>
                <div style="text-align: center;">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=https%3A%2F%2Ftinyurl.com%2Fy-streamer-apk" alt="Scan to download APK" style="width: 120px; height: 120px; border-radius: 12px; border: 2px solid #10B981; box-shadow: 0 0 12px rgba(16, 185, 129, 0.3); display: inline-block;">
                    <div style="font-size: 11px; color: #34d399; margin-top: 6px; font-weight: 700;">🤖 Android APK QR</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname || '/';
    const host = req.headers.host || `localhost:${PORT}`;

    // Root landing page
    if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderLandingHtml(host));
        return;
    }

    // Direct Android APK Download Redirect
    if (pathname === '/apk' || pathname === '/download' || pathname === '/android' || pathname === '/app.apk') {
        res.writeHead(302, { 'Location': ANDROID_APK_URL });
        res.end();
        return;
    }

    // Standalone Web & iOS PWA Streaming App
    if (pathname === '/app' || pathname === '/watch' || pathname === '/app.html') {
        try {
            const htmlPath = fs.existsSync(path.join(__dirname, 'app.html')) 
                ? path.join(__dirname, 'app.html') 
                : path.join(__dirname, 'index.html');
            const appHtml = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(appHtml);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading standalone app: ' + e.message);
        }
        return;
    }

    // Static assets (PWA icons, Service Worker, Official Brand Logo)
    if (['/sw.js', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/logo.jpg', '/logo.png'].includes(pathname) || pathname.startsWith('/assets/') || pathname.includes('logo')) {
        let cleanFile = pathname.replace(/^\//, '');
        if (pathname.includes('logo')) {
            cleanFile = fs.existsSync(path.join(__dirname, cleanFile)) ? cleanFile : 'logo.jpg';
        }
        const assetPath = path.join(__dirname, cleanFile);
        if (fs.existsSync(assetPath)) {
            const ext = path.extname(assetPath).toLowerCase();
            const mimeTypes = {
                '.js': 'application/javascript; charset=utf-8',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.ico': 'image/x-icon',
                '.svg': 'image/svg+xml',
                '.json': 'application/json; charset=utf-8'
            };
            res.writeHead(200, {
                'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': pathname === '/sw.js' ? 'no-cache, no-store, must-revalidate, max-age=0' : 'public, max-age=86400'
            });
            fs.createReadStream(assetPath).pipe(res);
            return;
        }
    }

    // Security PIN Verification Endpoint
    if (pathname === '/api/auth/pin' || pathname === '/api/auth/verify') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const pin = String(data.pin || '').trim();
                    if (pin === APP_PIN) {
                        const token = Buffer.from(`family_session_${Date.now()}_${Math.random()}`).toString('base64');
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ success: true, token, message: 'Access Granted' }));
                    } else {
                        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ success: false, error: 'Incorrect 6-digit security PIN' }));
                    }
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Invalid request body' }));
                }
            });
            return;
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', protected: true }));
            return;
        }
    }

    // PWA Manifest (Progressive Web App Specification)
    if (pathname === '/manifest.webmanifest') {
        res.writeHead(200, { 
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
        });
        res.end(JSON.stringify({
            id: "/app",
            name: "Yogesh Streamer — Luxury OTT Cinema",
            short_name: "YogeshStreamer",
            description: "Luxury Multi-Device Streaming Platform for 4K Movies, Web Series, Live Cricket & 2,400+ Live Channels",
            start_url: "/app",
            scope: "/",
            display: "standalone",
            orientation: "any",
            background_color: "#070A12",
            theme_color: "#070A12",
            icons: [
                {
                    src: BRAND_LOGO,
                    sizes: "192x192",
                    type: "image/jpeg",
                    purpose: "any"
                },
                {
                    src: BRAND_LOGO,
                    sizes: "512x512",
                    type: "image/jpeg",
                    purpose: "any maskable"
                }
            ],
            shortcuts: [
                {
                    name: "Live TV Channels",
                    short_name: "Live TV",
                    url: "/app#livetv",
                    description: "57+ Verified 24/7 Live Indian TV Channels"
                },
                {
                    name: "Web Series",
                    short_name: "Series",
                    url: "/app#series",
                    description: "Binge Commercial Web Series in High Definition"
                },
                {
                    name: "Gujarati Vault",
                    short_name: "Gujarati",
                    url: "/app#gujarati",
                    description: "108+ Gujarati Blockbusters & Web Series"
                },
                {
                    name: "Live Cricket",
                    short_name: "Sports",
                    url: "/app#sports",
                    description: "Live Sports & Cricket Feeds"
                }
            ]
        }, null, 2));
        return;
    }

    // Health check (Render / cloud container probe endpoints)
    if (pathname === '/health' || pathname === '/healthz' || pathname === '/ping' || pathname === '/api/health') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ status: 'ok', service: 'yogesh-streamer-bridge', resolvers: UPSTREAM_RESOLVERS.length, uptime: Math.round(process.uptime()) }));
        return;
    }

    // Network Speed Test binary payload for in-app bandwidth diagnostic
    if (pathname === '/api/speedtest' || pathname === '/speedtest.bin') {
        const size = 1024 * 1024; // 1MB payload
        const buf = crypto.randomBytes(size);
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': size,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(buf);
        return;
    }

    // Universal Decompiled Scrapers API (Reverse Engineered from CS3)
    if (pathname === '/api/scrapers' || pathname === '/api/providers') {
        try {
            const localScrapers = path.join(__dirname, 'scrapers.json');
            let data = null;
            if (fs.existsSync(localScrapers)) {
                data = JSON.parse(fs.readFileSync(localScrapers, 'utf8'));
            } else {
                data = await fetchJson(SCRAPERS_MANIFEST_URL);
            }
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
            });
            res.end(JSON.stringify(data || { scrapers: [] }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch scrapers: ' + e.message }));
        }
        return;
    }

    // 🧩 Reverse-Engineered CS3-to-JSON Catalog API
    if (pathname === '/api/plugins/catalog' || pathname === '/api/plugins/reverse-engineered' || pathname === '/plugins_catalog.json') {
        try {
            const localCatPath = path.join(__dirname, 'plugins_catalog.json');
            let catalogData = null;
            if (fs.existsSync(localCatPath)) {
                catalogData = JSON.parse(fs.readFileSync(localCatPath, 'utf8'));
            } else {
                catalogData = await fetchJson('https://raw.githubusercontent.com/shahrukh-hack/yogesh-streamer-plugins/builds/plugins_catalog.json');
            }
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
            });
            res.end(JSON.stringify(catalogData || []));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load plugins catalog: ' + e.message }));
        }
        return;
    }

    // Official Yogesh Streamer Plugins Catalog API (from yogesh-streamer-plugins)
    if (pathname === '/api/plugins' || pathname === '/api/extensions') {
        try {
            const localPlugins = path.join(__dirname, 'plugins.json');
            let plugins = null;
            if (fs.existsSync(localPlugins)) {
                plugins = JSON.parse(fs.readFileSync(localPlugins, 'utf8'));
            } else {
                plugins = await fetchJson(PLUGINS_MANIFEST_URL);
            }
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=1800'
            });
            res.end(JSON.stringify(plugins || []));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch plugins manifest: ' + e.message }));
        }
        return;
    }



    // ☁️ Universal Cross-Device Cloud Sync API (Watchlist & Continue Watching)
    if (pathname.startsWith('/api/sync/')) {
        const syncCode = pathname.replace('/api/sync/', '').trim().toUpperCase();
        if (!syncCode || syncCode.length < 3) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid sync code' }));
            return;
        }

        if (req.method === 'GET') {
            const data = cloudSyncStore.get(syncCode) || { continueWatching: [], favorites: [] };
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ success: true, syncCode, data }));
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const parsed = JSON.parse(body || '{}');
                    const existing = cloudSyncStore.get(syncCode) || { continueWatching: [], favorites: [] };
                    const merged = {
                        continueWatching: Array.isArray(parsed.continueWatching) ? parsed.continueWatching : existing.continueWatching,
                        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : existing.favorites,
                        updatedAt: Date.now()
                    };
                    setCloudSyncStore(syncCode, merged);
                    res.writeHead(200, {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({ success: true, syncCode, updatedAt: merged.updatedAt }));
                } catch(e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
                }
            });
            return;
        }
    }

    // Stremio Addon Manifest
        // 🔴 YogTube (Ad-Free SmartTube & YouTube Streaming Engine)
    if (pathname === '/api/yogtube/trending') {
        try {
            const data = await getPipedTrending();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ items: data }));
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ items: [] }));
        }
        return;
    }

    if (pathname === '/api/yogtube/search') {
        try {
            const q = parsedUrl.query.q || '';
            const data = await getPipedSearch(q);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ items: data }));
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ items: [] }));
        }
        return;
    }

    if (pathname === '/manifest.json') {
        try {
            const manifest = await getRebrandedManifest();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(manifest, null, 2));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // HLS & Mixed Content Stream Proxy: /proxy/stream, /proxy/stream/playlist.m3u8, /proxy/stream/segment.ts
    if (pathname === '/proxy/stream' || pathname.startsWith('/proxy/stream/')) {
        const targetUrl = parsedUrl.query.url;
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Missing stream url parameter');
            return;
        }

        try {
            const parsedTarget = url.parse(targetUrl);
            const client = parsedTarget.protocol === 'https:' ? https : http;

            const targetReferer = parsedUrl.query.referer || (parsedTarget.protocol + '//' + parsedTarget.host + '/');
            const targetUa = parsedUrl.query.ua || req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

            const proxyReqHeaders = {
                'User-Agent': targetUa,
                'Accept': '*/*',
                'Referer': targetReferer
            };
            if (targetReferer.includes('megaplay') || targetUrl.includes('megap') || targetUrl.includes('shiora') || targetUrl.includes('nexabloom')) {
                proxyReqHeaders['Origin'] = 'https://megaplay.buzz';
                proxyReqHeaders['Sec-Fetch-Mode'] = 'cors';
                proxyReqHeaders['Sec-Fetch-Site'] = 'cross-site';
            }
            if (req.headers.range) {
                proxyReqHeaders['Range'] = req.headers.range;
            }

            const proxyReq = client.get(targetUrl, {
                headers: proxyReqHeaders,
                timeout: 20000
            }, (proxyRes) => {
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    let redir = proxyRes.headers.location;
                    if (redir.startsWith('/')) {
                        redir = `${parsedTarget.protocol}//${parsedTarget.host}${redir}`;
                    }
                    const refQ = parsedUrl.query.referer ? `&referer=${encodeURIComponent(parsedUrl.query.referer)}` : '';
                    const uaQ = parsedUrl.query.ua ? `&ua=${encodeURIComponent(parsedUrl.query.ua)}` : '';
                    const isRedirM3u8 = redir.includes('.m3u8') || pathname.endsWith('.m3u8');
                    const redirPath = isRedirM3u8 ? '/proxy/stream/playlist.m3u8' : '/proxy/stream/segment.ts';
                    res.writeHead(302, { 'Location': `${redirPath}?url=${encodeURIComponent(redir)}${refQ}${uaQ}`, 'Access-Control-Allow-Origin': '*' });
                    res.end();
                    return;
                }

                const contentType = proxyRes.headers['content-type'] || '';
                const isM3u8 = contentType.includes('mpegurl') || targetUrl.includes('.m3u8') || pathname.endsWith('.m3u8');

                if (isM3u8) {
                    let playlistData = '';
                    proxyRes.on('data', chunk => playlistData += chunk);
                    proxyRes.on('end', () => {
                        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                        const lines = playlistData.split(/\r?\n/);
                        const extraParams = (parsedUrl.query.referer ? `&referer=${encodeURIComponent(parsedUrl.query.referer)}` : '') +
                                            (parsedUrl.query.ua ? `&ua=${encodeURIComponent(parsedUrl.query.ua)}` : '');
                        const isSecure = !host.includes('localhost') && !host.includes('127.0.0.1');
                        const proto = isSecure ? 'https' : 'http';

                        const rewritten = lines.map(line => {
                            let trimmed = line.trim();
                            if (!trimmed) return line;

                            // Rewrite URIs in HLS directives (#EXT-X-MEDIA, #EXT-X-KEY, #EXT-X-MAP, etc.)
                            if (trimmed.startsWith('#')) {
                                if (trimmed.includes('URI="')) {
                                    return trimmed.replace(/URI="([^"]+)"/g, (match, u) => {
                                        let fullUri = u;
                                        if (!fullUri.startsWith('http://') && !fullUri.startsWith('https://')) {
                                            fullUri = baseUrl + fullUri;
                                        }
                                        const isSubPlaylist = fullUri.includes('.m3u8');
                                        const proxyPath = isSubPlaylist ? '/proxy/stream/playlist.m3u8' : '/proxy/stream/segment.ts';
                                        return `URI="${proto}://${host}${proxyPath}?url=${encodeURIComponent(fullUri)}${extraParams}"`;
                                    });
                                }
                                return line;
                            }

                            let fullChunk = trimmed;
                            if (!fullChunk.startsWith('http://') && !fullChunk.startsWith('https://')) {
                                fullChunk = baseUrl + fullChunk;
                            }
                            const isSubPlaylist = fullChunk.includes('.m3u8');
                            const proxyPath = isSubPlaylist ? '/proxy/stream/playlist.m3u8' : '/proxy/stream/segment.ts';
                            return `${proto}://${host}${proxyPath}?url=${encodeURIComponent(fullChunk)}${extraParams}`;
                        });

                        const out = rewritten.join('\n');
                        res.writeHead(proxyRes.statusCode || 200, {
                            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
                            'Cache-Control': 'no-cache'
                        });
                        res.end(out);
                    });
                } else {
                    let chunkContentType = contentType;
                    const lowerTarget = targetUrl.toLowerCase();
                    if (pathname.endsWith('.ts') || lowerTarget.includes('.ts') || lowerTarget.includes('.jpg') || lowerTarget.includes('.png') || lowerTarget.includes('.jpeg')) {
                        chunkContentType = 'video/MP2T';
                    } else if (pathname.endsWith('.m4s') || lowerTarget.includes('.m4s')) {
                        chunkContentType = 'video/iso.segment';
                    } else if (!chunkContentType || chunkContentType === 'application/octet-stream') {
                        chunkContentType = 'video/MP2T';
                    }

                    const headers = {
                        'Content-Type': chunkContentType,
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
                        'Cache-Control': 'public, max-age=3600'
                    };
                    if (proxyRes.headers['content-length']) {
                        headers['Content-Length'] = proxyRes.headers['content-length'];
                    }
                    if (proxyRes.headers['content-range']) {
                        headers['Content-Range'] = proxyRes.headers['content-range'];
                    }
                    res.writeHead(proxyRes.statusCode || 200, headers);
                    proxyRes.pipe(res);
                }
            });

            req.on('close', () => {
                if (!proxyReq.destroyed) {
                    proxyReq.destroy();
                }
            });

            proxyReq.on('error', err => {
                console.error('Proxy error for', targetUrl, err.message);
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
                    res.end('Stream Proxy Error: ' + err.message);
                }
            });
            proxyReq.on('timeout', () => {
                proxyReq.destroy();
                if (!res.headersSent) {
                    res.writeHead(504, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
                    res.end('Stream Proxy Timeout');
                }
            });
        } catch (e) {
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
                res.end('Proxy failure: ' + e.message);
            }
        }
        return;
    }

    // Stream resolver route: /stream/:type/:id.json
    if (pathname.startsWith('/stream/')) {
        const afterPrefix = pathname.slice('/stream/'.length);
        const firstSlash = afterPrefix.indexOf('/');
        if (firstSlash === -1) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ streams: [] }));
            return;
        }

        const type = afterPrefix.slice(0, firstSlash);
        let idRaw = afterPrefix.slice(firstSlash + 1);
        if (idRaw.endsWith('.json')) {
            idRaw = idRaw.slice(0, -5);
        }
        const rawId = decodeURIComponent(idRaw);
        let cleanRawId = rawId;
        if (rawId.startsWith('cnc:Q2FzdGxlVFY') && rawId.includes(':')) {
            const parts = rawId.split(':');
            if (parts.length > 3 && !isNaN(parts[parts.length - 1])) {
                cleanRawId = parts.slice(0, -2).join(':');
            }
        }

        if (!type || !rawId) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ streams: [] }));
            return;
        }
        const cacheKey = `${type}:${rawId}`;

                if (rawId.startsWith('native:tv:')) {
            const result = getNativeLiveTVStream(rawId);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        // ⚡ Native Reverse-Engineered Stream Resolver Check
        if (rawId.startsWith('native:fc:')) {
            const matchId = rawId.replace('native:fc:', '');
            const result = await getNativeSportsStream(matchId);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        if (rawId.startsWith('native:hdhub:')) {
            const slug = rawId.replace('native:hdhub:', '');
            const result = await getNativeHDHub4uStreams(slug);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        if (rawId.startsWith('native:mdrive:')) {
            const slug = rawId.replace('native:mdrive:', '');
            const result = await getNativeMoviesDriveStreams(slug);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        if (rawId.startsWith('native:uhd:')) {
            const slug = rawId.replace('native:uhd:', '');
            const result = await getNativeVegaMoviesStreams(slug);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        if (rawId.startsWith('native:vega:')) {
            const slug = rawId.replace('native:vega:', '');
            const result = await getNativeVegaMoviesStreams(slug);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        if (rawId.startsWith('native:cartoon:') || rawId.startsWith('native:anime:') || rawId.startsWith('native:anikoto:')) {
            const isCartoon = rawId.startsWith('native:cartoon:');
            const slug = isCartoon ? rawId.replace('native:cartoon:', '') : rawId.replace('native:anime:', '').replace('native:anikoto:', '');
            const rawResult = isCartoon ? await getNativeCartoonStreams(slug) : await getNativeAniKotoStreams(slug);
            const rawStreams = Array.isArray(rawResult?.streams) ? rawResult.streams : [];
            const isSecure = !host.includes('localhost') && !host.includes('127.0.0.1');
            const proto = isSecure ? 'https' : 'http';
            const proxiedStreams = rawStreams.map(s => {
                const streamUrl = (s.url || '').trim();
                const reqHeaders = s.behaviorHints?.proxyHeaders?.request || {};
                const streamReferer = reqHeaders.Referer || reqHeaders.referer || 'https://megaplay.buzz/';
                const streamUa = reqHeaders['User-Agent'] || reqHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
                let finalPlayUrl = streamUrl;
                if (streamUrl.startsWith('http')) {
                    finalPlayUrl = `${proto}://${host}/proxy/stream/playlist.m3u8?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(streamReferer)}&ua=${encodeURIComponent(streamUa)}`;
                }
                return {
                    ...s,
                    url: finalPlayUrl,
                    hlsUrl: streamUrl,
                    isWebPlayable: true
                };
            });
            streamCache.set(cacheKey, { timestamp: Date.now(), streams: proxiedStreams });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ streams: proxiedStreams }));
            return;
        }

        // ⚡ In-Memory Stream Cache Check (0ms Instant Delivery with smart TTL)
        const isLive = type === 'tv' || rawId.includes('Live') || rawId.includes('tv') || rawId.includes('Sports');
        const effectiveTtl = isLive ? 30000 : STREAM_CACHE_TTL; // 30s for live sports to ensure fresh signatures, 5m for on-demand movies

        const cached = streamCache.get(cacheKey) || streamCache.get(rawId);
        if (cached && (Date.now() - cached.timestamp < effectiveTtl)) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ streams: cached.streams }));
            return;
        }

        try {
            let data = null;

            // 🎯 Type Candidate Ordering: Upstream CNCVerse registers movie & web series catalogs
            // under "other", while live sports/TV are under "tv". Querying "other" first for movies/series
            // eliminates 15s-30s upstream timeouts!
            let candidateTypes = [type];
            if (rawId.startsWith('cnc:')) {
                if (type === 'tv') {
                    candidateTypes = ['tv', 'other'];
                } else if (type === 'series' || rawId.includes('CastleTV') || rawId.includes('series') || rawId.includes('Season') || rawId.includes('episode')) {
                    // 🚀 Prioritize 'series' endpoint first: eliminates 15s-30s upstream timeout for Web Series & TV Shows
                    candidateTypes = ['series', 'other', 'movie'];
                } else {
                    candidateTypes = ['movie', 'other', 'series'];
                }
            } else {
                candidateTypes = [type, 'series', 'movie', 'other'].filter((v, i, a) => a.indexOf(v) === i);
            }
            for (const cand of candidateTypes) {
                try {
                    const streamPath = `/stream/${encodeURIComponent(cand)}/${encodeURIComponent(cleanRawId || rawId)}.json`;
                    const result = await fetchJsonWithFailover(streamPath);
                    if (result && Array.isArray(result.streams) && result.streams.length > 0) {
                        data = result;
                        break;
                    }
                } catch (e) {}
            }

            let streams = Array.isArray(data?.streams) ? data.streams : [];

            // 3. Filter out donation ads / externalUrl streams with no playable url
            streams = streams.filter(s => s && s.url && typeof s.url === 'string' && s.url.trim().length > 0 && !s.externalUrl);

            // Filter out known dead CDN hosts (return 404 upstream), dead CF workers (400), and dead sports proxies
            streams = streams.filter(s => {
                const u = (s.url || '').toLowerCase();
                if (u.includes('nm-cdn23.top') || u.includes('freecdn4.top') || u.includes('140.238.244.130/proxy/mpd') || u.includes('129.225.106.195/proxy/mpd') || u.includes('rohitkiskk.workers.dev') || u.includes('tencent-cdn.tapmad.com') || u.includes('dai-fancode.pages.dev')) {
                    return false;
                }
                return true;
            });

            // 3.1 Prioritize verified high-speed CDNs at the top of stream list
            streams.sort((a, b) => {
                const uA = (a.url || '').toLowerCase();
                const uB = (b.url || '').toLowerCase();
                const isReliableA = uA.includes('pixeldrain') || uA.includes('r2.dev') || uA.includes('cloudflarestorage') || uA.includes('googleusercontent') || uA.includes('fancode.com') || uA.includes('cloudfront.net') || uA.includes('msnetworks.net') || uA.includes('castle');
                const isReliableB = uB.includes('pixeldrain') || uB.includes('r2.dev') || uB.includes('cloudflarestorage') || uB.includes('googleusercontent') || uB.includes('fancode.com') || uB.includes('cloudfront.net') || uB.includes('msnetworks.net') || uB.includes('castle');
                if (isReliableA && !isReliableB) return -1;
                if (!isReliableA && isReliableB) return 1;

                // Push unstable/forbidden worker links to the bottom
                const isWorkerA = uA.includes('workers.dev');
                const isWorkerB = uB.includes('workers.dev');
                if (!isWorkerA && isWorkerB) return -1;
                if (isWorkerA && !isWorkerB) return 1;

                const isDrmA = uA.includes('clearkey=') || uA.includes('/d/master.m3u8');
                const isDrmB = uB.includes('clearkey=') || uB.includes('/d/master.m3u8');
                if (!isDrmA && isDrmB) return -1;
                if (isDrmA && !isDrmB) return 1;
                return 0;
            });

            // 4. Apply Luxury Yogesh Streamer Branding, format detection and Mixed Content Proxy
            const brandedStreams = streams.map(stream => {
                let name = stream.name || 'Yogesh Streamer';
                name = name.replace(/•?\s*CNCVerse Bridge/gi, '').replace(/🌟/g, '').trim();

                let title = stream.title || '';
                title = title.replace(/CNCVerse Bridge/gi, 'Yogesh Streamer');

                let streamUrl = (stream.url || '').trim();

                // 🚀 Extract direct MPEG-DASH MPD and ClearKey if wrapped by upstream HLS converter
                let directMpd = null;
                let clearkey = stream.clearkey || null;
                const dMatch = streamUrl.match(/[?&]d=([^&]+)/);
                if (dMatch && dMatch[1]) {
                    directMpd = decodeURIComponent(dMatch[1]);
                }
                if (!clearkey) {
                    const kMatch = streamUrl.match(/[?&]clearkey=([^&]+)/);
                    if (kMatch && kMatch[1]) {
                        clearkey = decodeURIComponent(kMatch[1]);
                    }
                }

                const lowerUrl = (directMpd || streamUrl).toLowerCase();
                const isMkv = lowerUrl.includes('.mkv') || lowerUrl.includes('pub-') || lowerUrl.includes('r2.dev') || lowerUrl.includes('googleusercontent') || lowerUrl.includes('drive.google') || lowerUrl.includes('hubdrive');
                const isCastle = name.toLowerCase().includes('castle') || (title || '').toLowerCase().includes('castle') || lowerUrl.includes('hscow.com') || lowerUrl.includes('hlowb.com');
                const isAnikoto = streamUrl.includes('/api/anime') || name.toLowerCase().includes('anikoto');
                const isSportsOrLive = lowerUrl.includes('/d/master.m3u8') || lowerUrl.includes('sport') || lowerUrl.includes('cricket') || lowerUrl.includes('live') || name.toLowerCase().includes('live') || (title || '').toLowerCase().includes('live') || (title || '').toLowerCase().includes('stream') || lowerUrl.includes('cloudfront.net/live') || lowerUrl.includes('msnetworks.net');
                const isHls = lowerUrl.includes('.m3u8') || lowerUrl.includes('klnwm.com') || lowerUrl.includes('hlscob.com');
                const isDash = lowerUrl.includes('.mpd');

                if (isCastle || isAnikoto || isSportsOrLive) {
                    name = `⚡ [In-App Player] ${name}`;
                } else if (isMkv) {
                    name = `🚀 [4K / VLC] ${name}`;
                } else if (isHls || isDash) {
                    name = `🎬 [Cloud HLS] ${name}`;
                } else {
                    name = `🎬 ${name}`;
                }
                const isSecure = !host.includes('localhost') && !host.includes('127.0.0.1');
                const proto = isSecure ? 'https' : 'http';

                const reqHeaders = stream.behaviorHints?.proxyHeaders?.request || {};
                let streamReferer = reqHeaders.Referer || reqHeaders.referer || '';
                let streamUa = reqHeaders['User-Agent'] || reqHeaders['user-agent'] || '';
                if (!streamReferer && (lowerUrl.includes('tamashaweb.com') || lowerUrl.includes('tamasha'))) {
                    streamReferer = 'https://tamashaweb.com/';
                }
                if (!streamReferer && (lowerUrl.includes('tapmad.com') || lowerUrl.includes('tapmad'))) {
                    streamReferer = 'https://www.tapmad.com/';
                }

                let finalPlayUrl = streamUrl;
                // Rewrite any IP-based or HTTP CNCVerse streams to verified HTTPS domain
                if (streamUrl.includes('129.225.106.195') || streamUrl.includes('140.238.244.130')) {
                    finalPlayUrl = streamUrl
                        .replace(/http:\/\/129\.225\.106\.195/g, 'https://cncverse.dpdns.org')
                        .replace(/https:\/\/129\.225\.106\.195/g, 'https://cncverse.dpdns.org')
                        .replace(/http:\/\/140\.238\.244\.130/g, 'https://cncverse.dpdns.org')
                        .replace(/https:\/\/140\.238\.244\.130/g, 'https://cncverse.dpdns.org');
                } else if (streamUrl.startsWith('http://cncverse.dpdns.org')) {
                    finalPlayUrl = streamUrl.replace('http://cncverse.dpdns.org', 'https://cncverse.dpdns.org');
                } else if (directMpd && directMpd.startsWith('https://') && !clearkey) {
                    finalPlayUrl = directMpd;
                } else if (streamUrl.startsWith('http://') || streamReferer) {
                    let proxyParams = `url=${encodeURIComponent(streamUrl)}`;
                    if (streamReferer) proxyParams += `&referer=${encodeURIComponent(streamReferer)}`;
                    if (streamUa) proxyParams += `&ua=${encodeURIComponent(streamUa)}`;
                    finalPlayUrl = `${proto}://${host}/proxy/stream/playlist.m3u8?${proxyParams}`;
                }

                // Sanitize Subtitle URLs to prevent Mixed Content blocking over HTTPS
                const sanitizedSubtitles = Array.isArray(stream.subtitles) ? stream.subtitles.map(sub => {
                    let subUrl = (sub && sub.url) ? sub.url.trim() : '';
                    if (subUrl.includes('129.225.106.195') || subUrl.includes('140.238.244.130')) {
                        subUrl = subUrl
                            .replace(/http:\/\/129\.225\.106\.195/g, 'https://cncverse.dpdns.org')
                            .replace(/https:\/\/129\.225\.106\.195/g, 'https://cncverse.dpdns.org')
                            .replace(/http:\/\/140\.238\.244\.130/g, 'https://cncverse.dpdns.org')
                            .replace(/https:\/\/140\.238\.244\.130/g, 'https://cncverse.dpdns.org');
                    } else if (subUrl.startsWith('http://')) {
                        subUrl = `${proto}://${host}/proxy/stream/playlist.m3u8?url=${encodeURIComponent(subUrl)}`;
                    }
                    return {
                        ...sub,
                        url: subUrl
                    };
                }) : [];

                return {
                    ...stream,
                    url: finalPlayUrl,
                    hlsUrl: streamUrl,
                    mpdUrl: directMpd,
                    clearkey: clearkey,
                    name,
                    title,
                    isMkv,
                    isWebPlayable: !isMkv,
                    subtitles: sanitizedSubtitles
                };
            });

            // Save to in-memory cache if streams found
            if (brandedStreams.length > 0) {
                setStreamCache(cacheKey, {
                    streams: brandedStreams,
                    timestamp: Date.now()
                });
                setStreamCache(rawId, {
                    streams: brandedStreams,
                    timestamp: Date.now()
                });
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ streams: brandedStreams }));
        } catch (err) {
            console.error(`Error resolving streams for ${type}/${rawId}:`, err.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ streams: [] }));
        }
        return;
    }

    function filterCatalogByQuery(metas, pathname) {
    const searchMatch = pathname.match(/search=([^/.]+)/);
    if (!searchMatch || !Array.isArray(metas)) return metas;
    const q = decodeURIComponent(searchMatch[1]).toLowerCase().trim();
    if (!q) return metas;
    return metas.filter(m => (m.name || '').toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q));
}

    // Catalog route: /catalog/:type/:id.json or with extra args
    if (pathname.startsWith('/catalog/')) {
                if (pathname.includes('native_web_series') || pathname.includes('native_ott_series')) {
            const rawMetas = await getNativeWebSeriesCatalog();
            const metas = filterCatalogByQuery(rawMetas, pathname);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_gujarati_movies') || pathname.includes('native_gujarati_vault')) {
            const rawMetas = getNativeGujaratiCatalog();
            const metas = filterCatalogByQuery(rawMetas, pathname);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_live_tv')) {
            const rawMetas = await getNativeLiveTVCatalog();
            const metas = filterCatalogByQuery(rawMetas, pathname);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_live_sports_tv')) {
            const rawMetas = await getNativeSportsCatalog();
            const metas = filterCatalogByQuery(rawMetas, pathname);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_hdhub4u_movies')) {
            const rawMetas = await getNativeHDHub4uCatalog();
            const metas = filterCatalogByQuery(rawMetas, pathname);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_moviesdrive_movies')) {
            const searchQuery = pathname.includes('search=') ? decodeURIComponent(pathname.split('search=')[1].replace('.json', '')) : '';
            const metas = await getNativeMoviesDriveCatalog(searchQuery);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_uhdmovies_movies')) {
            const searchQuery = pathname.includes('search=') ? decodeURIComponent(pathname.split('search=')[1].replace('.json', '')) : '';
            const metas = await getNativeUHDMoviesCatalog(searchQuery);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_toonstream_series')) {
            const searchQuery = pathname.includes('search=') ? decodeURIComponent(pathname.split('search=')[1].replace('.json', '')) : '';
            const metas = await getNativeToonstreamCatalog(searchQuery);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_vegamovies_movies')) {
            const rawMetas = await getNativeVegaMoviesCatalog();
            const metas = filterCatalogByQuery(rawMetas, pathname);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_cartoons_series')) {
            const rawMetas = await getNativeCartoonsCatalog();
            const metas = filterCatalogByQuery(rawMetas, pathname);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }

        if (pathname.includes('native_animeworld_series') || pathname.includes('native_anikoto_series')) {
            const rawMetas = await getNativeAniKotoCatalog();
            const metas = filterCatalogByQuery(rawMetas, pathname);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }


        try {
            // If Stremio is requesting /catalog/movie/cnc_..._other.json, map to /catalog/other/cnc_..._other.json upstream
            let mappedPath = pathname;
            let isMovieMappedFromOther = false;
            if (pathname.startsWith('/catalog/movie/') && pathname.includes('_other')) {
                mappedPath = pathname.replace('/catalog/movie/', '/catalog/other/');
                isMovieMappedFromOther = true;
            }

            const data = await fetchJsonWithFailover(mappedPath);

            let metas = Array.isArray(data?.metas) ? data.metas : [];
            if (isMovieMappedFromOther) {
                metas = metas.map(m => ({
                    ...m,
                    type: 'movie'
                }));
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
        } catch (err) {
            console.error(`Error fetching catalog ${pathname}:`, err.message);
            if (pathname.startsWith('/catalog/tv/')) {
                const metas = await getNativeLiveTVCatalog();
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ metas }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ metas: [] }));
        }
        return;
    }

    // Meta route: /meta/:type/:id.json
    if (pathname.startsWith('/meta/')) {
        if (pathname.includes('native:fc:')) {
            const matchId = pathname.split('native:fc:')[1].replace('.json', '');
            const catalog = await getNativeSportsCatalog();
            const item = catalog.find(m => m.id === `native:fc:${matchId}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ meta: item || null }));
            return;
        }
        if (pathname.includes('native:hdhub:')) {
            const slug = pathname.split('native:hdhub:')[1].replace('.json', '');
            const catalog = await getNativeHDHub4uCatalog();
            const item = catalog.find(m => m.id === `native:hdhub:${slug}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ meta: item || null }));
            return;
        }
        if (pathname.includes('native:mdrive:')) {
            const slug = pathname.split('native:mdrive:')[1].replace('.json', '');
            const metas = await getNativeMoviesDriveCatalog(slug);
            const item = metas.find(m => m.id === `native:mdrive:${slug}`) || {
                id: `native:mdrive:${slug}`,
                name: slug.replace(/-/g, ' '),
                type: 'movie'
            };
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ meta: item }));
            return;
        }
        if (pathname.includes('native:uhd:')) {
            const slug = pathname.split('native:uhd:')[1].replace('.json', '');
            const metas = await getNativeUHDMoviesCatalog(slug);
            const item = metas.find(m => m.id === `native:uhd:${slug}`) || {
                id: `native:uhd:${slug}`,
                name: slug.replace(/-/g, ' '),
                type: 'movie'
            };
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ meta: item }));
            return;
        }
        if (pathname.includes('native:toonstream:')) {
            const slug = pathname.split('native:toonstream:')[1].replace('.json', '');
            const metas = await getNativeToonstreamCatalog(slug);
            const item = metas.find(m => m.id === `native:toonstream:${slug}`) || {
                id: `native:toonstream:${slug}`,
                name: slug.replace(/-/g, ' '),
                type: 'series'
            };
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ meta: item }));
            return;
        }
        if (pathname.includes('native:vega:')) {
            const slug = pathname.split('native:vega:')[1].replace('.json', '');
            const catalog = await getNativeVegaMoviesCatalog();
            const item = catalog.find(m => m.id === `native:vega:${slug}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ meta: item || null }));
            return;
        }
        if (pathname.includes('native:cartoon:')) {
            const slug = pathname.split('native:cartoon:')[1].replace('.json', '');
            const catalog = await getNativeCartoonsCatalog();
            const item = catalog.find(m => m.id === `native:cartoon:${slug}`);
            if (item) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ meta: item }));
                return;
            }
        }

        if (pathname.includes('native:anime:') || pathname.includes('native:anikoto:')) {
            const slug = pathname.includes('native:anime:')
                ? pathname.split('native:anime:')[1].replace('.json', '')
                : pathname.split('native:anikoto:')[1].replace('.json', '');
            const catalog = await getNativeAniKotoCatalog();
            const item = catalog.find(m => m.id === `native:anikoto:${slug}` || m.id === `native:anime:${slug}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ meta: item || null }));
            return;
        }
        const afterPrefix = pathname.slice('/meta/'.length);
        const firstSlash = afterPrefix.indexOf('/');
        if (firstSlash === -1) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ meta: null }));
            return;
        }

        const type = afterPrefix.slice(0, firstSlash);
        let idRaw = afterPrefix.slice(firstSlash + 1);
        if (idRaw.endsWith('.json')) {
            idRaw = idRaw.slice(0, -5);
        }
        const rawId = decodeURIComponent(idRaw);
        let cleanRawId = rawId;
        if (rawId.startsWith('cnc:Q2FzdGxlVFY') && rawId.includes(':')) {
            const parts = rawId.split(':');
            if (parts.length > 3 && !isNaN(parts[parts.length - 1])) {
                cleanRawId = parts.slice(0, -2).join(':');
            }
        }

        // For IMDb titles (tt...), let Cinemeta handle metadata
        if (rawId.startsWith('tt')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ meta: null }));
            return;
        }

        try {
            let targetType = type;
            let isMovieMappedFromOther = false;
            if (rawId.startsWith('cnc:') && (type === 'movie' || type === 'series')) {
                targetType = 'other';
                isMovieMappedFromOther = true;
            }

            const data = await fetchJsonWithFailover(`/meta/${encodeURIComponent(targetType)}/${encodeURIComponent(rawId)}.json`);

            if (data?.meta && (isMovieMappedFromOther || data.meta.type === 'other')) {
                data.meta.type = type;
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(data || { meta: null }));
        } catch (err) {
            console.error(`Error fetching meta ${pathname}:`, err.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ meta: null }));
        }
        return;
    }

    // Subtitles route: /subtitles/:type/:id.json
    if (pathname.startsWith('/subtitles/')) {
        const afterPrefix = pathname.slice('/subtitles/'.length);
        const firstSlash = afterPrefix.indexOf('/');
        if (firstSlash === -1) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ subtitles: [] }));
            return;
        }

        const type = afterPrefix.slice(0, firstSlash);
        let idRaw = afterPrefix.slice(firstSlash + 1);
        if (idRaw.endsWith('.json')) {
            idRaw = idRaw.slice(0, -5);
        }
        const rawId = decodeURIComponent(idRaw);
        let cleanRawId = rawId;
        if (rawId.startsWith('cnc:Q2FzdGxlVFY') && rawId.includes(':')) {
            const parts = rawId.split(':');
            if (parts.length > 3 && !isNaN(parts[parts.length - 1])) {
                cleanRawId = parts.slice(0, -2).join(':');
            }
        }

        try {
            let targetType = type;
            if (rawId.startsWith('cnc:') && (type === 'movie' || type === 'series')) {
                targetType = 'other';
            }

            const data = await fetchJsonWithFailover(`/subtitles/${encodeURIComponent(targetType)}/${encodeURIComponent(rawId)}.json`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(data || { subtitles: [] }));
        } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ subtitles: [] }));
        }
        return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🌟 Yogesh Streamer Multi-Device Bridge Online!`);
    console.log(`📡 Listening on http://localhost:${PORT}`);
    console.log(`📋 Manifest URL: http://localhost:${PORT}/manifest.json`);
    console.log(`🔌 Active Resolvers: ${UPSTREAM_RESOLVERS.join(', ')}`);
    console.log(`====================================================`);

    // 💓 Auto Keep-Alive Heartbeat (prevents Render / cloud platform cold starts)
    if (process.env.KEEP_ALIVE !== 'false') {
        const HEARTBEAT_INTERVAL = 14 * 60 * 1000; // 14 minutes
        setInterval(() => {
            const pingTarget = process.env.PUBLIC_URL || `http://localhost:${PORT}/health`;
            try {
                const parsed = url.parse(pingTarget);
                const client = parsed.protocol === 'https:' ? https : http;
                client.get(pingTarget, (pingRes) => {
                    pingRes.resume();
                }).on('error', () => {});
            } catch (e) {}
        }, HEARTBEAT_INTERVAL);
    }
});