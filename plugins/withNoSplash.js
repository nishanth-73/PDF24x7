// Expo config plugin: no splash screen on Android. Expo's prebuild template always adds one (a splash theme, logo
// drawables and a color), so this strips it again on every prebuild. Android 12+ still shows its own brief
// system splash with the app icon; apps can't turn that off.
// Lives here, not in android/, so it survives `expo prebuild --clean`.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withAndroidStyles, withAndroidColors, withMainActivity, withDangerousMod } = require('expo/config-plugins');

const SPLASH_THEME = 'Theme.App.SplashScreen';

module.exports = (config) => {
  config = withAndroidManifest(config, (cfg) => {
    for (const activity of cfg.modResults.manifest.application?.[0]?.activity ?? []) {
      if (activity.$['android:theme'] === `@style/${SPLASH_THEME}`) activity.$['android:theme'] = '@style/AppTheme';
    }
    return cfg;
  });

  config = withAndroidStyles(config, (cfg) => {
    const res = cfg.modResults.resources;
    res.style = (res.style ?? []).filter((s) => s.$.name !== SPLASH_THEME);
    return cfg;
  });

  config = withAndroidColors(config, (cfg) => {
    const res = cfg.modResults.resources;
    res.color = (res.color ?? []).filter((c) => c.$.name !== 'splashscreen_background');
    return cfg;
  });

  // The manifest already uses AppTheme, so the setTheme() call the template adds for expo-splash-screen isn't needed.
  config = withMainActivity(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /\s*\/\/ Set the theme to AppTheme BEFORE onCreate[^\n]*\n\s*\/\/[^\n]*\n\s*\/\/ This is required for expo-splash-screen\.\n\s*setTheme\(R\.style\.AppTheme\);?/,
      '',
    );
    return cfg;
  });

  return withDangerousMod(config, ['android', (cfg) => {
    const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
    for (const dir of fs.existsSync(res) ? fs.readdirSync(res) : []) {
      if (!dir.startsWith('drawable')) continue;
      for (const name of ['splashscreen_logo.png', 'splashscreen.xml', 'ic_launcher_background.xml']) {
        fs.rmSync(path.join(res, dir, name), { force: true }); // ic_launcher_background.xml is a leftover splash layer; the icon uses the mipmap
      }
    }
    return cfg;
  }]);
};
