package com.pandu78.PDF24x7

import android.app.Activity
import androidx.compose.ui.platform.LocalContext
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.delay
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pandu78.PDF24x7.auth.AuthManager
import com.pandu78.PDF24x7.auth.AuthResult
import com.pandu78.PDF24x7.auth.ForgotPasswordDialog

private const val CONTACT = "bhingesamarth@gmail.com"

val PRIVACY_TEXT = """1. What we collect
PDF24x7 processes your PDF documents entirely on your device. We do not inspect, collect, or store your documents, photos, or scan contents on external servers. If you choose to create an account for cloud synchronization, your account email and authentication records are securely managed through our authentication provider. Advertising and third-party tracking remain disabled until an ad provider is explicitly configured.

2. Where your files live
Every tool runs entirely on this device. Saved PDFs are kept in the app's own private storage, which other apps cannot read. They are never sent to external servers unless you explicitly configure cloud backup.

3. Google Drive backup & cloud sync
Off unless you turn it on. When enabled, the app copies your saved PDFs to your own Google Drive using the restricted drive.file scope. Those files travel from this phone to Google directly. You can disconnect at any time in Settings, which revokes the app's access to your account.

4. Permissions
Camera is used only while you are scanning a document. Photos and files access is used only when you pick an image to turn into a PDF or to place a signature. Neither is used in the background, and the app asks the first time it needs each one.

5. Reading text from scans
Making a scanned PDF searchable uses a text recognition model built into the app. The page images and the text read from them never leave the device, and it needs no connection.

6. Children
The app is not directed at children under 13, and collects no data from anyone of any age.

7. Changes
If this policy changes in a way that matters, the app will show it to you again before you carry on.

8. Contact
Questions about this policy: $CONTACT (Draft version — Pending final legal review)"""

val TERMS_TEXT = """1. The app
PDF24x7 provides on-device PDF utilities and document scanning. Free on-device tools are provided as is. Optional account features, cloud synchronization, and advertising-supported services may be introduced in upcoming updates subject to these terms.

2. Your files are your responsibility
The app changes documents you choose, and some changes cannot be undone: redaction removes content for good, a password locks a file, cropping discards part of a page. Keep your own copy of anything you cannot afford to lose. We have no copy and cannot recover one for you.

3. Acceptable use
Do not use the app to alter documents in order to deceive anyone, to forge a signature, or for anything unlawful where you live. Placing a signature image on a document is not a statement about that document's legal standing — whether a signed PDF binds anyone depends on your local law and on the parties involved.

4. No warranty
The app comes with no warranty of any kind. Page detection, text recognition and compression are approximate by their nature, and any tool may contain errors. Check the result before you rely on it.

5. Limitation of liability
So far as the law allows, we are not liable for lost data, lost profits, or any indirect or consequential loss arising from your use of the app.

6. Third-party services
Google Drive backup and upcoming third-party integrations are governed by their respective terms of service.

7. Changes
If these terms change, the app will ask you to accept them again. Continuing to use it means you accept the version shown. (Draft version — Pending final legal review)"""

val LEGAL_DOCS = mapOf(
  "privacy" to ("Privacy Policy" to PRIVACY_TEXT),
  "terms" to ("Terms & Conditions" to TERMS_TEXT),
)

/**
 * Gate screen: displays the Welcome/Authentication flow on initial launch,
 * or opens the terms/privacy reader modal when viewed from Settings (onClose != null).
 */
@Composable
fun Consent(onAccept: (() -> Unit)? = null, onClose: (() -> Unit)? = null) {
  if (onClose != null) {
    LegalDocViewerModal(onClose = onClose)
  } else {
    WelcomeAuthScreen(onAccept = onAccept)
  }
}

@Composable
fun DocViewerSheet(docKey: String, onDismiss: () -> Unit) {
  val (title, body) = LEGAL_DOCS[docKey] ?: LEGAL_DOCS.getValue("privacy")
  BackHandler(onBack = onDismiss)
  Column(
    Modifier
      .fillMaxSize()
      .background(c.bg)
      .statusBarsPadding()
      .navigationBarsPadding(),
  ) {
    Row(
      Modifier
        .fillMaxWidth()
        .height(56.dp)
        .padding(start = 20.dp, end = 12.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      T(title, Type.title.copy(fontSize = Type.title.fontSize * 0.75f), modifier = Modifier.weight(1f))
      IconBtn(I.close, 24.dp, label = "Close", onClick = onDismiss)
    }
    T(
      body,
      Type.small.copy(fontSize = Type.small.fontSize * 1.07f, lineHeight = Type.small.lineHeight * 1.15f),
      c.sub,
      Modifier
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 20.dp)
        .padding(bottom = 40.dp),
    )
  }
}

@Composable
fun LegalDocViewerModal(onClose: () -> Unit) {
  var selectedDoc by remember { mutableStateOf("privacy") }
  BackHandler(onBack = onClose)
  Column(
    Modifier
      .fillMaxSize()
      .background(c.bg)
      .statusBarsPadding()
      .navigationBarsPadding(),
  ) {
    Row(
      Modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp, vertical = 8.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.SpaceBetween,
    ) {
      Row(
        Modifier
          .background(c.sunken, RoundedCornerShape(10.dp))
          .padding(3.dp),
      ) {
        Box(
          Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (selectedDoc == "privacy") c.surface else Color.Transparent)
            .tap { selectedDoc = "privacy" }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
          T("Privacy Policy", Type.med.copy(fontSize = Type.small.fontSize), if (selectedDoc == "privacy") c.ink else c.sub)
        }
        Box(
          Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (selectedDoc == "terms") c.surface else Color.Transparent)
            .tap { selectedDoc = "terms" }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        ) {
          T("Terms & Conditions", Type.med.copy(fontSize = Type.small.fontSize), if (selectedDoc == "terms") c.ink else c.sub)
        }
      }
      IconBtn(I.close, 24.dp, label = "Close", onClick = onClose)
    }
    val (_, body) = LEGAL_DOCS.getValue(selectedDoc)
    T(
      body,
      Type.small.copy(fontSize = Type.small.fontSize * 1.05f, lineHeight = Type.small.lineHeight * 1.15f),
      c.sub,
      Modifier
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 20.dp)
        .padding(bottom = 32.dp),
    )
  }
}

@Composable
fun WelcomeAuthScreen(onAccept: (() -> Unit)?) {
  val scope = rememberCoroutineScope()
  val context = LocalContext.current
  val activity = context as? Activity

  var isSignUp by rememberSaveable { mutableStateOf(false) }
  var email by rememberSaveable { mutableStateOf("") }
  var password by rememberSaveable { mutableStateOf("") }
  var confirmPassword by rememberSaveable { mutableStateOf("") }
  var passwordVisible by rememberSaveable { mutableStateOf(false) }
  var privacyAccepted by rememberSaveable { mutableStateOf(false) }
  var termsAccepted by rememberSaveable { mutableStateOf(false) }

  var busy by remember { mutableStateOf(false) }
  var googleBusy by remember { mutableStateOf(false) }
  var errorMessage by remember { mutableStateOf<String?>(null) }
  var successMessage by remember { mutableStateOf<String?>(null) }
  var showForgotPassword by remember { mutableStateOf(false) }
  var doc by remember { mutableStateOf<String?>(null) }

  val scrollState = rememberScrollState()

  Box(Modifier.fillMaxSize().background(c.bg)) {
    Column(
      Modifier
        .fillMaxSize()
        .statusBarsPadding()
        .navigationBarsPadding()
        .verticalScroll(scrollState)
        .padding(horizontal = 24.dp, vertical = 20.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center,
    ) {
      Spacer(Modifier.height(8.dp))

      // 1. Official PDF24x7 App Logo (Properly Centered, Sized, and Spaced)
      Box(
        Modifier
          .size(76.dp)
          .shadow(6.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.12f), spotColor = Color.Black.copy(alpha = 0.18f))
          .clip(CircleShape)
          .background(Color.White),
        contentAlignment = Alignment.Center,
      ) {
        Image(
          painter = painterResource(R.drawable.app_logo),
          contentDescription = "PDF24x7 Logo",
          modifier = Modifier.size(76.dp),
        )
      }

      Spacer(Modifier.height(16.dp))

      // 2. Welcoming Heading and Subtitle
      T(
        text = if (isSignUp) "Create Account" else "Welcome to PDF24x7",
        style = Type.largeTitle,
        align = TextAlign.Center,
      )
      Spacer(Modifier.height(4.dp))
      T(
        text = if (isSignUp) "Sign up to get started with PDF24x7" else "Sign in to continue",
        style = Type.body,
        color = c.sub,
        align = TextAlign.Center,
      )

      Spacer(Modifier.height(20.dp))

      // 3. Google Sign-In Button
      Btn(
        label = "Continue with Google",
        modifier = Modifier.fillMaxWidth(),
        icon = I.google,
        kind = BtnKind.Secondary,
        busy = googleBusy,
        enabled = !busy && !googleBusy,
        onClick = {
          if (!privacyAccepted || !termsAccepted) {
            errorMessage = "Please accept the Privacy Policy and Terms & Conditions to continue."
            return@Btn
          }
          googleBusy = true
          errorMessage = null
          successMessage = null
          AuthManager.signInWithGoogle(activity, scope) { result ->
            googleBusy = false
            when (result) {
              is AuthResult.Success -> {
                Terms.accept()
                onAccept?.invoke()
              }
              is AuthResult.Error -> {
                errorMessage = result.message
              }
            }
          }
        },
      )

      // 4. Clean Divider
      Spacer(Modifier.height(16.dp))
      Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Box(Modifier.weight(1f).height(0.6.dp).background(c.line))
        T("or", Type.small, c.faint, Modifier.padding(horizontal = 10.dp))
        Box(Modifier.weight(1f).height(0.6.dp).background(c.line))
      }
      Spacer(Modifier.height(16.dp))

      // 5. Email Field
      Field(
        value = email,
        onChange = { email = it; errorMessage = null },
        placeholder = "Email address",
        keyboard = KeyboardType.Email,
      )

      Spacer(Modifier.height(10.dp))

      // 6. Password Field
      Field(
        value = password,
        onChange = { password = it; errorMessage = null },
        placeholder = if (isSignUp) "Password (min 6 characters)" else "Password",
        keyboard = KeyboardType.Password,
        secret = !passwordVisible,
        trailing = {
          IconBtn(
            glyph = if (passwordVisible) I.eyeOffOutline else I.eyeOutline,
            color = c.sub,
            label = if (passwordVisible) "Hide password" else "Show password",
          ) {
            passwordVisible = !passwordVisible
          }
        },
      )

      // 7. Confirm Password Field (Sign Up mode only)
      if (isSignUp) {
        Spacer(Modifier.height(10.dp))
        Field(
          value = confirmPassword,
          onChange = { confirmPassword = it; errorMessage = null },
          placeholder = "Confirm password",
          keyboard = KeyboardType.Password,
          secret = !passwordVisible,
          )
      }

      // 8. Forgot Password Link (Sign In mode only)
      if (!isSignUp) {
        Spacer(Modifier.height(8.dp))
        Row(
          Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.End,
        ) {
          T(
            "Forgot password?",
            Type.small,
            c.primary,
            Modifier.tap { showForgotPassword = true },
          )
        }
      }

      // Status / Error Messages
      if (errorMessage != null) {
        Spacer(Modifier.height(10.dp))
        T(
          text = errorMessage!!,
          style = Type.small,
          color = c.error,
          align = TextAlign.Center,
          modifier = Modifier.fillMaxWidth(),
        )
      }
      if (successMessage != null) {
        Spacer(Modifier.height(10.dp))
        T(
          text = successMessage!!,
          style = Type.small,
          color = c.primary,
          align = TextAlign.Center,
          modifier = Modifier.fillMaxWidth(),
        )
      }

      Spacer(Modifier.height(14.dp))

      // 9. Preserved Checkboxes: Required for Authentication
      Tick(
        on = privacyAccepted,
        before = "I have read the",
        link = "Privacy Policy",
        toggle = { privacyAccepted = !privacyAccepted; errorMessage = null },
        open = { doc = "privacy" },
      )
      Tick(
        on = termsAccepted,
        before = "I agree to the",
        link = "Terms & Conditions",
        toggle = { termsAccepted = !termsAccepted; errorMessage = null },
        open = { doc = "terms" },
      )

      Spacer(Modifier.height(16.dp))

      // 10. Authentication Action Button (Sign In or Sign Up)
      val canSubmit = if (isSignUp) {
        email.isNotBlank() && password.length >= 6 && password == confirmPassword && privacyAccepted && termsAccepted && !busy
      } else {
        email.isNotBlank() && password.isNotBlank() && privacyAccepted && termsAccepted && !busy
      }

      Btn(
        label = if (isSignUp) "Sign Up" else "Sign In",
        modifier = Modifier.fillMaxWidth(),
        busy = busy,
        enabled = canSubmit,
        onClick = {
          if (!privacyAccepted || !termsAccepted) {
            errorMessage = "Please accept the Privacy Policy and Terms & Conditions to continue."
            return@Btn
          }
          if (!AuthManager.isValidEmail(email)) {
            errorMessage = "Please enter a valid email address."
            return@Btn
          }
          if (password.length < 6) {
            errorMessage = "Password must be at least 6 characters."
            return@Btn
          }
          if (isSignUp && password != confirmPassword) {
            errorMessage = "Passwords do not match."
            return@Btn
          }

          busy = true
          errorMessage = null
          successMessage = null

          if (isSignUp) {
            AuthManager.signUp(email, password, 2, scope) { result ->
              busy = false
              when (result) {
                is AuthResult.Success -> {
                  Terms.accept()
                  if (result.data.displayName == "Pending Email Confirmation") {
                    successMessage = "Confirmation email sent! Please check your inbox."
                  } else {
                    onAccept?.invoke()
                  }
                }
                is AuthResult.Error -> {
                  errorMessage = result.message
                }
              }
            }
          } else {
            AuthManager.signIn(email, password, scope) { result ->
              busy = false
              when (result) {
                is AuthResult.Success -> {
                  Terms.accept()
                  onAccept?.invoke()
                }
                is AuthResult.Error -> {
                  errorMessage = result.message
                }
              }
            }
          }
        },
      )

      // 11. Toggle between Sign In and Sign Up
      Spacer(Modifier.height(14.dp))
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
      ) {
        if (isSignUp) {
          T("Already have an account? ", Type.small, c.sub)
          T(
            "Sign In",
            Type.small.copy(fontWeight = Type.bold.fontWeight),
            c.primary,
            Modifier.tap { isSignUp = false; errorMessage = null },
          )
        } else {
          T("Don't have an account? ", Type.small, c.sub)
          T(
            "Sign Up",
            Type.small.copy(fontWeight = Type.bold.fontWeight),
            c.primary,
            Modifier.tap { isSignUp = true; errorMessage = null },
          )
        }
      }

      Spacer(Modifier.height(14.dp))
      T("Last updated ${Terms.UPDATED}", Type.small, c.faint, align = TextAlign.Center)
      Spacer(Modifier.height(10.dp))
    }

    // Modal dialogs: Forgot Password and Terms/Privacy full sheet
    if (showForgotPassword) {
      ForgotPasswordDialog(
        initialEmail = email,
        onDismiss = { showForgotPassword = false },
      )
    }

    AnimatedVisibility(
      doc != null,
      enter = slideInVertically(tween(380)) { it },
      exit = slideOutVertically(tween(300)) { it },
    ) {
      DocViewerSheet(doc ?: "privacy") { doc = null }
    }
  }
}

@Composable
fun LegalConsentCheckbox(
  checked: Boolean,
  onCheckedChange: (Boolean) -> Unit,
  onOpenDoc: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  Row(
    modifier = modifier
      .fillMaxWidth()
      .tap(scaleTo = 0.98f) { onCheckedChange(!checked) }
      .padding(vertical = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    val box = RoundedCornerShape(6.dp)
    Box(
      Modifier
        .size(20.dp)
        .background(if (checked) c.primary else Color.Transparent, box)
        .border(1.5.dp, if (checked) c.primary else c.lineStrong, box),
      contentAlignment = Alignment.Center,
    ) {
      if (checked) Icon(I.check, 13.dp, Color.White)
    }
    Spacer(Modifier.size(10.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
      T("I agree to the ", Type.small, c.sub)
      T("Terms", Type.small.copy(fontWeight = Type.bold.fontWeight), c.primary, Modifier.tap { onOpenDoc("terms") })
      T(" & ", Type.small, c.sub)
      T("Privacy Policy", Type.small.copy(fontWeight = Type.bold.fontWeight), c.primary, Modifier.tap { onOpenDoc("privacy") })
    }
  }
}

@Composable
private fun Tick(on: Boolean, before: String, link: String, toggle: () -> Unit, open: () -> Unit) {
  Row(
    Modifier
      .fillMaxWidth()
      .tap(scaleTo = 0.98f, onClick = toggle)
      .padding(vertical = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    val box = RoundedCornerShape(7.dp)
    Box(
      Modifier
        .size(22.dp)
        .background(if (on) c.primary else Color.Transparent, box)
        .border(2.dp, if (on) c.primary else c.lineStrong, box),
      contentAlignment = Alignment.Center,
    ) {
      if (on) Icon(I.check, 15.dp, Color.White)
    }
    Spacer(Modifier.size(12.dp))
    T("$before ", Type.small.copy(fontSize = Type.small.fontSize * 1.07f), c.sub)
    T(
      link,
      Type.small.copy(fontSize = Type.small.fontSize * 1.07f, fontWeight = Type.item.fontWeight),
      c.primary,
      Modifier.tap(scaleTo = 0.94f, onClick = open),
    )
  }
}


/**
 * Fades and lifts its content in, a beat after the one before it. Plays once per screen: coming back to a screen (from a
 * tool, or another tab) shows it as it was, instead of blank while every section fades in again.
 */
@Composable
fun Stagger(index: Int, content: @Composable () -> Unit) {
  var played by rememberSaveable { mutableStateOf(false) }
  val t = remember { Animatable(if (played) 1f else 0f) }
  LaunchedEffect(Unit) {
    if (played) return@LaunchedEffect
    played = true
    delay(60L * index.coerceAtMost(8))
    t.animateTo(1f, tween(380))
  }
  Box(Modifier.graphicsLayer { alpha = t.value; translationY = (1 - t.value) * 24f }) { content() }
}
