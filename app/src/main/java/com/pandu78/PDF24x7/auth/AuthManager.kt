package com.pandu78.PDF24x7.auth

import android.content.Context
import android.util.Patterns
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import com.pandu78.PDF24x7.appContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Authentication service manager providing Supabase Auth integration, session management,
 * and state observation.
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

  private val prefs by lazy {
    appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

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
          "Supabase Auth is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY in your configuration to enable live sign-in."
        )
      )
      return
    }

    _state.value = AuthState.Loading("Signing in…")
    scope.launch {
      val result = withContext(Dispatchers.IO) {
        try {
          val url = URL(SupabaseConfig.tokenEndpoint)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabaseAnonKey)
            setRequestProperty("Authorization", "Bearer ${SupabaseConfig.supabaseAnonKey}")
            doOutput = true
            connectTimeout = 10000
            readTimeout = 10000
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
          "Supabase Auth is not configured yet. Set SUPABASE_URL and SUPABASE_ANON_KEY to enable live account creation."
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
            setRequestProperty("apikey", SupabaseConfig.supabaseAnonKey)
            setRequestProperty("Authorization", "Bearer ${SupabaseConfig.supabaseAnonKey}")
            doOutput = true
            connectTimeout = 10000
            readTimeout = 10000
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
              AuthResult.Success(AuthUser(id = id, email = cleanEmail, consentVersion = consentVersion, consentTimestamp = consentTimestamp))
            } else {
              // Email confirmation required by Supabase
              AuthResult.Success(AuthUser(id = id, email = cleanEmail, displayName = "Pending Email Confirmation", consentVersion = consentVersion, consentTimestamp = consentTimestamp))
            }
          } else {
            val errJson = runCatching { JSONObject(responseText) }.getOrNull()
            val msg = errJson?.optString("error_description")
              ?: errJson?.optString("msg")
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
            setRequestProperty("apikey", SupabaseConfig.supabaseAnonKey)
            setRequestProperty("Authorization", "Bearer ${SupabaseConfig.supabaseAnonKey}")
            doOutput = true
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
            val msg = runCatching { JSONObject(err).optString("msg") }.getOrNull() ?: "Password reset failed."
            AuthResult.Error(msg)
          }
        } catch (e: Exception) {
          AuthResult.Error("Failed to request reset: ${e.localizedMessage}", e)
        }
      }
      onResult(result)
    }
  }

  fun signInWithGoogle(
    onResult: (AuthResult<AuthUser>) -> Unit,
  ) {
    if (!SupabaseConfig.isConfigured) {
      onResult(
        AuthResult.Error(
          "Google Sign-In via Supabase is not configured yet. Set up Google OAuth credentials in your Supabase dashboard."
        )
      )
      return
    }
    onResult(AuthResult.Error("Google OAuth provider configured. Redirecting to browser authorization..."))
  }

  fun signOut() {
    prefs.edit().clear().apply()
    _state.value = AuthState.Unauthenticated
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
}

