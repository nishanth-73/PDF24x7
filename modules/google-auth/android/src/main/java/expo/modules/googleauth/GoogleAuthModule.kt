package expo.modules.googleauth

import android.accounts.Account
import android.accounts.AccountManager
import android.app.Activity
import android.os.Build
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Google's Authorization API: asks for the Drive "files this app created" scope and returns a short-lived access token.
// Tokens are always requested for a specific account, so background uploads can't silently use a different Google account.
// Needs an Android OAuth client (package + signing SHA-1) in the Google Cloud project; no client ID lives in the app.
class GoogleAuthModule : Module() {
  private var pending: Promise? = null
  private val scopes = listOf(Scope("https://www.googleapis.com/auth/drive.file"))

  override fun definition() = ModuleDefinition {
    Name("GoogleAuth")

    // Shows the system account picker (always, even with one account) and resolves with the chosen email.
    AsyncFunction("chooseAccount") { promise: Promise ->
      val activity = appContext.currentActivity ?: return@AsyncFunction promise.reject("ERR_NOT_READY", "The app isn't ready yet.", null)
      if (pending != null) return@AsyncFunction promise.reject("ERR_BUSY", "Google sign-in is already open.", null)
      val types = arrayOf("com.google")
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        AccountManager.newChooseAccountIntent(null, null, types, null, null, null, null)
      } else {
        @Suppress("DEPRECATION")
        AccountManager.newChooseAccountIntent(null, null, types, true, null, null, null, null)
      }
      pending = promise
      activity.startActivityForResult(intent, CHOOSE_CODE)
    }

    // interactive=false never shows UI (background backups): it rejects with ERR_NEEDS_CONSENT instead.
    AsyncFunction("authorize") { email: String, interactive: Boolean, promise: Promise ->
      val context = appContext.reactContext ?: return@AsyncFunction promise.reject("ERR_NOT_READY", "The app isn't ready yet.", null)
      val request = AuthorizationRequest.builder()
        .setRequestedScopes(scopes)
        .setAccount(Account(email, "com.google"))
        .build()
      Identity.getAuthorizationClient(context).authorize(request)
        .addOnSuccessListener { result ->
          if (!result.hasResolution()) {
            promise.resolve(result.accessToken)
            return@addOnSuccessListener
          }
          val activity = appContext.currentActivity
          val intent = result.pendingIntent
          if (!interactive || activity == null || intent == null || pending != null) {
            promise.reject("ERR_NEEDS_CONSENT", "Google Drive access for $email needs to be allowed again.", null)
            return@addOnSuccessListener
          }
          pending = promise
          activity.startIntentSenderForResult(intent.intentSender, CONSENT_CODE, null, 0, 0, 0)
        }
        .addOnFailureListener { e -> promise.reject("ERR_AUTH", describe(e), e) }
    }

    // Drops a token Google's cache still hands out after the server rejected it (401), or on sign-out.
    AsyncFunction("clearToken") { token: String, promise: Promise ->
      val context = appContext.reactContext ?: return@AsyncFunction promise.resolve(null)
      Identity.getAuthorizationClient(context)
        .clearToken(ClearTokenRequest.builder().setToken(token).build())
        .addOnCompleteListener { promise.resolve(null) }
    }

    OnActivityResult { activity, (requestCode, resultCode, data) ->
      if (requestCode != CHOOSE_CODE && requestCode != CONSENT_CODE) return@OnActivityResult
      val promise = pending ?: return@OnActivityResult
      pending = null
      if (resultCode != Activity.RESULT_OK) {
        promise.reject("ERR_CANCELED", "Google sign-in was cancelled.", null)
        return@OnActivityResult
      }
      if (requestCode == CHOOSE_CODE) {
        val name = data?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
        if (name == null) promise.reject("ERR_CANCELED", "No account was chosen.", null) else promise.resolve(name)
        return@OnActivityResult
      }
      try {
        promise.resolve(Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data).accessToken)
      } catch (e: ApiException) {
        promise.reject("ERR_AUTH", describe(e), e)
      }
    }
  }

  private fun describe(e: Exception): String =
    if (e is ApiException && e.statusCode == 10) {
      "Google sign-in isn't set up for this app build. Add an Android OAuth client with this package name and signing SHA-1 in Google Cloud."
    } else {
      e.message ?: "Google sign-in failed."
    }

  private companion object {
    const val CHOOSE_CODE = 5310
    const val CONSENT_CODE = 5311
  }
}
