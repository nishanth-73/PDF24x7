# PDF24x7

<p align="center">
  <img src="assets/branding/pdf24x7_logo.svg" alt="PDF24x7 Logo" width="280">
</p>

<p align="center">
  <b>24 offline PDF tools and a native document scanner for Android.</b><br>
  Everything runs locally on your phone by default. Privacy-focused, offline-first document processing with planned cloud sync.
</p>

<p align="center">
  <img alt="Platform: Android" src="https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white">
  <img alt="Min SDK: 24" src="https://img.shields.io/badge/minSdk-24-351E28">
  <img alt="Target SDK: 36" src="https://img.shields.io/badge/targetSdk-36-0572EC">
  <img alt="Kotlin 2.2" src="https://img.shields.io/badge/Kotlin-2.2-7F52FF?logo=kotlin&logoColor=white">
  <img alt="Jetpack Compose" src="https://img.shields.io/badge/Jetpack%20Compose-Material%203-4285F4?logo=jetpackcompose&logoColor=white">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-0572EC">
  <img alt="Privacy First" src="https://img.shields.io/badge/Privacy-Offline--First-success">
</p>

---

## Overview

**PDF24x7** (`com.pandu78.PDF24x7`) is a native Android application built with Kotlin and Jetpack Compose. It packages a full suite of PDF editing, organization, optimization, and document scanning capabilities into a single lightweight app designed to run 100% on-device.

The repository also includes static web documentation and a privacy policy in the `docs/` folder, pre-configured for instant deployment to [Vercel](https://vercel.com) along with a serverless email feedback function (`/api/feedback`).

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

- **Navigation**: Floating navbar pill housing 4 tabs (Home, Tools, Files, Profile) with quick access to the dedicated round Camera action button.
- **In-App PDF Viewer**: Built on Android's `androidx.pdf` viewer engine with pinch-to-zoom, search highlights, text selection/copy, page thumbnails, and fast scrolling.
- **Local Storage & Optional Google Drive**: Secure sandboxed app storage with optional two-way sync to a dedicated `PDF24x7` Google Drive folder (`drive.file` scope only).

---

## Production Readiness Architecture

### 1. Authentication & Supabase Readiness
- **In-App Auth Flow**: Built directly into the **Profile** tab with Email, Password (with visibility toggle), Sign In, and Create Account modes.
- **Mandatory Consent**: Account creation strictly enforces an unchecked agreement checkbox for the Terms of Service and Privacy Policy before sign-up can proceed.
- **Supabase Integration Architecture**: Clean abstraction in `com.pandu78.PDF24x7.auth`:
  - `AuthManager` & `SupabaseConfig`: REST and OAuth endpoints ready for live connection.
  - Custom URL scheme `com.pandu78.pdf24x7://auth-callback` configured in `AndroidManifest.xml`.
  - When unconfigured, displays clear, honest status messages rather than simulating fake authentication.

### 2. In-App Feedback via Resend
- Replaced third-party form redirects with an in-app **Send Feedback** dialog directly in the Profile tab.
- Categorized submissions: Bug Report, Feature Request, PDF Processing Issue, and General Feedback.
- Backed by a secure serverless endpoint at `/api/feedback` using [Resend](https://resend.com) for email dispatch, keeping API keys off client devices.
- Automatic fallback to native email client (`mailto:`) if the backend service is offline or unconfigured.

### 3. Advertising Readiness
- Non-intrusive ad placement architecture in `com.pandu78.PDF24x7.ads`:
  - `AdBannerSlot`: Positioned at the bottom of Home, Tools, and Profile screens away from core buttons and editors.
  - Ads remain completely disabled (`AdConfig.isEnabled = false`) by default and collapse to zero height until a network provider (e.g., AdMob) is configured.

---

## Tech Stack

| Component | Technology |
|---|---|
| **Language & Framework** | Kotlin 2.2, Jetpack Compose (BOM `2026.06.01`), Material 3, Navigation Compose |
| **PDF Processing Engine** | [PdfBox-Android](https://github.com/TomRoush/PdfBox-Android) (`com.tom-roush:pdfbox-android:2.0.27.0`) |
| **PDF Viewer** | [Jetpack PDF](https://developer.android.com/jetpack/androidx/releases/pdf) (`androidx.pdf:pdf-compose:1.0.0-alpha18`) |
| **Camera & Vision** | CameraX (`1.6.0`), OpenCV (`4.12.0`) with bundled DocAligner LC100 ONNX model, ZXing QR scanning |
| **OCR** | Google ML Kit On-Device Text Recognition |
| **Backend & Auth Readiness** | Supabase Auth GoTrue API (`com.pandu78.PDF24x7.auth`) |
| **Email Feedback** | Resend Serverless API via Vercel (`api/feedback.js`) |
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

---

## Future Configuration Checklist

See [.env.example](.env.example) for placeholder values and detailed environment variable definitions.

### 1. Supabase Auth Setup
1. Create a project at [supabase.com](https://supabase.com).
2. Under **Project Settings -> API**, copy your **Project URL** and **anon public key**.
3. Under **Authentication -> URL Configuration**, add the redirect URL:
   ```
   com.pandu78.pdf24x7://auth-callback
   ```
4. Set `SupabaseConfig.supabaseUrl` and `SupabaseConfig.supabaseAnonKey` in `app/src/main/java/com/pandu78/PDF24x7/auth/SupabaseConfig.kt` (or supply via build config).

### 2. Resend Feedback Setup
1. Create an API key at [resend.com](https://resend.com) and verify your sending domain.
2. In your Vercel Project Settings, add:
   - `RESEND_API_KEY`: Your Resend API key.
   - `FEEDBACK_TO_EMAIL`: Destination support inbox.
   - `FEEDBACK_FROM_EMAIL`: Verified sender address.

### 3. Google AdMob Setup (When Ready)
1. Register app in Google AdMob and obtain App ID and Unit IDs.
2. Enable `AdConfig.isEnabled = true` and specify IDs in `AdConfig.kt`.

---

## Vercel Deployment

The repository includes both static documentation (`docs/`) and serverless functions (`api/feedback.js`):

1. **Deploy with Vercel CLI**:
   ```bash
   npm i -g vercel
   vercel
   ```
2. **Deploy via GitHub Integration**:
   - Import `https://github.com/nishanth-73/PDF24x7` into your [Vercel Dashboard](https://vercel.com/new).
   - Vercel automatically deploys static documentation from `docs/` and registers `/api/feedback`.

---

## Security & Privacy

- **Offline Processing**: All document parsing, rendering, OCR, and editing run strictly within local memory and sandboxed app storage.
- **Safe Cloud Sync**: Google Drive integration is opt-in and uses the restricted `drive.file` scope.
- **Zero Third-Party Trackers**: No hidden analytics SDKs or advertising beacons are active.
- For vulnerability disclosures, please review [SECURITY.md](SECURITY.md).

---

## License

This project is licensed under the [MIT License](LICENSE).
Third-party libraries, fonts, and model assets are used under their respective open-source licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for complete details.
