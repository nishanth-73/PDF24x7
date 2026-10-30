# Security Policy

## Supported Versions

Security updates and bug fixes are applied to the latest `main` branch and current release.

| Version | Supported          |
| ------- | ------------------ |
| 2.1.x   | :white_check_mark: |
| < 2.1   | :x:                |

---

## Security Model & Scope

PDF24x7 is designed as an offline-first, client-side utility:
- **Zero Telemetry**: No third-party network connections, beacons, or crash reporters.
- **Sandboxed Storage**: Files remain in internal sandboxed application storage unless explicitly exported or synced to your own Google Drive.
- **On-Device Cryptography**: PDF password protection and removal use industry-standard PDFBox encryption implementations directly on your hardware.

---

## Reporting a Vulnerability

If you discover a security vulnerability or potential privacy concern:

1. **Do not** disclose the vulnerability publicly in GitHub issues or public forums.
2. Email the details to `medurinishanth78@gmail.com` with:
   - Description of the vulnerability.
   - Steps or proof of concept to reproduce.
   - Potential impact on document privacy or device integrity.
3. You will receive an acknowledgment within 48 hours, followed by updates as the issue is investigated and patched.

