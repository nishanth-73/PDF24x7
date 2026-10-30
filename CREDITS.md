# Credits & Acknowledgments

**PDF24x7** is maintained by the **PDF24x7 Project**.

The project is built upon open-source software and is based on the original work by **SammyZi**, licensed under the **MIT License**. We gratefully acknowledge the contributions of the original author and the open-source community.

---

## Original Project & Licensing

- **Original Creator / Author**: SammyZi
- **License**: [MIT License](LICENSE)
- **Copyright**: Copyright (c) 2026 SammyZi

The complete original MIT license text, permission notices, and disclaimer conditions are preserved verbatim in the root [LICENSE](LICENSE) file as required by the license terms.

---

## Open-Source Libraries & Frameworks

PDF24x7 integrates the following open-source libraries, each used in compliance with its respective license:

| Component / Library | Maintainer / Project | License | Purpose in PDF24x7 |
| :--- | :--- | :--- | :--- |
| **PdfBox-Android** | [Tom Roush](https://github.com/TomRoush/PdfBox-Android) / [Apache PDFBox](https://pdfbox.apache.org/) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | PDF document generation, parsing, merging, splitting, encryption, and editing. |
| **Jetpack PDF** (`androidx.pdf`) | [Google AndroidX](https://developer.android.com/jetpack/androidx/releases/pdf) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | High-performance in-app PDF viewing, search, text selection, and rendering engine. |
| **Jetpack Compose & AndroidX** | [Google AndroidX](https://developer.android.com/jetpack) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | Declarative UI framework, Navigation, Lifecycle, Activity Compose, and Material 3 design tokens. |
| **OpenCV** | [OpenCV Team](https://opencv.org/) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | Camera frame processing, automatic document edge detection, perspective transformation, and image filters. |
| **CameraX** | [Google AndroidX](https://developer.android.com/media/camera/camerax) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | Document scanner camera preview, tap-to-focus, flashlight control, and high-resolution photo capture. |
| **ML Kit Text Recognition** | [Google Developers](https://developers.google.com/ml-kit/vision/text-recognition/v2) | [Google ML Kit Terms](https://developers.google.com/ml-kit/terms) | On-device text recognition (OCR) creating searchable PDF text layers without sending data off-device. |
| **ZXing ("Zebra Crossing")** | [ZXing Authors](https://github.com/zxing/zxing) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | Fast QR code and barcode scanning. |
| **Haze** | [Chris Banes](https://github.com/chrisbanes/haze) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | Frosted-glass backdrop blur effect for floating navigation bars. |
| **Kotlin Coroutines & Serialization** | [JetBrains](https://github.com/Kotlin) | [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) | Asynchronous task management, background PDF processing, and type-safe data serialization. |
| **Google Play Services Auth** | [Google Inc.](https://developers.google.com/android/guides/overview) | [Google APIs Terms](https://developers.google.com/terms) | Google OAuth identity client for optional Google Drive document backup. |

---

## Machine Learning Models

- **DocAligner LC100**:
  - Author: [DocsaidLab](https://github.com/DocsaidLab/DocAligner)
  - Asset: Bundled locally as `app/src/main/assets/docaligner_lc100.onnx`
  - License: [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
  - Purpose: Real-time 4-point quadrilateral document corner detection in scanner camera view.

---

## Typography & Icons

- **Poppins Font Family**:
  - Designers: Indian Type Foundry, Jonny Pinhorn
  - License: [SIL Open Font License, Version 1.1](https://openfontlicense.org/)
- **Caveat Font Family**:
  - Designer: Pablo Impallari
  - License: [SIL Open Font License, Version 1.1](https://openfontlicense.org/)
- **Material Design Icons**:
  - Creators: [Pictogrammers](https://pictogrammers.com/)
  - License: [Pictogrammers Free License / Apache-2.0](https://pictogrammers.com/docs/general/license/)
  - Asset: `app/src/main/res/font/mdi.ttf`

---

## License Notice Retention

All third-party copyrights, trademark notices, and license files are preserved in compliance with their respective licensing agreements. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE) for full legal text.

