# Yogesh Streamer — Web-Based Multiplatform Architecture

> **SCOPE**: This document defines the architecture, directory structure, stream proxying rules, and operational workflows for the **Web-Based Multiplatform Cinema Bridge** (`yogesh-streamer-bridge` and `yogesh-streamer-multiplatform`).
> 
> *For the Native Android & Android TV app (Kotlin, ExoPlayer, Gradle), refer to the separate `yogesh-streamer` repository.*

---

## 1. Repositories & Environments

| Repository | Local Path | Branch | Target / Role |
| :--- | :--- | :--- | :--- |
| **`yogesh-streamer-bridge`** | `C:\Users\yoges\.gemini\antigravity\scratch\yogesh-streamer-bridge` | `main` | Production Render Web Bridge (`https://yogesh-streamer-bridge.onrender.com`) |
| **`yogesh-streamer-multiplatform`** | `C:\Users\yoges\.gemini\antigravity\scratch\yogesh-streamer-multiplatform` | `master` | Direct Web & TV Portal mirror |
| **`yogesh-streamer-plugins`** *(Shared)* | `C:\Users\yoges\.gemini\antigravity\scratch\yogesh-streamer-plugins` | `builds` | Shared manifest provider (`plugins.json`, `scrapers.json`) |

> [!IMPORTANT]
> **SYNCHRONIZATION RULE**: Always mirror changes to `server.js`, `app.html`, and `index.html` between `yogesh-streamer-bridge` and `yogesh-streamer-multiplatform`.

---

## 2. Core Web Files & Topology

```
yogesh-streamer-bridge / yogesh-streamer-multiplatform
├── server.js (Node.js High-Concurrency Backend & Reverse Proxy)
│    ├── Port: process.env.PORT || 10000
│    ├── Primary Upstream: https://cncverse.dpdns.org (with failover array)
│    ├── Stream Proxy: /proxy/stream/playlist.m3u8 (Injects Access-Control-Allow-Origin: *)
│    ├── IP / DNS Rewriter:
│    │    ├── Rewrites http://129.225.106.195 -> https://cncverse.dpdns.org
│    │    └── Rewrites http://140.238.244.130 -> https://cncverse.dpdns.org
│    ├── Native In-House Scrapers:
│    │    ├── Castle Cinema & Series (Instant In-Browser HLS, 611+ items)
│    │    ├── AniKoto & MegaPlay (Dynamic AES-256-CBC decryptor for cartoons & anime)
│    │    ├── HDHub4u 4K Extractor (Unpacks HubCloud Dean Edwards packed JS)
│    │    ├── VegaMovies Extractor (Direct 4K HDR & Dual-Audio links)
│    │    └── Live Satellite TV (800+ Indian Live TV streams)
│    └── Stream Classifier:
│         ├── Tier 1 (⚡ [In-App Player]): Castle, AniKoto, Live Sports, Verified HLS
│         ├── Tier 2 (🎬 [Cloud HLS]): Cloud HLS streams
│         └── Tier 3 (🚀 [4K / VLC]): High-bitrate MKV streams
│
├── app.html (Single Page Web Cinema App & High-End OTT Interface)
│    ├── Route Hash Navigation:
│    │    ├── #home       -> Hero Carousel, Trending Rails, Continue Watching
│    │    ├── #movies     -> Castle Cinema (Default Web Play) + 4K MKV Dropdown
│    │    ├── #series     -> Castle Web Series (Panchayat, Mirzapur, etc.) + 4K Dropdown
│    │    ├── #sports     -> Live Sports Arena sorted by 🔴 LIVE NOW matches
│    │    ├── #livetv     -> 800+ Indian Live TV channels with category chips
│    │    ├── #anime      -> AniKoto Anime + 35+ Hindi Cartoon Classics (Doraemon, Shinchan)
│    │    └── #gujarati   -> Complete Gujarati Cinema & Natak Vault
│    ├── Clean Netflix OTT Layout (Brittle category filter chips hidden; 100% titles browsable + Real-time search)
│    ├── Stream Picker Modal:
│    │    ├── Auto episode picker schema
│    │    ├── Tier-based stream badges
│    │    ├── In-App Play button
│    │    └── 1-Click VLC / MX intent & clipboard copy
│    ├── In-Browser Cinema Player:
│    │    ├── Hls.js MSE Engine (Handles all .m3u8 master playlists and decrypted streams)
│    │    └── Google Shaka Player (Used ONLY for pure .mpd manifests with ClearKey)
│    └── PIN Security:
│         ├── Family / Content PIN: 178757
│         └── Server PIN: 778899
└── index.html (Fast-loading portal landing page & app redirector)
```

---

## 3. Web Catalog & Stream Routing Details

### 🏰 Castle Cinema & Web Series
* **Default Engine**: Set as the 1st / default option in both `#movies` and `#series`.
* **Playability**: 100% Instant in-browser play via Hls.js without requiring VLC.
* **Endpoints**: `/catalog/other/cnc_CastleTV_other.json`, `/stream/series/{id}.json`.

### ⚔️ AniKoto & Kids Cartoons
* **Encryption**: Dynamic AES-256-CBC cipher with auto-extracted `fileId` and `sParam`.
* **Catalog**: 200+ titles with validated posters from `static.tvmaze.com`.
* **Titles**: *Doraemon*, *Shinchan*, *Ben 10*, *Pokemon*, *Oggy and the Cockroaches*, *Dragon Ball Z*, *Naruto*, *Tom and Jerry*, etc.

### 🏏 Live Cricket & Sports Arena
* **Providers**: `cnc_SportzXLiveEvents_tv`, `cnc_PlayFyLiveEvents_tv`, `cnc_PlayZTVLiveEvents_tv`, `cnc_LivXowLiveEvents_tv`, `cnc_SKTechLiveEvents_tv`.
* **Sorting Rule**: Actively broadcasting matches containing **`🔴`** in their name appear at the top with glowing red badges (`🔴 LIVE NOW`), followed by upcoming matches (`🔜 UPCOMING`).
* **FanCode Status**: Old FanCode raw GitHub links return 403 Forbidden and are excluded from default target lists.

### 🏛️ Gujarati Vault
* **Providers**: ShemarooMe Gujarati, OHO, JioCinema, YouTube Gujarati films.
* **Harvester**: Background non-blocking harvester caches 100+ Gujarati titles in `dynamicGujaratiMovies`.

---

## 4. Development & Testing Rules for Web Multiplatform

1. **PowerShell Python Execution**:
   - **Do NOT** execute multi-line python code with inline double quotes directly in PowerShell.
   - **Write** python scripts to `C:\Users\yoges\.gemini\antigravity\scratch\<test_name>.py` and run them using:
     `C:\Users\yoges\.gemini\antigravity\scratch\hyka-unified-command-center\venv\Scripts\python.exe C:\Users\yoges\.gemini\antigravity\scratch\<test_name>.py`
   - Include `import sys, io; sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')` to handle emojis without Windows cp1252 crashes.

2. **Syntax Validation Before Commit**:
   - Always run `validate_both_servers.py` before pushing:
     `python C:\Users\yoges\.gemini\antigravity\scratch\validate_both_servers.py`

3. **Playwright E2E Testing**:
   - Test against `https://yogesh-streamer-bridge.onrender.com/app`
   - Always pre-set PIN unlock in tests:
     ```javascript
     sessionStorage.setItem('ys_pin_unlocked', 'true');
     sessionStorage.setItem('ys_adult_pin_unlocked', 'true');
     ```
   - Verify that console logs have **0 Mixed Content errors**.
