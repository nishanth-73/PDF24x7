package com.pandu78.PDF24x7.ads

/**
 * Clean, non-intrusive advertising configuration and slot management.
 *
 * Ads remain completely disabled by default until an ad network provider is selected,
 * SDK integrated, and legitimate IDs configured.
 */
enum class AdProvider {
  NONE,
  ADMOB,
  APPLOVIN,
  CUSTOM,
}

object AdConfig {
  /**
   * Master kill-switch. When false, ad slots take 0 space and make no network requests.
   */
  var isEnabled: Boolean = false

  /**
   * Selected provider once integrated.
   */
  var provider: AdProvider = AdProvider.NONE

  /**
   * Set true during UI development to preview ad slot layout balance without loading real ads.
   */
  var showDebugPlaceholders: Boolean = false

  /**
   * Placeholders for production AdMob/Network IDs.
   * Configure these in ~/.gradle/gradle.properties or remote config once approved.
   */
  var appId: String = ""
  var homeBannerUnitId: String = ""
  var toolsBannerUnitId: String = ""
  var interstitialUnitId: String = ""

  /**
   * Checks whether the ad configuration is live and ready.
   */
  val isLive: Boolean
    get() = isEnabled && provider != AdProvider.NONE && homeBannerUnitId.isNotBlank()
}

