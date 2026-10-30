package com.pandu78.PDF24x7.auth

import android.net.Uri
import com.pandu78.PDF24x7.BuildConfig

/**
 * Centralized configuration system for Supabase Authentication and API integration.
 *
 * Values are initialized from BuildConfig (derived from .env or local.properties at build time),
 * with support for runtime updates if needed.
 *
 * CRITICAL SECURITY NOTICE:
 * - SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are client-safe public keys.
 * - GOOGLE_CLIENT_ID (Web Client ID) is client-safe.
 * - GOOGLE_CLIENT_SECRET and SUPABASE_SERVICE_ROLE_KEY must NEVER be added here,
 *   to BuildConfig, or into the Android application codebase. They belong strictly
 *   in the Supabase Dashboard / secure server-side environment.
 *
 * See SUPABASE_SETUP.md for detailed configuration steps.
 */
object SupabaseConfig {

  /**
   * Your Supabase project URL (e.g. "https://abcdefghijklmnopqrst.supabase.co").
   * Loaded from BuildConfig.SUPABASE_URL or local.properties / .env.
   */
  var supabaseUrl: String = BuildConfig.SUPABASE_URL

  /**
   * Your Supabase publishable / anon public API key (starts with "eyJ...").
   * Loaded from BuildConfig.SUPABASE_PUBLISHABLE_KEY or local.properties / .env.
   */
  var supabasePublishableKey: String = BuildConfig.SUPABASE_PUBLISHABLE_KEY

  /** Backward-compatible alias for existing references */
  var supabaseAnonKey: String
    get() = supabasePublishableKey
    set(value) { supabasePublishableKey = value }

  /**
   * Google OAuth Web Client ID configured in Google Cloud Console and Supabase Dashboard.
   * Loaded from BuildConfig.GOOGLE_CLIENT_ID or local.properties / .env.
   */
  var googleClientId: String = BuildConfig.GOOGLE_CLIENT_ID

  /**
   * Custom scheme redirect URI registered in AndroidManifest.xml:
   * com.pandu78.pdf24x7://auth-callback
   */
  const val REDIRECT_URL = "com.pandu78.pdf24x7://auth-callback"

  /**
   * Returns true only when valid non-placeholder Supabase credentials have been provided.
   * Prevents simulating fake success or making calls to placeholder hosts.
   */
  val isConfigured: Boolean
    get() = supabaseUrl.isNotBlank() &&
      !supabaseUrl.contains("YOUR_PROJECT") &&
      supabaseUrl.startsWith("https://") &&
      supabasePublishableKey.isNotBlank() &&
      !supabasePublishableKey.contains("YOUR_SUPABASE")

  /**
   * Returns true only when a valid Google Web Client ID has been configured.
   */
  val isGoogleConfigured: Boolean
    get() = googleClientId.isNotBlank() &&
      !googleClientId.contains("YOUR_GOOGLE") &&
      googleClientId.contains(".apps.googleusercontent.com")

  // ── Supabase GoTrue Auth Endpoints ─────────────────────────────────────────

  private val baseAuthUrl: String
    get() = "${supabaseUrl.trimEnd('/')}/auth/v1"

  val tokenPasswordEndpoint: String
    get() = "$baseAuthUrl/token?grant_type=password"

  val tokenIdTokenEndpoint: String
    get() = "$baseAuthUrl/token?grant_type=id_token"

  val tokenRefreshEndpoint: String
    get() = "$baseAuthUrl/token?grant_type=refresh_token"

  val signupEndpoint: String
    get() = "$baseAuthUrl/signup"

  val recoverEndpoint: String
    get() = "$baseAuthUrl/recover"

  val userEndpoint: String
    get() = "$baseAuthUrl/user"

  val logoutEndpoint: String
    get() = "$baseAuthUrl/logout"

  /**
   * URL for browser-based OAuth authorization flow when native Google sign-in is not used.
   */
  val googleOAuthAuthorizeUrl: String
    get() = "$baseAuthUrl/authorize?provider=google&redirect_to=${Uri.encode(REDIRECT_URL)}"
}
