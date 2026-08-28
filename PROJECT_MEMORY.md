# 🧠 YOGESH STREAMER — MASTER PROJECT MEMORY & ARCHITECTURAL BIBLE

**Last Updated:** August 28, 2026  
**Project:** Yogesh Streamer Multi-Platform Edition  
**Repository:** `https://github.com/shahrukh-hack/yogesh-streamer-multiplatform`  
**Package ID:** `com.yogesh.streamer`  

---

## 🛑 1. The 6 Non-Negotiable User Rules & Past Issues (NEVER FORGET)

### ❌ Past Problem 1: Third-Party Popups & "Join CNCV Telegram" Prompts
* **Cause:** Rogue plugin authors hardcoded `AlertDialog` and popup triggers into their compiled `.cs3` files.
* **Strict Rule:** **ZERO third-party `.cs3` binaries and ZERO ad-injecting iframes.** All video extraction must be done 100% headlessly in Kotlin, feeding raw `.m3u8` / `.mp4` URLs directly to ExoPlayer.

### ❌ Past Problem 2: 7 Rows with Duplicate Content on Home Screen
* **Cause:** Multiple plugins were querying the same trending APIs in parallel and creating 7 duplicate rows for the same movie.
* **Strict Rule:** **Curated Single-Row Architecture.** The Home screen must have **exactly ONE** dedicated row for Gujarati Cinema, **ONE** dedicated row for Bollywood Blockbusters, **ONE** dedicated row for South Hindi Dubbed, and **ONE** dedicated row for Live Cricket.

### ❌ Past Problem 3: "Package Conflicts with an Existing Package" on Update
* **Cause:** Changing `applicationId` (e.g. `.debug` suffix) or using randomly generated keystores across CI builds.
* **Strict Rule:** Fixed package ID `com.yogesh.streamer` and **deterministic release keystore** (`release.jks` with alias `yogesh` and fixed password) locked in Gradle and GitHub Actions.

### ❌ Past Problem 4: Broken / Buffering Live Cricket Links
* **Cause:** Free web streams changed tokens and expired.
* **Strict Rule:** Headless token signing and direct HLS extraction for Star Sports 1 Hindi HD, Willow HD, and Astro Cricket 60fps with real-time cloud fallback resolvers.

### ❌ Past Problem 5: Missing Multi-Audio & Subtitle Track Selection
* **Cause:** Web player / basic players lacked audio track switching.
* **Strict Rule:** **ExoPlayer Media3 Multi-Audio HUD.** Users must be able to tap the Audio (🔊) button in the player and switch between Hindi Dubbed, Gujarati, English, Tamil, and Telugu audio tracks.

### ❌ Past Problem 6: Adult / 18+ Unwanted Content
* **Cause:** Unvetted providers pulling NSFW feeds.
* **Strict Rule:** **Family Safe Mode locked to ON.** Hardcoded filter against adult/NSFW keywords and 18+ content.

---

## 🏛️ 2. Core Architecture Blueprint

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    YOGESH STREAMER UNIFIED ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [1] UI LAYER (Jetpack Compose Material 3 & TV Leanback)                    │
│      ├── Dual Layout: Phone/Tablet BottomBar + Android TV/FireStick Rail    │
│      ├── Royal Theme: Pure Charcoal (#0A0E17), Gold (#FFD700), Cyan (#00E5FF)│
│      ├── Y+M Luxury Monogram Branding                                      │
│      └── Om Namah Shivaya Startup Audio Engine                              │
│                                                                             │
│  [2] CATALOG ENGINE (Curated, Deduplicated, Fast)                           │
│      ├── 🎭 Gujarati Cinema (380+ Verified Titles)                          │
│      ├── 🎬 Bollywood Blockbusters (10,400+ Verified Titles)                │
│      ├── 🌟 South Hindi Dubbed                                              │
│      ├── 🏏 Live Cricket & Sports Schedule                                  │
│      └── 🔍 Instant Search with Real-time Suggestions                       │
│                                                                             │
│  [3] CLOUDSTREAM-INSPIRED HEADLESS EXTRACTOR ENGINE (0% Ads)                │
│      ├── StreamWish & FileLions Decryptor (Unpacks eval(p,a,c,k,e,d))       │
│      ├── SuperStream & VidCloud Direct CDN Extractor                        │
│      ├── CastleTV Direct Headless Scraper                                   │
│      ├── Cricify & Sktech Direct HLS Live Stream Decryptor                  │
│      └── 4-Server Automatic Fallback (Server 1 → Server 2 → Server 3)       │
│                                                                             │
│  [4] PLAYER ENGINE (Media3 ExoPlayer)                                       │
│      ├── Native Multi-Audio Track Selector (Hindi / Gujarati / English)     │
│      ├── Multi-Language Subtitles                                           │
│      ├── TV Remote D-Pad Navigation & Phone Gesture Controls                │
│      └── Picture-in-Picture (PiP) & Background Playback                     │
│                                                                             │
│  [5] DETERMINISTIC CI/CD & UPDATER                                          │
│      ├── Fixed Keystore: release.jks (alias: yogesh)                        │
│      └── In-App Auto-Updater via GitHub Releases API                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 3. Fixed Signing & Security Credentials
* **Keystore File:** `app/release.jks`
* **Keystore Password:** `yogesh_streamer_pass`
* **Key Alias:** `yogesh`
* **Key Password:** `yogesh_streamer_pass`
* **DName:** `CN=Yogesh, OU=Streamer, O=Yogesh, L=Ahmedabad, S=Gujarat, C=IN`
