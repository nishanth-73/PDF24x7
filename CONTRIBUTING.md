# Contributing to PDF24x7

Thank you for your interest in contributing to PDF24x7! We welcome bug fixes, documentation improvements, UI enhancements, and new PDF tool capabilities.

---

## Code of Conduct

Please treat everyone in the community with respect, kindness, and professionalism.

---

## Getting Started

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/nishanth-73/PDF24x7.git
   cd PDF24x7
   ```
2. **Environment requirements**:
   - JDK 17 or higher
   - Android SDK with Compile SDK 36 and SDK Extension 19
   - Android Studio Meerkat or newer (recommended), or command-line Gradle

3. **Verify your local setup**:
   ```bash
   .\gradlew.bat :app:compileReleaseKotlin
   .\gradlew.bat :app:testReleaseUnitTest
   ```

---

## Development Guidelines

### 1. Code Style and Architecture
- PDF24x7 is written in modern **Kotlin** with **Jetpack Compose** and Material 3.
- Follow the official Kotlin code style (`kotlin.code.style=official`).
- Use small, direct edits and match surrounding comment density.
- Colors must be sourced from the project palette (`c.*`, `Brand.*`), never hardcoded in screen components.
- Navigation icons are vector drawables sourced from SVG assets using `NavSvgIcon` with `BlendMode.SrcIn`.

### 2. Privacy and Offline First
- **Never** add network tracking, analytics SDKs, advertising, or background telemetry.
- All PDF operations, camera edge detection, and OCR must remain 100% on-device.

### 3. Verification Before Submitting
Before opening a pull request, ensure all checks pass:
```bash
# Verify release compilation
.\gradlew.bat :app:compileReleaseKotlin

# Run JVM unit tests
.\gradlew.bat :app:testReleaseUnitTest

# Verify debug build output
.\gradlew.bat :app:assembleDebug
```

---

## Pull Request Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Commit your changes with clear, descriptive commit messages.
3. Push to your fork and submit a Pull Request to `nishanth-73/PDF24x7:main`.
4. Fill out the pull request template and include screenshots/videos for UI changes.

