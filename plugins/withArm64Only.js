// Expo config plugin: build native code for arm64-v8a only (every Android phone from the last
// ~8 years). Dropping armeabi-v7a/x86/x86_64 cuts the APK's native libs to about a quarter.
// Lives here, not in android/, so it survives `expo prebuild --clean`.
// ponytail: x86_64 emulators and old 32-bit phones can't install it; add their ABIs back if needed.
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'reactNativeArchitectures';

module.exports = (config) =>
  withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value: 'arm64-v8a' });
    return cfg;
  });
