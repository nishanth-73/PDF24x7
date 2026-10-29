# PDF24x7

<p align="center">
  <img src="assets/branding/pdf24x7_logo.svg" alt="PDF24x7 Logo" width="280">
</p>

<p align="center">
  <b>24 offline PDF tools and a native document scanner for Android.</b><br>
  Everything runs entirely on your phone. No accounts, no ads, no cloud processing, no tracking.
</p>

<p align="center">
  <img alt="Platform: Android" src="https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white">
  <img alt="Min SDK: 24" src="https://img.shields.io/badge/minSdk-24-351E28">
  <img alt="Target SDK: 36" src="https://img.shields.io/badge/targetSdk-36-0572EC">
  <img alt="Kotlin 2.2" src="https://img.shields.io/badge/Kotlin-2.2-7F52FF?logo=kotlin&logoColor=white">
  <img alt="Jetpack Compose" src="https://img.shields.io/badge/Jetpack%20Compose-Material%203-4285F4?logo=jetpackcompose&logoColor=white">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-0572EC">
  <img alt="Privacy First" src="https://img.shields.io/badge/Privacy-100%25%20On--Device-success">
</p>

---

## Overview

**PDF24x7** (`com.pandu78.PDF24x7`) is a native Android application built with Kotlin and Jetpack Compose. It packages a full suite of PDF editing, organization, optimization, and document scanning capabilities into a single lightweight app designed to run 100% on-device.

The repository also includes static web documentation and a privacy policy in the `docs/` folder, pre-configured for instant deployment to [Vercel](https://vercel.com) or GitHub Pages.

---

## Features

### 📷 Document Scanner
- Camera scanner with live page-edge detection, automatic or manual capture, flash support, and front/back camera selection.
- Modes for documents, books (two pages per shot), ID cards (front and back merged onto a single page), business cards, and whiteboards.
- Perspective correction, crop, rotate, and document filters (Auto Colour, Light Text, Grayscale, Whiteboard, Brightness & Contrast).
- Cleanup and markup brush tools with color picking straight off the page.
- On-device searchable OCR: automatically adds an invisible text layer to scans.

### 🛠️ 24 PDF Tools
| Category | Included Tools |
|---|---|
| **Combine & Split** | Merge · Alternate & Mix · Split · Split by Text · Split by Bookmarks · Split in Half · Split by Size · PDF to ZIP |
| **Arrange Pages** | Organize (reorder, rotate, delete) · Rotate · Flip · Multiple Pages per Sheet · Crop & Resize |
| **Fill & Mark Up** | Fill & Sign (drawn and saved signatures) · Watermark · Page Numbers · Redact · Edit PDF Metadata |
| **Protect & Compress** | Compress (by level or target file size) · OCR (Searchable PDF) · Set Password · Remove Password |
| **Automate** | Workflow Builder (chain multiple actions across single or batch PDFs) |

- **Custom Navigation**: Modern floating pill navigation bar with instant access to Home, Tools, Files, Profile, and a dedicated Camera scanner action button.
- **In-App PDF Viewer**: Built on Android's `androidx.pdf` viewer engine with pinch-to-zoom, search highlights, text selection/copy, page thumbnails, and fast scrolling.
- **Local Storage & Optional Google Drive**: Secure sandboxed app storage with optional two-way sync to a dedicated `PDF24x7` Google Drive folder (`drive.file` scope only).

---

## Tech Stack

| Component | Technology |
|---|---|
| **Language & Framework** | Kotlin 2.2, Jetpack Compose (BOM `2026.06.01`), Material 3, Navigation Compose |
| **PDF Processing Engine** | [PdfBox-Android](https://github.com/TomRoush/PdfBox-Android) (`com.tom-roush:pdfbox-android:2.0.27.0`) |
| **PDF Viewer** | [Jetpack PDF](https://developer.android.com/jetpack/androidx/releases/pdf) (`androidx.pdf:pdf-compose:1.0.0-alpha18`) |
| **Camera & Vision** | CameraX (`1.6.0`), OpenCV (`4.12.0`) with bundled DocAligner LC100 ONNX model, ZXing QR scanning |
| **OCR** | Google ML Kit On-Device Text Recognition |
| **Blur & Effects** | [Haze](https://github.com/chrisbanes/haze) |
| **Build System** | Gradle 8.11 with Kotlin DSL (`build.gradle.kts`) |
| **Web Docs & Privacy** | Static HTML5/CSS3 in `docs/`, deployed via Vercel (`vercel.json`) |

---

## Prerequisites

- **Java Development Kit (JDK)**: JDK 17 or higher (tested with Eclipse Adoptium OpenJDK 21).
- **Android SDK**: Compile SDK `36` with SDK extension `19` (required by Jetpack PDF 1.0.0-alpha18).
- **Operating System**: Windows, macOS, or Linux.

---

## Building and Running

Clone the repository:
```bash
git clone https://github.com/nishanth-73/PDF24x7.git
cd PDF24x7
```

### 1. Compile Kotlin Sources
```bash
# Windows
.\gradlew.bat :app:compileReleaseKotlin

# Linux / macOS
./gradlew :app:compileReleaseKotlin
```

### 2. Run JVM Unit Tests
```bash
.\gradlew.bat :app:testReleaseUnitTest
```

### 3. Build Debug APK
```bash
.\gradlew.bat :app:assembleDebug
# Output located at: app/build/outputs/apk/debug/app-debug.apk
```

### 4. Install onto Connected Device via ADB
```bash
# Debug install
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.pandu78.PDF24x7/.MainActivity
```

### 5. Build Minified Release APK
```bash
.\gradlew.bat :app:assembleRelease
# Output located at: app/build/outputs/apk/release/app-release.apk
```

Release builds use R8 minification and resource shrinking. To configure release signing, copy the template in `gradle.properties.example` into your local `~/.gradle/gradle.properties`:
```properties
PDF_TOOLS_UPLOAD_STORE_FILE=/path/to/upload.jks
PDF_TOOLS_UPLOAD_STORE_PASSWORD=your_keystore_password
PDF_TOOLS_UPLOAD_KEY_ALIAS=your_key_alias
PDF_TOOLS_UPLOAD_KEY_PASSWORD=your_key_password
```

---

## Vercel Deployment

The `docs/` directory contains the web landing page, terms of service, and privacy policy. The repository is pre-configured with `vercel.json` for zero-configuration static deployment:

1. **Deploy with Vercel CLI**:
   ```bash
   npm i -g vercel
   vercel
   ```
2. **Deploy via GitHub Integration**:
   - Import `https://github.com/nishanth-73/PDF24x7` into your [Vercel Dashboard](https://vercel.com/new).
   - Vercel automatically reads [`vercel.json`](vercel.json), pointing `outputDirectory` to `docs` with clean URLs. No custom build commands or environment variables are required.

---

## Security & Privacy

- **Zero Telemetry**: No analytics libraries, crash report beacons, or user tracking SDKs.
- **Offline Processing**: All document parsing, rendering, OCR, and editing run strictly within local memory and sandboxed app storage.
- **Safe Cloud Sync**: Google Drive integration is opt-in and uses the restricted `drive.file` scope, granting the app access only to the files and folders it creates.
- For vulnerability disclosures, please review [SECURITY.md](SECURITY.md).

---

## Contributing

Contributions, bug reports, and suggestions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for code conventions, testing standards, and pull request workflows.

---

## License

This project is licensed under the [MIT License](LICENSE).
Third-party libraries, fonts, and model assets are used under their respective open-source licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for complete details.
