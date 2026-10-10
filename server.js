const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;
const UPSTREAM_RESOLVER = process.env.UPSTREAM_RESOLVER || 'https://cncverse.dpdns.org';
const BRAND_LOGO = 'https://raw.githubusercontent.com/shahrukh-hack/yogesh-streamer/master/assets/logos/cinematic_gold_logo_1787579512053.jpg';
const APP_PIN = process.env.APP_PIN || '778899';

// In-memory manifest cache
let cachedManifest = null;
let lastManifestFetch = 0;
const MANIFEST_CACHE_TTL = 1800000; // 30 minutes

function fetchJson(targetUrl) {
    return new Promise((resolve, reject) => {
        const parsed = url.parse(targetUrl);
        const client = parsed.protocol === 'https:' ? https : http;

        const req = client.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            },
            timeout: 15000
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Upstream returned HTTP ${res.statusCode}`));
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : null);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

async function getRebrandedManifest() {
    const now = Date.now();
    if (cachedManifest && (now - lastManifestFetch) < MANIFEST_CACHE_TTL) {
        return cachedManifest;
    }

    try {
        const upstream = await fetchJson(`${UPSTREAM_RESOLVER}/manifest.json`);
        if (upstream && Array.isArray(upstream.catalogs)) {
            // Rebrand catalogs: convert "other" into "movie" so Stremio can display them in Discover
            const rebrandedCatalogs = upstream.catalogs.map(c => {
                let clean = (c.name || '').replace(/•?\s*CNCVerse Bridge/gi, '').replace(/\(other\)|\(tv\)/g, '').trim();
                let type = c.type === 'other' ? 'movie' : c.type;
                return {
                    ...c,
                    type: type,
                    name: `🌟 ${clean}`
                };
            });

            cachedManifest = {
                id: 'org.yogeshstreamer.addon',
                version: '1.2.1',
                name: 'Yogesh Streamer',
                description: 'Official Multi-Device Addon for Movies, Web Series, Bollywood & Live Sports',
                logo: BRAND_LOGO,
                background: BRAND_LOGO,
                types: ['movie', 'series', 'tv'],
                idPrefixes: ['tt', 'cnc:'],
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
                },
                catalogs: rebrandedCatalogs
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
            <a class="btn-primary" href="${stremioWebUrl}" target="_blank">📱 1-Tap Install in Stremio Web (iOS / Mac / PC)</a>
            <a class="btn-app" href="${stremioProtocolUrl}">🚀 Open in Stremio App (Android / Windows / Linux)</a>
            <button class="btn-secondary" onclick="navigator.clipboard.writeText('${manifestUrl}'); alert('Copied Manifest URL to Clipboard!')">📋 Copy Addon Manifest URL</button>
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

    // Standalone Web & iOS PWA Streaming App
    if (pathname === '/app' || pathname === '/watch' || pathname === '/app.html') {
        try {
            const htmlPath = fs.existsSync(path.join(__dirname, 'app.html')) 
                ? path.join(__dirname, 'app.html') 
                : path.join(__dirname, 'index.html');
            const appHtml = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(appHtml);
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading standalone app: ' + e.message);
        }
        return;
    }

    // Static assets (PWA icons, Service Worker)
    if (['/sw.js', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png'].includes(pathname)) {
        const assetPath = path.join(__dirname, pathname.substring(1));
        if (fs.existsSync(assetPath)) {
            const ext = path.extname(assetPath);
            const mimeTypes = {
                '.js': 'application/javascript; charset=utf-8',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.ico': 'image/x-icon',
                '.svg': 'image/svg+xml'
            };
            res.writeHead(200, {
                'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                'Access-Control-Allow-Origin': '*'
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

    // Health check
    if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'yogesh-streamer-bridge' }));
        return;
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

    // HLS & Mixed Content Stream Proxy: /proxy/stream?url=<target_url>
    if (pathname === '/proxy/stream') {
        const targetUrl = parsedUrl.query.url;
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Missing stream url parameter');
            return;
        }

        try {
            const parsedTarget = url.parse(targetUrl);
            const client = parsedTarget.protocol === 'https:' ? https : http;

            const proxyReq = client.get(targetUrl, {
                headers: {
                    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Referer': parsedTarget.protocol + '//' + parsedTarget.host + '/'
                },
                timeout: 20000
            }, (proxyRes) => {
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    let redir = proxyRes.headers.location;
                    if (redir.startsWith('/')) {
                        redir = `${parsedTarget.protocol}//${parsedTarget.host}${redir}`;
                    }
                    res.writeHead(302, { 'Location': `/proxy/stream?url=${encodeURIComponent(redir)}`, 'Access-Control-Allow-Origin': '*' });
                    res.end();
                    return;
                }

                const contentType = proxyRes.headers['content-type'] || '';
                const isM3u8 = contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

                if (isM3u8) {
                    let playlistData = '';
                    proxyRes.on('data', chunk => playlistData += chunk);
                    proxyRes.on('end', () => {
                        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
                        const lines = playlistData.split(/\r?\n/);
                        const rewritten = lines.map(line => {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed.startsWith('#')) return line;
                            let fullChunk = trimmed;
                            if (!fullChunk.startsWith('http://') && !fullChunk.startsWith('https://')) {
                                fullChunk = baseUrl + fullChunk;
                            }
                            if (fullChunk.startsWith('http://')) {
                                return `/proxy/stream?url=${encodeURIComponent(fullChunk)}`;
                            }
                            return fullChunk;
                        });

                        const out = rewritten.join('\n');
                        res.writeHead(proxyRes.statusCode || 200, {
                            'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'no-cache'
                        });
                        res.end(out);
                    });
                } else {
                    const headers = {
                        'Content-Type': contentType || 'video/MP2T',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'no-cache'
                    };
                    if (proxyRes.headers['content-length']) {
                        headers['Content-Length'] = proxyRes.headers['content-length'];
                    }
                    res.writeHead(proxyRes.statusCode || 200, headers);
                    proxyRes.pipe(res);
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

        try {
            let targetType = type;
            let data = null;

            // 1. Try requested targetType
            try {
                const upstreamUrl = `${UPSTREAM_RESOLVER}/stream/${encodeURIComponent(targetType)}/${encodeURIComponent(rawId)}.json`;
                data = await fetchJson(upstreamUrl);
            } catch (e) {}

            // 2. If no streams returned, try fallback types (especially tv and other for live events and movies)
            if ((!data || !Array.isArray(data.streams) || data.streams.length === 0) && rawId.startsWith('cnc:')) {
                const altTypes = ['tv', 'other', 'movie', 'series'].filter(t => t !== targetType);
                for (const alt of altTypes) {
                    try {
                        const altUrl = `${UPSTREAM_RESOLVER}/stream/${encodeURIComponent(alt)}/${encodeURIComponent(rawId)}.json`;
                        const altData = await fetchJson(altUrl);
                        if (altData && Array.isArray(altData.streams) && altData.streams.length > 0) {
                            data = altData;
                            break;
                        }
                    } catch (e) {}
                }
            }

            let streams = Array.isArray(data?.streams) ? data.streams : [];

            // 3. Filter out donation ads / externalUrl streams with no playable url
            streams = streams.filter(s => s && s.url && typeof s.url === 'string' && s.url.trim().length > 0 && !s.externalUrl);

            // 4. Apply Luxury Yogesh Streamer Branding and Mixed Content Proxy
            const brandedStreams = streams.map(stream => {
                let name = stream.name || 'Yogesh Streamer';
                name = name.replace(/•?\s*CNCVerse Bridge/gi, '• Yogesh Streamer');
                if (!name.includes('Yogesh Streamer')) {
                    name = `🌟 [Yogesh Streamer] ${name}`;
                }

                let title = stream.title || '';
                title = title.replace(/CNCVerse Bridge/gi, 'Yogesh Streamer');

                let streamUrl = (stream.url || '').trim();

                const isSecure = !host.includes('localhost') && !host.includes('127.0.0.1');
                const proto = isSecure ? 'https' : 'http';

                if (streamUrl.startsWith('http://cncverse.dpdns.org')) {
                    streamUrl = streamUrl.replace('http://cncverse.dpdns.org', 'https://cncverse.dpdns.org');
                } else if (streamUrl.startsWith('http://')) {
                    streamUrl = `${proto}://${host}/proxy/stream?url=${encodeURIComponent(streamUrl)}`;
                }

                return {
                    ...stream,
                    url: streamUrl,
                    name,
                    title
                };
            });

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
        try {
            // If Stremio is requesting /catalog/movie/cnc_..._other.json, map to /catalog/other/cnc_..._other.json upstream
            let mappedPath = pathname;
            let isMovieMappedFromOther = false;
            if (pathname.startsWith('/catalog/movie/') && pathname.includes('_other')) {
                mappedPath = pathname.replace('/catalog/movie/', '/catalog/other/');
                isMovieMappedFromOther = true;
            }

            const upstreamUrl = `${UPSTREAM_RESOLVER}${mappedPath}`;
            const data = await fetchJson(upstreamUrl);

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

            const upstreamUrl = `${UPSTREAM_RESOLVER}/meta/${encodeURIComponent(targetType)}/${encodeURIComponent(rawId)}.json`;
            const data = await fetchJson(upstreamUrl);

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

            const upstreamUrl = `${UPSTREAM_RESOLVER}/subtitles/${encodeURIComponent(targetType)}/${encodeURIComponent(rawId)}.json`;
            const data = await fetchJson(upstreamUrl);
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

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🌟 Yogesh Streamer Multi-Device Bridge Online!`);
    console.log(`📡 Listening on http://localhost:${PORT}`);
    console.log(`📋 Manifest URL: http://localhost:${PORT}/manifest.json`);
    console.log(`====================================================`);
});
