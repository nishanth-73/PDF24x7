package com.pandu78.PDF24x7.auth

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Patterns
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.activity.result.IntentSenderRequest
import com.google.android.gms.auth.api.identity.GetSignInIntentRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import kotlinx.coroutines.tasks.await
import com.pandu78.PDF24x7.appContext
import com.pandu78.PDF24x7.awaitResult
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder

/**
 * Production-ready Authentication Service Manager for PDF24x7.
 * Provides complete Supabase Auth integration:
 * - Email & Password Sign In
 * - Email & Password Sign Up (with Terms/Privacy consent recording)
 * - Google Sign-In via Supabase OAuth (Google ID Token & Custom Tab/Browser OAuth)
 * - Password Reset (Email Recovery & Password Update)
 * - Session Persistence & Automatic Session Refresh
 * - Sign Out
 * - Deep Link Callback Handling (com.pandu78.pdf24x7://auth-callback)
 */
object AuthManager {
  private const val PREFS_NAME = "pdf24x7_auth_prefs"
  private const val KEY_TOKEN = "access_token"
  private const val KEY_REFRESH = "refresh_token"
  private const val KEY_USER_ID = "user_id"
  private const val KEY_USER_EMAIL = "user_email"
  private const val KEY_CONSENT_VERSION = "consent_version"
  private const val KEY_CONSENT_TIME = "consent_time"

  private val _state = mutableStateOf<AuthState>(AuthState.Unauthenticated)
  val state: State<AuthState> get() = _state

  private val _recoveryToken = mutableStateOf<String?>(null)
  val recoveryToken: State<String?> get() = _recoveryToken

  private val prefs by lazy {
    appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  val currentAccessToken: String?
    get() = prefs.getString(KEY_TOKEN, null)

  val currentRefreshToken: String?
    get() = prefs.getString(KEY_REFRESH, null)

  init {
    loadSavedSession()
  }

  private fun loadSavedSession() {
    val token = prefs.getString(KEY_TOKEN, null)
    val email = prefs.getString(KEY_USER_EMAIL, null)
    val id = prefs.getString(KEY_USER_ID, null)
    val consentVersion = prefs.getInt(KEY_CONSENT_VERSION, 2)
    val consentTime = prefs.getLong(KEY_CONSENT_TIME, 0L)

    if (!token.isNullOrBlank() && !email.isNullOrBlank() && !id.isNullOrBlank()) {
      _state.value = AuthState.Authenticated(
        AuthUser(
          id = id,
          email = email,
          consentVersion = consentVersion,
          consentTimestamp = consentTime,
        )
      )
    } else {
      _state.value = AuthState.Unauthenticated
    }
  }

  fun isValidEmail(email: String): Boolean =
    email.isNotBlank() && Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches()

  fun isValidPassword(password: String): Boolean =
    password.length >= 6

  // ── 1. Email & Password Sign In ───────────────────────────────────────────

  fun signIn(
    email: String,
    password: String,
    scope: CoroutineScope,
    onResult: (AuthResult<AuthUser>) -> Unit,
  ) {
    val cleanEmail = email.trim()
    if (!isValidEmail(cleanEmail)) {
      onResult(AuthResult.Error("Please enter a valid email address."))
      return
    }
    if (!isValidPassword(password)) {
      onResult(AuthResult.Error("Password must be at least 6 characters."))
      return
    }

    if (!SupabaseConfig.isConfigured) {
      onResult(
        AuthResult.Error(
          "Supabase Auth is not configured yet. Please configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env or local.properties."
        )
      )
      return
    }

    _state.value = AuthState.Loading("Signing in…")
    scope.launch {
      val result = withContext(Dispatchers.IO) {
        try {
          val url = URL(SupabaseConfig.tokenPasswordEndpoint)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
            setRequestProperty("Authorization", "Bearer ${SupabaseConfig.supabasePublishableKey}")
            doOutput = true
            connectTimeout = 12000
            readTimeout = 12000
          }

          val payload = JSONObject().apply {
            put("email", cleanEmail)
            put("password", password)
          }

          OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
          val code = conn.responseCode
          val responseText = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.use { it.readText() } ?: ""

          if (code in 200..299) {
            val json = JSONObject(responseText)
            val accessToken = json.optString("access_token")
            val refreshToken = json.optString("refresh_token")
            val userObj = json.optJSONObject("user")
            val id = userObj?.optString("id") ?: ""

            saveSession(accessToken, refreshToken, id, cleanEmail, 2, System.currentTimeMillis())
            val user = AuthUser(id = id, email = cleanEmail)
            AuthResult.Success(user)
          } else {
            val errJson = runCatching { JSONObject(responseText) }.getOrNull()
            val msg = errJson?.optString("error_description")
              ?: errJson?.optString("msg")
              ?: errJson?.optString("message")
              ?: "Authentication failed (HTTP $code)."
            AuthResult.Error(msg)
          }
        } catch (e: Exception) {
          AuthResult.Error("Connection error: ${e.localizedMessage ?: "Unknown error"}", e)
        }
      }

      when (result) {
        is AuthResult.Success -> _state.value = AuthState.Authenticated(result.data)
        is AuthResult.Error -> _state.value = AuthState.Error(result.message)
      }
      onResult(result)
    }
  }

  // ── 2. Email & Password Sign Up ───────────────────────────────────────────

  fun signUp(
    email: String,
    password: String,
    consentVersion: Int,
    scope: CoroutineScope,
    onResult: (AuthResult<AuthUser>) -> Unit,
  ) {
    val cleanEmail = email.trim()
    if (!isValidEmail(cleanEmail)) {
      onResult(AuthResult.Error("Please enter a valid email address."))
      return
    }
    if (!isValidPassword(password)) {
      onResult(AuthResult.Error("Password must be at least 6 characters."))
      return
    }

    if (!SupabaseConfig.isConfigured) {
      onResult(
        AuthResult.Error(
          "Supabase Auth is not configured yet. Please configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env or local.properties."
        )
      )
      return
    }

    val consentTimestamp = System.currentTimeMillis()
    _state.value = AuthState.Loading("Creating account…")
    scope.launch {
      val result = withContext(Dispatchers.IO) {
        try {
          val url = URL(SupabaseConfig.signupEndpoint)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
            setRequestProperty("Authorization", "Bearer ${SupabaseConfig.supabasePublishableKey}")
            doOutput = true
            connectTimeout = 12000
            readTimeout = 12000
          }

          val payload = JSONObject().apply {
            put("email", cleanEmail)
            put("password", password)
            put("data", JSONObject().apply {
              put("consent_version", consentVersion)
              put("consent_timestamp", consentTimestamp)
            })
          }

          OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
          val code = conn.responseCode
          val responseText = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.use { it.readText() } ?: ""

          if (code in 200..299) {
            val json = JSONObject(responseText)
            val accessToken = json.optString("access_token")
            val refreshToken = json.optString("refresh_token")
            val userObj = json.optJSONObject("user") ?: json
            val id = userObj.optString("id")

            if (accessToken.isNotEmpty()) {
              saveSession(accessToken, refreshToken, id, cleanEmail, consentVersion, consentTimestamp)
              sendWelcomeEmailAsync(cleanEmail, scope)
              AuthResult.Success(AuthUser(id = id, email = cleanEmail, consentVersion = consentVersion, consentTimestamp = consentTimestamp))
            } else {
              // Supabase requires email verification before providing session tokens
              AuthResult.Success(
                AuthUser(
                  id = id,
                  email = cleanEmail,
                  displayName = "Pending Email Confirmation",
                  consentVersion = consentVersion,
                  consentTimestamp = consentTimestamp,
                )
              )
            }
          } else {
            val errJson = runCatching { JSONObject(responseText) }.getOrNull()
            val msg = errJson?.optString("error_description")
              ?: errJson?.optString("msg")
              ?: errJson?.optString("message")
              ?: "Account creation failed (HTTP $code)."
            AuthResult.Error(msg)
          }
        } catch (e: Exception) {
          AuthResult.Error("Connection error: ${e.localizedMessage ?: "Unknown error"}", e)
        }
      }

      when (result) {
        is AuthResult.Success -> {
          if (result.data.displayName != "Pending Email Confirmation") {
            _state.value = AuthState.Authenticated(result.data)
          } else {
            _state.value = AuthState.Unauthenticated
          }
        }
        is AuthResult.Error -> _state.value = AuthState.Error(result.message)
      }
      onResult(result)
    }
  }

  // ── 3. Google Sign-In via Supabase OAuth ──────────────────────────────────

  /**
   * Performs Google Sign-In using Supabase OAuth.
   * If GOOGLE_CLIENT_ID is configured, initiates native Google Play Services sign-in
   * and exchanges the ID token with Supabase (grant_type=id_token).
   * Otherwise opens the Supabase Google OAuth authorize URL in the browser / Custom Tab.
   */
  fun signInWithGoogle(
    activity: Activity? = null,
    scope: CoroutineScope? = null,
    onResult: (AuthResult<AuthUser>) -> Unit,
  ) {
    if (!SupabaseConfig.isConfigured) {
      onResult(
        AuthResult.Error(
          "Supabase is not configured yet. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env or local.properties."
        )
      )
      return
    }

    // Path A: Native Google Identity Sign-In with ID Token exchange
    if (SupabaseConfig.isGoogleConfigured && activity != null && scope != null) {
      scope.launch {
        try {
          val signInClient = Identity.getSignInClient(activity)
          val request = GetSignInIntentRequest.builder()
            .setServerClientId(SupabaseConfig.googleClientId)
            .build()
          val pendingIntent = signInClient.getSignInIntent(request).await()
          val result = awaitResult(
            ActivityResultContracts.StartIntentSenderForResult(),
            IntentSenderRequest.Builder(pendingIntent).build()
          )
          if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val credential = signInClient.getSignInCredentialFromIntent(result.data)
            val idToken = credential.googleIdToken
            val email = credential.id
            if (!idToken.isNullOrBlank()) {
              exchangeGoogleIdToken(idToken, email ?: "", scope, onResult)
              return@launch
            }
          }
          launchBrowserOAuth(activity)
        } catch (e: Exception) {
          launchBrowserOAuth(activity)
          onResult(AuthResult.Error("Redirecting to browser for Google Sign-In…"))
        }
      }
      return
    }

    // Path B: Supabase Browser OAuth flow with custom scheme callback
    if (activity != null) {
      launchBrowserOAuth(activity)
      onResult(AuthResult.Error("Redirecting to browser for Google Sign-In…"))
    } else {
      onResult(
        AuthResult.Error(
          "Google Sign-In configuration required. Set GOOGLE_CLIENT_ID in your configuration and enable Google in the Supabase Dashboard."
        )
      )
    }
  }

  private fun launchBrowserOAuth(activity: Activity) {
    try {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(SupabaseConfig.googleOAuthAuthorizeUrl)).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
    } catch (_: Exception) {}
  }

  /**
   * Exchanges a Google ID token with Supabase GoTrue endpoint (/auth/v1/token?grant_type=id_token).
   */
  fun exchangeGoogleIdToken(
    idToken: String,
    fallbackEmail: String,
    scope: CoroutineScope,
    onResult: (AuthResult<AuthUser>) -> Unit,
  ) {
    _state.value = AuthState.Loading("Authenticating with Google…")
    scope.launch {
      val result = withContext(Dispatchers.IO) {
        try {
          val url = URL(SupabaseConfig.tokenIdTokenEndpoint)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
            setRequestProperty("Authorization", "Bearer ${SupabaseConfig.supabasePublishableKey}")
            doOutput = true
            connectTimeout = 12000
            readTimeout = 12000
          }

          val payload = JSONObject().apply {
            put("provider", "google")
            put("id_token", idToken)
          }

          OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
          val code = conn.responseCode
          val responseText = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.use { it.readText() } ?: ""

          if (code in 200..299) {
            val json = JSONObject(responseText)
            val accessToken = json.optString("access_token")
            val refreshToken = json.optString("refresh_token")
            val userObj = json.optJSONObject("user")
            val id = userObj?.optString("id") ?: ""
            val email = userObj?.optString("email") ?: fallbackEmail

            saveSession(accessToken, refreshToken, id, email, 2, System.currentTimeMillis())
            val user = AuthUser(id = id, email = email)
            AuthResult.Success(user)
          } else {
            val errJson = runCatching { JSONObject(responseText) }.getOrNull()
            val msg = errJson?.optString("error_description")
              ?: errJson?.optString("msg")
              ?: errJson?.optString("message")
              ?: "Google authentication failed (HTTP $code)."
            AuthResult.Error(msg)
          }
        } catch (e: Exception) {
          AuthResult.Error("Google auth error: ${e.localizedMessage ?: "Unknown error"}", e)
        }
      }

      when (result) {
        is AuthResult.Success -> _state.value = AuthState.Authenticated(result.data)
        is AuthResult.Error -> _state.value = AuthState.Error(result.message)
      }
      onResult(result)
    }
  }

  // ── 4. Forgot Password ────────────────────────────────────────────────────

  fun resetPassword(
    email: String,
    scope: CoroutineScope,
    onResult: (AuthResult<Unit>) -> Unit,
  ) {
    val cleanEmail = email.trim()
    if (!isValidEmail(cleanEmail)) {
      onResult(AuthResult.Error("Please enter a valid email address."))
      return
    }

    if (!SupabaseConfig.isConfigured) {
      onResult(
        AuthResult.Error(
          "Supabase Auth is not configured yet. Configure project credentials to enable password reset."
        )
      )
      return
    }

    scope.launch {
      val result = withContext(Dispatchers.IO) {
        try {
          val url = URL(SupabaseConfig.recoverEndpoint)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
            setRequestProperty("Authorization", "Bearer ${SupabaseConfig.supabasePublishableKey}")
            doOutput = true
            connectTimeout = 10000
            readTimeout = 10000
          }

          val payload = JSONObject().apply {
            put("email", cleanEmail)
            put("redirect_to", SupabaseConfig.REDIRECT_URL)
          }

          OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
          val code = conn.responseCode
          if (code in 200..299) {
            AuthResult.Success(Unit)
          } else {
            val err = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
            val msg = runCatching { JSONObject(err).optString("msg") }.getOrNull() ?: "Password reset request failed."
            AuthResult.Error(msg)
          }
        } catch (e: Exception) {
          AuthResult.Error("Failed to request reset: ${e.localizedMessage}", e)
        }
      }
      onResult(result)
    }
  }

  // ── 5. Password Update (After Recovery / Reset) ───────────────────────────

  fun updatePassword(
    newPassword: String,
    scope: CoroutineScope,
    onResult: (AuthResult<Unit>) -> Unit,
  ) {
    if (newPassword.length < 6) {
      onResult(AuthResult.Error("Password must be at least 6 characters."))
      return
    }

    val token = _recoveryToken.value ?: currentAccessToken
    if (token.isNullOrBlank()) {
      onResult(AuthResult.Error("No active recovery or authentication session found."))
      return
    }

    scope.launch {
      val result = withContext(Dispatchers.IO) {
        try {
          val url = URL(SupabaseConfig.userEndpoint)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "PUT"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
            setRequestProperty("Authorization", "Bearer $token")
            doOutput = true
            connectTimeout = 10000
            readTimeout = 10000
          }

          val payload = JSONObject().apply {
            put("password", newPassword)
          }

          OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
          val code = conn.responseCode
          if (code in 200..299) {
            _recoveryToken.value = null
            AuthResult.Success(Unit)
          } else {
            val err = conn.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
            val msg = runCatching { JSONObject(err).optString("msg") }.getOrNull()
              ?: runCatching { JSONObject(err).optString("message") }.getOrNull()
              ?: "Failed to update password."
            AuthResult.Error(msg)
          }
        } catch (e: Exception) {
          AuthResult.Error("Error updating password: ${e.localizedMessage}", e)
        }
      }
      onResult(result)
    }
  }

  // ── 6. Session Persistence & Token Refresh ────────────────────────────────

  fun refreshToken(
    scope: CoroutineScope,
    onResult: ((AuthResult<Unit>) -> Unit)? = null,
  ) {
    val refresh = currentRefreshToken
    if (refresh.isNullOrBlank() || !SupabaseConfig.isConfigured) {
      onResult?.invoke(AuthResult.Error("No refresh token available."))
      return
    }

    scope.launch {
      val result = withContext(Dispatchers.IO) {
        try {
          val url = URL(SupabaseConfig.tokenRefreshEndpoint)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
            setRequestProperty("Authorization", "Bearer ${SupabaseConfig.supabasePublishableKey}")
            doOutput = true
            connectTimeout = 10000
            readTimeout = 10000
          }

          val payload = JSONObject().apply {
            put("refresh_token", refresh)
          }

          OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
          val code = conn.responseCode
          val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
            ?.bufferedReader()?.use { it.readText() } ?: ""

          if (code in 200..299) {
            val json = JSONObject(text)
            val newAccess = json.optString("access_token")
            val newRefresh = json.optString("refresh_token")
            val userObj = json.optJSONObject("user")
            val id = userObj?.optString("id") ?: prefs.getString(KEY_USER_ID, "") ?: ""
            val email = userObj?.optString("email") ?: prefs.getString(KEY_USER_EMAIL, "") ?: ""

            saveSession(newAccess, newRefresh, id, email, 2, System.currentTimeMillis())
            AuthResult.Success(Unit)
          } else {
            AuthResult.Error("Session refresh failed.")
          }
        } catch (e: Exception) {
          AuthResult.Error("Session refresh error: ${e.localizedMessage}", e)
        }
      }
      onResult?.invoke(result)
    }
  }

  // ── 7. Sign Out ───────────────────────────────────────────────────────────

  fun signOut(
    scope: CoroutineScope? = null,
    onResult: (() -> Unit)? = null,
  ) {
    val token = currentAccessToken
    prefs.edit().clear().apply()
    _state.value = AuthState.Unauthenticated
    _recoveryToken.value = null

    if (!token.isNullOrBlank() && SupabaseConfig.isConfigured && scope != null) {
      scope.launch(Dispatchers.IO) {
        try {
          val url = URL(SupabaseConfig.logoutEndpoint)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
            setRequestProperty("Authorization", "Bearer $token")
            connectTimeout = 6000
            readTimeout = 6000
          }
          conn.responseCode
        } catch (_: Exception) {}
      }
    }
    onResult?.invoke()
  }

  // ── 8. Deep Link Handler (OAuth & Password Recovery) ──────────────────────

  /**
   * Processes incoming auth callback deep links (e.g., com.pandu78.pdf24x7://auth-callback#access_token=...&type=recovery).
   */
  fun handleAuthDeepLink(
    uri: Uri,
    scope: CoroutineScope,
    onResult: ((AuthResult<AuthUser>) -> Unit)? = null,
  ) {
    if (uri.scheme != "com.pandu78.pdf24x7" || uri.host != "auth-callback") return

    val params = mutableMapOf<String, String>()

    // Parse URL fragment (Supabase OAuth & magic links use #access_token=...)
    uri.fragment?.split("&")?.forEach { pair ->
      val parts = pair.split("=", limit = 2)
      if (parts.size == 2) {
        params[parts[0]] = runCatching { URLDecoder.decode(parts[1], "UTF-8") }.getOrDefault(parts[1])
      }
    }

    // Also check standard query parameters
    uri.queryParameterNames?.forEach { key ->
      uri.getQueryParameter(key)?.let { params[key] = it }
    }

    val errorDesc = params["error_description"] ?: params["error"]
    if (!errorDesc.isNullOrBlank()) {
      val err = AuthResult.Error(errorDesc)
      _state.value = AuthState.Error(errorDesc)
      onResult?.invoke(err)
      return
    }

    val accessToken = params["access_token"]
    val refreshToken = params["refresh_token"]
    val type = params["type"]

    if (!accessToken.isNullOrBlank()) {
      if (type == "recovery") {
        _recoveryToken.value = accessToken
        onResult?.invoke(AuthResult.Success(AuthUser(id = "recovery", email = "", displayName = "Recovery")))
        return
      }

      // Fetch user profile from Supabase with the token
      scope.launch {
        val result = withContext(Dispatchers.IO) {
          try {
            val url = URL(SupabaseConfig.userEndpoint)
            val conn = (url.openConnection() as HttpURLConnection).apply {
              requestMethod = "GET"
              setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
              setRequestProperty("Authorization", "Bearer $accessToken")
              connectTimeout = 10000
              readTimeout = 10000
            }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
              ?.bufferedReader()?.use { it.readText() } ?: ""

            if (code in 200..299) {
              val json = JSONObject(text)
              val id = json.optString("id")
              val email = json.optString("email")
              saveSession(accessToken, refreshToken ?: "", id, email, 2, System.currentTimeMillis())
              AuthResult.Success(AuthUser(id = id, email = email))
            } else {
              AuthResult.Error("Failed to retrieve user profile.")
            }
          } catch (e: Exception) {
            AuthResult.Error("Deep link profile error: ${e.localizedMessage}", e)
          }
        }

        when (result) {
          is AuthResult.Success -> _state.value = AuthState.Authenticated(result.data)
          is AuthResult.Error -> _state.value = AuthState.Error(result.message)
        }
        onResult?.invoke(result)
      }
    }
  }

  private fun saveSession(
    token: String,
    refresh: String,
    userId: String,
    email: String,
    consentVersion: Int,
    consentTime: Long,
  ) {
    prefs.edit()
      .putString(KEY_TOKEN, token)
      .putString(KEY_REFRESH, refresh)
      .putString(KEY_USER_ID, userId)
      .putString(KEY_USER_EMAIL, email)
      .putInt(KEY_CONSENT_VERSION, consentVersion)
      .putLong(KEY_CONSENT_TIME, consentTime)
      .apply()
  }

  private fun sendWelcomeEmailAsync(email: String, scope: CoroutineScope) {
    if (!SupabaseConfig.isConfigured || email.isBlank()) return
    scope.launch(Dispatchers.IO) {
      try {
        val url = URL("${SupabaseConfig.supabaseUrl.trimEnd('/')}/functions/v1/send-welcome-email")
        val conn = (url.openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          setRequestProperty("Content-Type", "application/json")
          setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
          val token = currentAccessToken ?: SupabaseConfig.supabasePublishableKey
          setRequestProperty("Authorization", "Bearer $token")
          doOutput = true
          connectTimeout = 6000
          readTimeout = 6000
        }
        val payload = JSONObject().apply { put("email", email) }
        OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
        conn.responseCode
      } catch (_: Exception) {}
    }
  }
}
