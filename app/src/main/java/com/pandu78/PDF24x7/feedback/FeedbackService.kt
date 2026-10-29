package com.pandu78.PDF24x7.feedback

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.pandu78.PDF24x7.appContext
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
   * Set this to your deployed Vercel URL, e.g. "https://your-domain.vercel.app/api/feedback".
   */
  var endpointUrl: String = "https://pdf24x7.vercel.app/api/feedback"

  /**
   * Direct support contact used for fallback when the API is unconfigured or offline.
   */
  const val SUPPORT_EMAIL = "bhingesamarth@gmail.com"

  val isConfigured: Boolean
    get() = endpointUrl.isNotBlank() &&
      !endpointUrl.contains("your-domain") &&
      endpointUrl.startsWith("http")

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
          "Online feedback service is not configured yet. You can send your feedback directly to support via email."
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
            doOutput = true
            connectTimeout = 8000
            readTimeout = 8000
          }

          val payload = JSONObject().apply {
            put("category", category)
            put("message", cleanMsg)
            if (!email.isNullOrBlank()) put("email", email.trim())
            put("appVersion", appVersion)
          }

          OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
          val code = conn.responseCode
          val stream = if (code in 200..299) conn.inputStream else conn.errorStream
          val response = stream?.bufferedReader()?.use { it.readText() } ?: ""

          if (code in 200..299) {
            val json = JSONObject(response)
            FeedbackResult.Success(json.optString("message", "Feedback received successfully. Thank you!"))
          } else if (code == 503) {
            FeedbackResult.Unconfigured(
              "Resend email API is not configured on the server yet. You can send feedback directly via email."
            )
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
    } catch (_: Exception) {
      // Fallback if no email client installed
    }
  }
}

