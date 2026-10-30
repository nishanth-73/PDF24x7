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

private const val CONTACT = "medurinishanth78@gmail.com"

val PRIVACY_TEXT = """1. Information We Collect
PDF24x7 is an offline-first application designed to process PDF documents directly on your device.
We do not collect, inspect, or store your PDF documents, images, scanned pages, or document contents on our external servers.
If you create an account, we collect and process the information required for authentication, such as your email address and authentication records. This information is securely managed through our authentication provider.
Advertising and third-party tracking are currently disabled unless explicitly introduced and disclosed in a future update.

2. How Your Files Are Stored
PDF processing takes place locally on your device.
Saved PDFs are stored in the app's private storage, which is not directly accessible to other apps. Your documents are not uploaded to our servers.
Your files are transferred to an external service only when you explicitly choose to use an optional feature, such as Google Drive backup.

3. Google Drive Backup
Google Drive backup is optional and disabled by default.
If you enable it, PDF24x7 will allow you to sign in to the Google account of your choice and back up your selected PDFs to your own Google Drive.
Files are transferred from your device to Google Drive. We do not store copies of those files on our servers.
You can disconnect Google Drive at any time through the app's Settings. Disconnecting revokes the app's access, subject to Google's authorization mechanisms.
Your use of Google Drive is also governed by Google's Privacy Policy and applicable terms.

4. App Permissions
PDF24x7 requests permissions only when specific features require them.
Camera: Used when you choose to scan a physical document.
Photos and Files: Used when you select images or documents for PDF creation, editing, or signature placement.
These permissions are not intended for background monitoring. The app requests access when the relevant feature is used.

5. Text Recognition (OCR)
PDF24x7 uses an on-device text recognition model to make scanned PDFs searchable.
The recognition process takes place locally. Page images and recognized text are not sent to our servers, and this feature does not require an internet connection.

6. Children's Privacy
PDF24x7 is not specifically directed at children under the age of 13.
We do not knowingly collect personal information from children through the app. If you believe personal information has been submitted improperly, please contact us through the app's Feedback feature.

7. Changes to This Privacy Policy
We may update this Privacy Policy when features, services, or legal requirements change.
If a significant change is made, we will display the updated policy in the app and may request your acknowledgment before you continue using the affected features.

8. Feedback and Contact
If you have questions, concerns, bug reports, or suggestions about PDF24x7 or this Privacy Policy, please use the Feedback feature available inside the app.
You can also contact us at:
Email: medurinishanth78@gmail.com"""

val TERMS_TEXT = """1. About PDF24x7
PDF24x7 provides PDF utilities and document-scanning features designed to help users create, convert, organize, and manage PDF documents.
Most PDF processing features operate directly on your device.
The app may also offer optional services such as account authentication, cloud synchronization, Google Drive backup, and other features in future updates.

2. Your Documents and Responsibility
You are responsible for the documents you create, import, edit, process, and store using PDF24x7.
Some operations may permanently change your documents or remove information. Examples include:
Redaction, which permanently removes selected content.
Cropping, which removes portions of a page.
Password protection, which may restrict access to a document.
Other editing operations that modify the original file.
Always keep a backup of important documents before performing operations that may be irreversible.
PDF24x7 does not maintain copies of your locally processed documents and may not be able to recover lost or damaged files.

3. Acceptable Use
You agree not to use PDF24x7 to:
Forge signatures or falsify documents.
Alter documents with the intention of deceiving others.
Violate applicable laws or regulations.
Infringe the rights of other individuals or organizations.
Engage in fraudulent or otherwise unlawful activities.
Adding a signature image to a PDF does not automatically make the document legally valid or binding. Legal recognition depends on applicable laws and the circumstances of the agreement.

4. No Warranty
PDF24x7 is provided on an "as is" and "as available" basis, to the maximum extent permitted by applicable law.
We do not guarantee that every feature will operate without errors or interruptions.
Results from features such as text recognition, page detection, compression, and document conversion may vary. You are responsible for reviewing processed documents before relying on them.

5. Limitation of Liability
To the maximum extent permitted by applicable law, PDF24x7 and its developers shall not be liable for indirect, incidental, special, consequential, or punitive damages, including loss of data, loss of profits, or business interruption arising from the use of the application.
Nothing in these Terms excludes liability that cannot legally be excluded under applicable law.

6. Third-Party Services
PDF24x7 may integrate with third-party services, including Google Drive and authentication providers.
Your use of these services is subject to their respective terms, privacy policies, and conditions.
We are not responsible for the independent services, availability, policies, or practices of third-party providers.

7. Changes to the App and These Terms
We may modify, add, or discontinue features as PDF24x7 develops.
We may also update these Terms when necessary. Significant changes may be presented inside the app, and you may be asked to accept the updated Terms before continuing to use affected features.

8. Feedback and Support
For bug reports, suggestions, complaints, or questions regarding PDF24x7, please use the Feedback feature inside the application.
You can also reach us at:
Email: medurinishanth78@gmail.com

PDF24x7
Website: https://pdf24x7.vercel.app/
GitHub: https://github.com/nishanth-73/PDF24x7
Email: medurinishanth78@gmail.com"""

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
