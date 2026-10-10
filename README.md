# 🌟 Yogesh Streamer • Multi-Platform Cinema Edition

<div align="center">

<img src="https://raw.githubusercontent.com/shahrukh-hack/yogesh-streamer/master/assets/logos/cinematic_gold_logo_1787579512053.jpg" alt="Yogesh Streamer Logo" width="160" style="border-radius: 50%; border: 3px solid #FFD700; box-shadow: 0 0 25px rgba(255, 215, 0, 0.5);" />

### Luxury Cross-Platform Cinema App for Android, iOS PWA, Smart TVs & Web 🎬

[![Release](https://img.shields.io/badge/Release-v1.4.2-FFD700.svg?style=for-the-badge&logo=android)](https://github.com/shahrukh-hack/yogesh-streamer-multiplatform/releases)
[![Platforms](https://img.shields.io/badge/Platforms-Android%20%7C%20Smart%20TV%20%7C%20FireStick%20%7C%20iOS%20PWA-00E5FF.svg?style=for-the-badge)](https://github.com/shahrukh-hack/yogesh-streamer-multiplatform)
[![Security](https://img.shields.io/badge/Access-6--Digit%20PIN%20Protected-00E676.svg?style=for-the-badge&logo=shield)](https://github.com/shahrukh-hack/yogesh-streamer-multiplatform)
[![Video Engine](https://img.shields.io/badge/Streaming-4K%20UHD%20%2B%20ExoPlayer-FF2E56.svg?style=for-the-badge)](https://github.com/shahrukh-hack/yogesh-streamer-multiplatform)

---

### 📥 [Download Official Android APK (v1.4.2)](https://github.com/shahrukh-hack/yogesh-streamer-multiplatform/releases/download/v1.4.2/YogeshStreamer-v1.4.2.apk)
#### 📺 TV Downloader Short Link: `tinyurl.com/y-streamer-apk`
#### 🌐 [Launch Web & iOS PWA App](https://yogesh-streamer-bridge.onrender.com/app) • 📋 [View All Releases](https://github.com/shahrukh-hack/yogesh-streamer-multiplatform/releases)

</div>

---

## 📖 Overview

**Yogesh Streamer Multi-Platform Edition** is a modern, unified entertainment system that brings cinema blockbusters, trending web series, 24/7 live television, and sports coverage to any screen:
- **Android Native App (`.apk`)**: Designed for Android smartphones, tablets, Google TV, Android TV, and Amazon Fire TV Sticks.
- **Standalone Web / iOS PWA (`index.html`)**: A luxury browser-based cinema app that runs on iPhone/iPad Safari (as a PWA), Desktop browsers, and Smart TV browsers (Samsung Tizen, Toshiba VIDAA, LG webOS).

---

## ✨ Features & Architecture

### 🔒 6-Digit Family Security PIN Protection
- **Private Access Control**: Family security code gateway prevents unauthorized access.
- **Cross-Platform Controls**:
  - **Smart TV Remotes**: Physical remote number buttons (`0`–`9`) directly enter digits; D-Pad arrows navigate the on-screen keypad.
  - **Desktop / Laptop**: Type numbers (`0`–`9`) directly on keyboard; `Backspace` deletes; `Enter` submits.
  - **Mobile Touch**: Tactile 3×4 on-screen keypad with glowing indicator circles.
- **Session Memory**: Secure session persistence in `localStorage` with a 1-tap lock button in the header.
- **Security Access**: Protected by your private 6-digit access code (configured via `APP_PIN` environment variable).

### 🎬 Netflix & Amazon Prime Style UI / UX
- **Dynamic Billboard**: Full-bleed backdrop trailers with high-resolution poster art and 1-tap playback.
- **18-Title Curated Carousels**: Optimized horizontal swipe rails with clean Hollywood title formatting.
- **"Explore All" (+N Titles) Cards**: OTT-style cards at the end of each category carousel.
- **Full Catalog Grid Modal ("See All")**: Tapping "See All" opens a full-screen collection viewer displaying 100+ titles in a responsive grid.

### ⚡ Direct HLS Streaming Engine
- High-definition HLS master playlists for 4K UHD, 1080p, and 720p streams with multi-audio language support.
- Built-in video player with spatial remote control:
  - `OK / Enter`: Play / Pause toggle
  - `Left Arrow`: Rewind 10 seconds
  - `Right Arrow`: Fast-forward 10 seconds
  - `Back / Return`: Close cinema player

### 📺 Supported Devices

1. **Android TV & Google TV** (Sony, TCL, Mi TV, OnePlus TV, Hisense)
2. **Amazon Fire TV** (FireStick 4K, FireStick Max, Fire TV Cube)
3. **Smart TVs via Web Browser** (Samsung Tizen, Toshiba VIDAA, LG webOS)
4. **Android Phones & Tablets** (Samsung, Pixel, OnePlus, Xiaomi, Vivo, Oppo)
5. **Apple iOS** (iPhone & iPad Safari PWA with Add to Home Screen)
6. **Desktop & Laptop** (Chrome, Safari, Edge, Firefox)

---

## 🚀 Running the Web / PWA App Locally

```bash
# 1. Clone the repository
git clone https://github.com/shahrukh-hack/yogesh-streamer-multiplatform.git
cd yogesh-streamer-multiplatform

# 2. Run the local Node.js server
APP_PIN=your_secret_6_digit_pin node server.js
```

Open your browser at:
`http://localhost:8080/`

Enter your secret 6-digit family PIN to unlock the cinema portal.

---

## 📦 Building the Android Native APK

To build the signed release APK from source:

```bash
# Using Gradle wrapper
./gradlew assembleRelease
```

The output APK will be generated at:
`app/build/outputs/apk/release/app-release.apk`

---

## 🔑 Configuration & Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `APP_PIN` | *User Defined* | 6-digit access code for the web cinema gateway |
| `PORT` | `8080` | Local HTTP server port |

---

## 📄 License

MIT License. Designed and maintained for the **Yogesh Streamer** ecosystem.
