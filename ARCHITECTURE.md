---
name: yogesh-streamer-architecture
description: >-
  Master architectural mindmap, codebase navigation, system topology, and engineering guidelines
  for the Yogesh Streamer ecosystem (Web Cinema Bridge, Native Android/Android TV Client, and Extensions).
  Use whenever inspecting, modifying, debugging, or building Yogesh Streamer code.
---

# Yogesh Streamer — Master Architectural Mindmap & Engineering Guide

> **MANDATORY FOR ALL AGENTS**: Consult this skill at the start of any session involving `yogesh-streamer`, `yogesh-streamer-bridge`, or `yogesh-streamer-multiplatform`. It contains the complete architectural memory map, file locations, scraper engines, stream proxying rules, and operational workflows so you never waste time scanning the entire codebase.

---

## 1. Repository Topology & Synchronization

| Repository Name | Local Path | Git Branch | Upstream Deploy Target / Purpose |
| :--- | :--- | :--- | :--- |
| **`yogesh-streamer-bridge`** | `C:\Users\yoges\.gemini\antigravity\scratch\yogesh-streamer-bridge` | `main` | Production Render Web Bridge (`https://yogesh-streamer-bridge.onrender.com`) |
| **`yogesh-streamer-multiplatform`** | `C:\Users\yoges\.gemini\antigravity\scratch\yogesh-streamer-multiplatform` | `master` | Multiplatform web & TV portal mirror |
| **`yogesh-streamer`** | `C:\Users\yoges\.gemini\antigravity\scratch\yogesh-streamer` | `master` | Native Android & Android TV App (Kotlin, Jetpack Compose, Media3) |
| **`yogesh-streamer-plugins`** | `C:\Users\yoges\.gemini\antigravity\scratch\yogesh-streamer-plugins` | `builds` | Bundled CloudStream 3 plugin providers (`.cs3` extension artifacts) |

> [!IMPORTANT]
> **MULTI-REPO SYNC RULE**: Whenever modifying `server.js`, `app.html`, or `index.html`, **ALWAYS** mirror the edits to both `yogesh-streamer-bridge` and `yogesh-streamer-multiplatform`. Validate syntax with Chromium V8 before committing and pushing.

---

## 2. Web Cinema Bridge Mindmap (`server.js` & `app.html`)

```
Yogesh Streamer Web Bridge
 ├── server.js (Node.js High-Concurrency Reverse Proxy & Catalog Aggregator)
 │    ├── Dynamic Resolver Failover (UPSTREAM_RESOLVERS: cncverse.dpdns.org)
 │    ├── Stream Proxy (/proxy/stream/playlist.m3u8 with CORS Access-Control-Allow-Origin: *)
 │    ├── Dynamic IP/DNS Rewriter (http://129.225.106.195 & 140.238.244.130 -> https://cncverse.dpdns.org)
 │    ├── Native Scrapers & Decryptors:
 │    │    ├── 🏰 Castle Cinema & Web Series Engine (Instant In-Browser HLS, 611+ titles)
 │    │    ├── ⚔️ AniKoto & MegaPlay Decryptor (AES-256-CBC dynamic decryption, 200+ cartoons/anime)
 │    │    ├── 🏏 Live Cricket & Sports Router (SportzX, PlayFy, PlayZTV, LivXow, SKTech)
 │    │    ├── 🏛️ Gujarati Vault Harvester (ShemarooMe, OHO, JioCinema, YouTube Gujarati)
 │    │    ├── 🚀 HDHub4u & VegaMovies Native Resolvers (4K MKV & HubCloud unpackers)
 │    │    └── 📺 Live TV Aggregator (800+ satellite TV feeds)
 │    └── Stream Classifier & Tiering Engine:
 │         ├── Tier 1 (⚡ [In-App Player]): Instant HLS Web Play, No VLC required
 │         ├── Tier 2 (🎬 [Cloud HLS]): Cloud HLS streams for browser/VLC
 │         └── Tier 3 (🚀 [4K / VLC]): High-bitrate 4K MKV streams recommended for external players
 └── app.html (Single-Page Cinema Web App & High-End OTT Interface)
      ├── Navigation Tabs:
      │    ├── #home       -> Trending Rails, Continue Watching, Watchlist
      │    ├── #movies     -> Web-First Castle Cinema (Instant Play) + HDHub4u 4K Dropdown
      │    ├── #series     -> Castle Web Series (Panchayat, Mirzapur, etc.) + 4K MKV Dropdown
      │    ├── #sports     -> Live Sports Arena sorted by 🔴 LIVE NOW matches
      │    ├── #livetv     -> 800+ Live Indian Channels with Category Chips
      │    ├── #anime      -> AniKoto Anime + 35+ Hindi Cartoon Classics (Doraemon, Shinchan, etc.)
      │    └── #gujarati   -> Complete Gujarati Cinema & Natak Vault
      ├── Stream Picker Modal (Multi-Tier Classification, Episode Selector, Copy Link, VLC Intent)
      ├── Cinema Player Engine:
      │    ├── Hls.js (Direct MSE Blob attachment for master playlists & encrypted streams)
      │    ├── Google Shaka Player (Used ONLY for pure MPEG-DASH .mpd manifests with ClearKey)
      │    └── Web Player Iframe Embeds (For sandboxed cloud players)
      └── Parental & Privacy PIN Locks:
           ├── Family PIN: 178757
           └── Server / Admin PIN: 778899
```

---

## 3. Scraper Engines & Content Routing

### A. 🏰 Castle Cinema & Series Engine (Web-First Default)
* **Stream Types**: Direct `.m3u8` HLS streams (`hlscob.com`, `hscow.com`, `klnwm.com`).
* **Web Playability**: 100% Instant in-browser playback via Hls.js (Zero VLC requirement).
* **Catalog**: 611+ Bollywood/Hollywood titles and real web series (*Panchayat*, *Mirzapur*, *The Family Man*, *Special OPS*, *Gullak*, *Farzi*, *Asur*, *Aashram*).
* **ID Prefixes**: `cnc:Q2FzdGxlVFY...` or `CastleTV`.

### B. ⚔️ AniKoto & Cartoon Arena
* **Upstream Decryption**: Dynamic MegaPlay AES-256-CBC cipher with auto-extracted `fileId` and `sParam`.
* **Kids & Anime Titles**: *Doraemon*, *Shinchan*, *Ben 10*, *Pokemon*, *Oggy and the Cockroaches*, *Dragon Ball Z Hindi*, *Naruto Hindi*, *Tom and Jerry*, *Chhota Bheem*, *Mr. Bean*, *Death Note*, *Jujutsu Kaisen*.
* **Catalog Constant**: `NATIVE_CARTOONS_AND_ANIME_CATALOG` in `server.js` with validated TvMaze posters.

### C. 🏏 Live Cricket & Sports Arena
* **Verified Feeds**: `cnc_SportzXLiveEvents_tv`, `cnc_PlayFyLiveEvents_tv`, `cnc_PlayZTVLiveEvents_tv`, `cnc_LivXowLiveEvents_tv`, `cnc_SKTechLiveEvents_tv`.
* **Deprecated**: `native_live_sports_tv` (FanCode raw GitHub link returns 403 Forbidden; excluded from default targets).
* **Sorting Rule**: Actively broadcasting matches containing **`🔴`** in their title are sorted to the very top with glowing red pulsating badges (`🔴 LIVE NOW`), followed by upcoming matches (`🔜 UPCOMING`).
* **IP Rewrite**: Rewrites `http://129.225.106.195` and `http://140.238.244.130` to `https://cncverse.dpdns.org/d/master.m3u8`.

### D. 🏛️ Gujarati Vault
* **Engines**: ShemarooMe Gujarati, OHO Gujarati, JioCinema Gujarati, and native curated catalogs.
* **Storage**: In-memory cache `dynamicGujaratiMovies` with background harvesting from cloud resolvers.

### E. 🚀 HDHub4u & VegaMovies (4K Enthusiasts)
* **Stream Formats**: Multi-audio 4K HDR Blu-Ray MKV files, HubCloud links, Google Drive, Cloudflare R2.
* **Classifier**: Tagged as `Tier 3 (🚀 [4K / VLC])`. Provides direct launch into VLC/MX player or direct download.

---

## 4. Native Android & Android TV App (`yogesh-streamer`)

```
yogesh-streamer/
├── app/src/main/java/com/lagradost/cloudstream3/
│    ├── ui/
│    │    ├── sports/LiveSportsFragment.kt     # SWR Cache, 3.5s timeout, progressive flow
│    │    ├── youtube/YouTubeFragment.kt       # YouTube UI (Chips, search history, SWR cache)
│    │    ├── home/HomeFragment.kt             # TV D-Pad Rail Focus (Home, Sports, YouTube)
│    │    ├── player/DynamicRangeCompressor.kt # Dialogue Boost AudioProcessor (-24f, 12f gain)
│    │    ├── player/CS3IPlayer.kt             # ExoPlayer & Media3 pipeline
│    │    └── SplashVideoActivity.kt           # 3D Golden Intro (5.5s watchdog timeout)
│    ├── plugins/PluginManager.kt              # Bundled .cs3 loader & runtime verification
│    └── MainActivity.kt                       # Entrypoint, navigation, and TV layout bindings
└── .github/workflows/build_yogesh_streamer.yml# GitHub Actions CI build & release workflow
```

---

## 5. Agent Operational Guidelines & Best Practices

1. **Python Execution on Windows**:
   - **NEVER** pass multi-line Python code with embedded quotes via `powershell -Command "python -c \"...\""`. PowerShell parser breaks quotation marks and causes `SyntaxError: unterminated string literal`.
   - **ALWAYS** write multi-line Python scripts to `C:\Users\yoges\.gemini\antigravity\scratch\<script_name>.py` and execute them via `python C:\...\<script_name>.py`.
   - **UTF-8 Stdout**: Always prepend `import sys, io; sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')` to prevent Windows cp1252 crash on emoji characters (`🔴`, `⚡`, `🎬`).

2. **Syntax Validation Before Push**:
   - Before any commit, run `validate_both_servers.py` using Chromium V8:
     ```powershell
     C:\Users\yoges\.gemini\antigravity\scratch\hyka-unified-command-center\venv\Scripts\python.exe C:\Users\yoges\.gemini\antigravity\scratch\validate_both_servers.py
     ```

3. **Background Tasks & Waiting**:
   - Do **NOT** poll running tasks in a loop. The system provides reactive wakeups upon completion.
   - For Render deployments, allow 15–25 seconds for cloud builds, and verify live response headers before completing.

4. **PIN Codes**:
   - Family PIN: `178757`. Pre-set in `sessionStorage` in Playwright tests:
     ```javascript
     sessionStorage.setItem('ys_pin_unlocked', 'true');
     sessionStorage.setItem('ys_adult_pin_unlocked', 'true');
     ```
   - Server Admin PIN: `778899`.
