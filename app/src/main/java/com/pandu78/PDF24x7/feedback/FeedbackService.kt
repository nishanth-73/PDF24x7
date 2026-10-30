package com.pandu78.PDF24x7.feedback

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.pandu78.PDF24x7.auth.AuthManager
import com.pandu78.PDF24x7.auth.AuthState
import com.pandu78.PDF24x7.auth.SupabaseConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

sealed class FeedbackResult {
  data class Success(val message: String) : FeedbackResult()
  data class Error(val message: String) : FeedbackResult()
  data class Unconfigured(val message: String) : FeedbackResult()
}

object FeedbackService {
  /**
   * Supabase Edge Function endpoint for receiving feedback and triggering Resend notifications.
   */
  val endpointUrl: String
    get() = "${SupabaseConfig.supabaseUrl.trimEnd('/')}/functions/v1/submit-feedback"

  /**
   * Direct fallback support contact when the backend is offline or unconfigured.
   */
  const val SUPPORT_EMAIL = "medurinishanth78@gmail.com"

  val isConfigured: Boolean
    get() = SupabaseConfig.isConfigured

  fun sendFeedback(
    category: String,
    message: String,
    email: String?,
    appVersion: String,
    scope: CoroutineScope,
    onResult: (FeedbackResult) -> Unit,
  ) {
    val cleanMsg = message.trim()
    if (cleanMsg.length < 10) {
      onResult(FeedbackResult.Error("Please write at least 10 characters."))
      return
    }

    if (!isConfigured) {
      onResult(
        FeedbackResult.Unconfigured(
          "Online feedback service is not configured yet. Set SUPABASE_URL in your configuration or email us directly."
        )
      )
      return
    }

    scope.launch {
      val result = withContext(Dispatchers.IO) {
        try {
          val url = URL(endpointUrl)
          val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", SupabaseConfig.supabasePublishableKey)
            val token = AuthManager.currentAccessToken ?: SupabaseConfig.supabasePublishableKey
            setRequestProperty("Authorization", "Bearer $token")
            doOutput = true
            connectTimeout = 12000
            readTimeout = 12000
          }

          val userEmail = email?.trim().takeUnless { it.isNullOrBlank() }
            ?: (AuthManager.state.value as? AuthState.Authenticated)?.user?.email

          val payload = JSONObject().apply {
            put("category", category)
            put("message", cleanMsg)
            if (!userEmail.isNullOrBlank()) put("email", userEmail)
            put("appVersion", appVersion)
          }

          OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
          val code = conn.responseCode
          val stream = if (code in 200..299) conn.inputStream else conn.errorStream
          val response = stream?.bufferedReader()?.use { it.readText() } ?: ""

          if (code in 200..299) {
            val json = JSONObject(response)
            FeedbackResult.Success(json.optString("message", "Feedback received successfully. Thank you!"))
          } else {
            val json = runCatching { JSONObject(response) }.getOrNull()
            val err = json?.optString("error") ?: "Submission failed (HTTP $code)."
            FeedbackResult.Error(err)
          }
        } catch (e: Exception) {
          FeedbackResult.Error("Network error: ${e.localizedMessage ?: "Could not reach server"}")
        }
      }
      onResult(result)
    }
  }

  fun openEmailClient(
    context: Context,
    category: String,
    message: String,
    userEmail: String? = null,
  ) {
    try {
      val subject = Uri.encode("[PDF24x7 Feedback] $category")
      val body = Uri.encode(
        buildString {
          append(message.trim())
          append("\n\n---\n")
          if (!userEmail.isNullOrBlank()) append("Reply-to: $userEmail\n")
          append("Platform: Android\n")
        }
      )
      val uri = Uri.parse("mailto:$SUPPORT_EMAIL?subject=$subject&body=$body")
      val intent = Intent(Intent.ACTION_SENDTO, uri).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    } catch (_: Exception) {}
  }
}
