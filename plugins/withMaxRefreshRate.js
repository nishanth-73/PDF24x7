// Expo config plugin: on launch, ask Android for the display's fastest mode (e.g. 120 Hz) at the
// current resolution. Some phones keep apps at 60 Hz unless asked. Lives here, not in android/,
// so it survives `expo prebuild --clean`.
const { withMainActivity } = require('expo/config-plugins');

const ANCHOR = 'super.onCreate(null)';
const CODE = `
    // Max refresh rate (added by plugins/withMaxRefreshRate.js)
    @Suppress("DEPRECATION")
    val screen = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) display else windowManager.defaultDisplay
    screen?.let { d ->
      val current = d.mode
      d.supportedModes
        .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
        .maxByOrNull { it.refreshRate }
        ?.let { best -> window.attributes = window.attributes.apply { preferredDisplayModeId = best.modeId } }
    }`;

module.exports = (config) =>
  withMainActivity(config, (cfg) => {
    const { contents, language } = cfg.modResults;
    if (contents.includes('preferredDisplayModeId')) return cfg;
    if (language !== 'kt' || !contents.includes(ANCHOR)) {
      throw new Error('withMaxRefreshRate: expected a Kotlin MainActivity containing super.onCreate(null)');
    }
    cfg.modResults.contents = contents.replace(ANCHOR, ANCHOR + CODE);
    return cfg;
  });
