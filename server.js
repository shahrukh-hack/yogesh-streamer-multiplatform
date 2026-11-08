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
const ANDROID_APK_URL = 'https://github.com/shahrukh-hack/yogesh-streamer/releases/download/v5.5.0/YogeshStreamer-v5.5.0.apk';
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
        const homeHtml = await fetchHtml(`${baseDomain}/home`);

        const items = [];
        const seenSlugs = new Set();

        const cardMatches = homeHtml.match(/<div class="item">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi) || [];
        for (const card of cardMatches) {
            const aMatch = /href="https?:\/\/[^\/]+\/watch\/([^"/?]+)(?:\/[^"]*)?"/i.exec(card);
            let imgMatch = /src="([^"]+)"\s*alt="([^"]+)"/i.exec(card);
            if (!imgMatch) {
                imgMatch = /alt="([^"]+)"\s*src="([^"]+)"/i.exec(card);
            }

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
                        genres: ['Anime', 'Animation', 'Action']
                    });
                }
            }
        }

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
                const streamIdMatch = /\/stream\/[^\/]+\/([^/?]+)/.exec(embedUrl);
                if (!streamIdMatch) continue;
                const streamId = streamIdMatch[1];

                const srcData = await fetchJson(`https://megaplay.buzz/stream/getSources?id=${streamId}`, {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': embedUrl
                });

                if (!srcData || !srcData.enc) continue;

                const decrypted = decryptMegaPlay(srcData.enc);
                if (!decrypted || !decrypted.file) continue;

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
                        notWebReady: false
                    },
                    subtitles: subTracks
                });
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
            const nativeAnimeCatalog = {
                type: 'series',
                id: 'native_anikoto_series',
                name: '⚔️ AniKoto & Anime (Multi-Audio HD Anime)',
                extra: [
                    { name: 'search', isRequired: false },
                    { name: 'skip', isRequired: false }
                ]
            };
            const finalCatalogs = [nativeSportsCatalog, nativeAnimeCatalog, nativeHDHubCatalog, nativeVegaCatalog, ...filteredCatalogs];
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
                🤖 Download Native Android App (APK v5.4.4)
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
                    ⬇️ Download APK v5.4.4 (Direct)
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

    // PWA Manifest
    if (pathname === '/manifest.webmanifest') {
        res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
        res.end(JSON.stringify({
            name: "Yogesh Streamer",
            short_name: "YogeshStreamer",
            description: "Luxury Multi-Device Streaming App for Movies, Web Series & Live Cricket",
            start_url: "/app",
            display: "standalone",
            background_color: "#070A12",
            theme_color: "#070A12",
            icons: [
                {
                    src: BRAND_LOGO,
                    sizes: "512x512",
                    type: "image/jpeg",
                    purpose: "any maskable"
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

        if (!type || !rawId) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ streams: [] }));
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

        if (rawId.startsWith('native:vega:')) {
            const slug = rawId.replace('native:vega:', '');
            const result = await getNativeVegaMoviesStreams(slug);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        if (rawId.startsWith('native:anime:') || rawId.startsWith('native:anikoto:')) {
            const slug = rawId.replace('native:anime:', '').replace('native:anikoto:', '');
            const result = await getNativeAniKotoStreams(slug);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
            return;
        }

        // ⚡ In-Memory Stream Cache Check (0ms Instant Delivery with smart TTL)
        const isLive = type === 'tv' || rawId.includes('Live') || rawId.includes('tv') || rawId.includes('Sports');
        const effectiveTtl = isLive ? 30000 : STREAM_CACHE_TTL; // 30s for live sports to ensure fresh signatures, 5m for on-demand movies
        const cacheKey = `${type}:${rawId}`;
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
                    const streamPath = `/stream/${encodeURIComponent(cand)}/${encodeURIComponent(rawId)}.json`;
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

            // Filter out known dead CDN hosts (return 404 upstream) and broken MPD proxy
            streams = streams.filter(s => {
                const u = (s.url || '').toLowerCase();
                if (u.includes('nm-cdn23.top') || u.includes('freecdn4.top') || u.includes('140.238.244.130/proxy/mpd')) {
                    return false;
                }
                return true;
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
                const isHls = lowerUrl.includes('.m3u8') || lowerUrl.includes('klnwm.com') || lowerUrl.includes('hlscob.com');
                const isDash = lowerUrl.includes('.mpd');

                if (isCastle || isAnikoto) {
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
                const streamReferer = reqHeaders.Referer || reqHeaders.referer || '';
                const streamUa = reqHeaders['User-Agent'] || reqHeaders['user-agent'] || '';

                let finalPlayUrl = streamUrl;
                if (streamUrl.includes('/d/master.m3u8') || (streamUrl.includes('clearkey=') && streamUrl.includes('.m3u8'))) {
                    // Decrypted HTTPS HLS stream for Live Sports/Cricket & Live TV (plays everywhere on VLC, iPhone, Android, and Smart TVs)
                    finalPlayUrl = streamUrl.replace('http://140.238.244.130', 'https://cncverse.dpdns.org');
                } else if (streamUrl.startsWith('http://cncverse.dpdns.org')) {
                    finalPlayUrl = streamUrl.replace('http://cncverse.dpdns.org', 'https://cncverse.dpdns.org');
                } else if (streamUrl.startsWith('http://140.238.244.130')) {
                    finalPlayUrl = streamUrl.replace('http://140.238.244.130', 'https://cncverse.dpdns.org');
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
                    if (subUrl.startsWith('http://140.238.244.130')) {
                        subUrl = subUrl.replace('http://140.238.244.130', 'https://cncverse.dpdns.org');
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

    // Catalog route: /catalog/:type/:id.json or with extra args
    if (pathname.startsWith('/catalog/')) {
        if (pathname.includes('native_live_sports_tv')) {
            const metas = await getNativeSportsCatalog();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_hdhub4u_movies')) {
            const metas = await getNativeHDHub4uCatalog();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_vegamovies_movies')) {
            const metas = await getNativeVegaMoviesCatalog();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ metas }));
            return;
        }
        if (pathname.includes('native_animeworld_series') || pathname.includes('native_anikoto_series')) {
            const metas = await getNativeAniKotoCatalog();
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
        if (pathname.includes('native:vega:')) {
            const slug = pathname.split('native:vega:')[1].replace('.json', '');
            const catalog = await getNativeVegaMoviesCatalog();
            const item = catalog.find(m => m.id === `native:vega:${slug}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ meta: item || null }));
            return;
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
