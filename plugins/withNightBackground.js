// Expo config plugin: dark launch window in dark mode. Android paints the activity's windowBackground before any JS runs,
// and prebuild only writes the light color, so the app flashes white on a dark phone. A values-night copy fixes it
// (AppTheme already inherits Theme.AppCompat.DayNight, so Android picks the night value automatically).
// Lives here, not in android/, so it survives `expo prebuild --clean`.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const DARK = '#0A0A0A'; // keep in step with palettes.dark.bg in src/theme.ts

module.exports = (config) =>
  withDangerousMod(config, ['android', (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'values-night');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'colors.xml'),
      `<resources>\n  <color name="activityBackground">${DARK}</color>\n  <color name="iconBackground">${DARK}</color>\n</resources>\n`,
    );
    return cfg;
  }]);
