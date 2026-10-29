package com.pandu78.PDF24x7.auth

/**
 * Configuration for Supabase Auth and database synchronization.
 *
 * To connect your Supabase project:
 * 1. Create a Supabase project at https://supabase.com
 * 2. In Project Settings -> API, retrieve your Project URL and anon public key.
 * 3. In Authentication -> URL Configuration:
 *    - Add Redirect URL: com.pandu78.pdf24x7://auth-callback
 * 4. Configure values below or via environment variables/BuildConfig in production.
 */
object SupabaseConfig {
  var supabaseUrl: String = "https://YOUR_PROJECT_REF.supabase.co"
  var supabaseAnonKey: String = "YOUR_SUPABASE_ANON_PUBLIC_KEY"

  /**
   * The custom scheme redirect URL registered in AndroidManifest.xml
   * for OAuth and email magic link / password reset handling.
   */
  const val REDIRECT_URL = "com.pandu78.pdf24x7://auth-callback"

  /**
   * Safe check: returns true only if genuine Supabase credentials have been supplied.
   * Prevents simulating or assuming successful connections when unconfigured.
   */
  val isConfigured: Boolean
    get() = supabaseUrl.isNotBlank() &&
      !supabaseUrl.contains("YOUR_PROJECT") &&
      supabaseAnonKey.isNotBlank() &&
      !supabaseAnonKey.contains("YOUR_SUPABASE")

  val tokenEndpoint: String get() = "${supabaseUrl.trimEnd('/')}/auth/v1/token?grant_type=password"
  val signupEndpoint: String get() = "${supabaseUrl.trimEnd('/')}/auth/v1/signup"
  val recoverEndpoint: String get() = "${supabaseUrl.trimEnd('/')}/auth/v1/recover"
  val userEndpoint: String get() = "${supabaseUrl.trimEnd('/')}/auth/v1/user"
}

