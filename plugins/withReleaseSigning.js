// Expo config plugin: sign release builds with your own upload key instead of the public debug key.
// The key and passwords stay outside the repo, in ~/.gradle/gradle.properties:
//   PDF_TOOLS_UPLOAD_STORE_FILE=C:/Users/you/.android-keys/pdf-tools-upload.jks
//   PDF_TOOLS_UPLOAD_KEY_ALIAS=pdf-tools
//   PDF_TOOLS_UPLOAD_STORE_PASSWORD=...
//   PDF_TOOLS_UPLOAD_KEY_PASSWORD=...
// Without them, release builds keep using the debug key so local builds still work.
// Lives here, not in android/, so it survives `expo prebuild --clean`.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// withReleaseSigning';

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes(MARK)) return cfg;
    g = g.replace(
      /signingConfigs \{\n/,
      `signingConfigs {
        ${MARK}
        if (findProperty('PDF_TOOLS_UPLOAD_STORE_FILE')) {
            release {
                storeFile file(findProperty('PDF_TOOLS_UPLOAD_STORE_FILE'))
                storePassword findProperty('PDF_TOOLS_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('PDF_TOOLS_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('PDF_TOOLS_UPLOAD_KEY_PASSWORD')
            }
        }
`,
    );
    g = g.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      `$1signingConfig findProperty('PDF_TOOLS_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`,
    );
    if (!g.includes("signingConfigs.release : signingConfigs.debug")) throw new Error('withReleaseSigning: build.gradle layout changed');
    cfg.modResults.contents = g;
    return cfg;
  });
