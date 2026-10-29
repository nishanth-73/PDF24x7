package com.pandu78.PDF24x7.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pandu78.PDF24x7.AppDialog
import com.pandu78.PDF24x7.Btn
import com.pandu78.PDF24x7.BtnKind
import com.pandu78.PDF24x7.DocViewerSheet
import com.pandu78.PDF24x7.Field
import com.pandu78.PDF24x7.I
import com.pandu78.PDF24x7.Icon
import com.pandu78.PDF24x7.IconBtn
import com.pandu78.PDF24x7.LegalConsentCheckbox
import com.pandu78.PDF24x7.Radius
import com.pandu78.PDF24x7.T
import com.pandu78.PDF24x7.Type
import com.pandu78.PDF24x7.c
import com.pandu78.PDF24x7.tap

enum class AuthMode {
  SignIn,
  SignUp,
}

@Composable
fun AccountSection(
  onOpenDoc: (String) -> Unit,
  modifier: Modifier = Modifier,
) {
  val authState by AuthManager.state
  var showAuthDialog by remember { mutableStateOf(false) }

  val shape = RoundedCornerShape(Radius.card)
  Box(
    modifier = modifier
      .fillMaxWidth()
      .clip(shape)
      .background(c.surface)
      .border(0.6.dp, c.line, shape)
      .padding(18.dp),
  ) {
    when (val state = authState) {
      is AuthState.Authenticated -> {
        Column {
          Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
          ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Box(
                Modifier
                  .size(46.dp)
                  .background(c.primary.copy(alpha = 0.12f), CircleShape),
                contentAlignment = Alignment.Center,
              ) {
                Icon(I.account, 24.dp, c.primary)
              }
              Spacer(Modifier.size(14.dp))
              Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                  T(state.user.email, Type.bold)
                  Spacer(Modifier.size(6.dp))
                  Icon(I.checkCircle, 16.dp, c.primary)
                }
                T("PDF24x7 Cloud Sync Ready", Type.small, c.sub)
              }
            }
          }
          Spacer(Modifier.height(14.dp))
          Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
          ) {
            Btn(
              "Sign Out",
              icon = I.close,
              kind = BtnKind.Secondary,
              onClick = { AuthManager.signOut() },
            )
          }
        }
      }
      else -> {
        Column {
          Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Box(
              Modifier
                .size(44.dp)
                .background(c.sunken, CircleShape),
              contentAlignment = Alignment.Center,
            ) {
              Icon(I.accountOutline, 24.dp, c.sub)
            }
            Spacer(Modifier.size(14.dp))
            Column(Modifier.weight(1f)) {
              T("PDF24x7 Account", Type.bold)
              T("Sign in for upcoming multi-device cloud sync", Type.small, c.sub)
            }
          }
          Spacer(Modifier.height(14.dp))
          Btn(
            "Sign In or Create Account",
            Modifier.fillMaxWidth(),
            icon = I.accountOutline,
            onClick = { showAuthDialog = true },
          )
        }
      }
    }
  }

  if (showAuthDialog) {
    AuthModalDialog(
      onDismiss = { showAuthDialog = false },
      onOpenDoc = onOpenDoc,
    )
  }
}

@Composable
fun AuthModalDialog(
  onDismiss: () -> Unit,
  onOpenDoc: (String) -> Unit,
) {
  var mode by remember { mutableStateOf(AuthMode.SignIn) }
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var confirmPassword by remember { mutableStateOf("") }
  var passwordVisible by remember { mutableStateOf(false) }
  var consentGiven by remember { mutableStateOf(false) }

  var errorMessage by remember { mutableStateOf<String?>(null) }
  var successMessage by remember { mutableStateOf<String?>(null) }
  var busy by remember { mutableStateOf(false) }
  var showForgotDialog by remember { mutableStateOf(false) }

  val scope = rememberCoroutineScope()

  AppDialog(
    onDismiss = onDismiss,
    title = if (mode == AuthMode.SignIn) "Sign In" else "Create Account",
    subtitle = if (mode == AuthMode.SignIn)
      "Access upcoming cloud sync across your devices."
    else
      "Create your free account. Document tools remain 100% on-device.",
  ) {
    Column(
      Modifier
        .fillMaxWidth()
        .padding(top = 10.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      // Toggle between Sign In and Sign Up
      Row(
        Modifier
          .fillMaxWidth()
          .background(c.sunken, RoundedCornerShape(10.dp))
          .padding(3.dp),
      ) {
        val activeBg = c.surface
        val inactiveBg = Color.Transparent
        Box(
          Modifier
            .weight(1f)
            .height(34.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (mode == AuthMode.SignIn) activeBg else inactiveBg)
            .tap { mode = AuthMode.SignIn; errorMessage = null; successMessage = null },
          contentAlignment = Alignment.Center,
        ) {
          T(
            "Sign In",
            Type.med.copy(fontSize = Type.small.fontSize * 1.05f),
            if (mode == AuthMode.SignIn) c.ink else c.sub,
          )
        }
        Box(
          Modifier
            .weight(1f)
            .height(34.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (mode == AuthMode.SignUp) activeBg else inactiveBg)
            .tap { mode = AuthMode.SignUp; errorMessage = null; successMessage = null },
          contentAlignment = Alignment.Center,
        ) {
          T(
            "Create Account",
            Type.med.copy(fontSize = Type.small.fontSize * 1.05f),
            if (mode == AuthMode.SignUp) c.ink else c.sub,
          )
        }
      }

      // Email field
      Field(
        value = email,
        onChange = { email = it; errorMessage = null },
        placeholder = "Email address",
        keyboard = KeyboardType.Email,
      )

      // Password field with toggle
      Field(
        value = password,
        onChange = { password = it; errorMessage = null },
        placeholder = "Password (min 6 characters)",
        keyboard = KeyboardType.Password,
        secret = !passwordVisible,
        trailing = {
          IconBtn(
            if (passwordVisible) I.eyeOffOutline else I.eyeOutline,
            color = c.sub,
            label = if (passwordVisible) "Hide password" else "Show password",
          ) {
            passwordVisible = !passwordVisible
          }
        },
      )

      // Confirm password in SignUp mode
      if (mode == AuthMode.SignUp) {
        Field(
          value = confirmPassword,
          onChange = { confirmPassword = it; errorMessage = null },
          placeholder = "Confirm password",
          keyboard = KeyboardType.Password,
          secret = !passwordVisible,
        )

        // Mandatory unchecked consent checkbox for Sign Up
        LegalConsentCheckbox(
          checked = consentGiven,
          onCheckedChange = { consentGiven = it; errorMessage = null },
          onOpenDoc = onOpenDoc,
        )
      }

      // Forgot Password link in SignIn mode
      if (mode == AuthMode.SignIn) {
        Row(
          Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.End,
        ) {
          T(
            "Forgot password?",
            Type.small,
            c.primary,
            Modifier.tap { showForgotDialog = true },
          )
        }
      }

      // Error Message display
      AnimatedVisibility(errorMessage != null) {
        errorMessage?.let {
          T(it, Type.small, c.error, Modifier.padding(vertical = 4.dp))
        }
      }

      // Success Message display
      AnimatedVisibility(successMessage != null) {
        successMessage?.let {
          T(it, Type.small, c.primary, Modifier.padding(vertical = 4.dp))
        }
      }

      // Primary Action Button
      val canSubmit = if (mode == AuthMode.SignUp) {
        email.isNotBlank() && password.length >= 6 && password == confirmPassword && consentGiven && !busy
      } else {
        email.isNotBlank() && password.length >= 6 && !busy
      }

      Btn(
        label = if (mode == AuthMode.SignIn) "Sign In" else "Create Account",
        modifier = Modifier.fillMaxWidth(),
        busy = busy,
        enabled = canSubmit,
        onClick = {
          if (mode == AuthMode.SignUp && password != confirmPassword) {
            errorMessage = "Passwords do not match."
            return@Btn
          }
          busy = true
          errorMessage = null
          successMessage = null

          if (mode == AuthMode.SignIn) {
            AuthManager.signIn(email, password, scope) { result ->
              busy = false
              when (result) {
                is AuthResult.Success -> {
                  onDismiss()
                }
                is AuthResult.Error -> {
                  errorMessage = result.message
                }
              }
            }
          } else {
            AuthManager.signUp(email, password, 2, scope) { result ->
              busy = false
              when (result) {
                is AuthResult.Success -> {
                  if (result.data.displayName == "Pending Email Confirmation") {
                    successMessage = "Confirmation email sent! Please verify your inbox."
                  } else {
                    onDismiss()
                  }
                }
                is AuthResult.Error -> {
                  errorMessage = result.message
                }
              }
            }
          }
        },
      )

      // Divider & Google Sign-In
      Row(
        Modifier
          .fillMaxWidth()
          .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Box(Modifier.weight(1f).height(0.6.dp).background(c.line))
        T(" OR ", Type.small, c.faint, Modifier.padding(horizontal = 8.dp))
        Box(Modifier.weight(1f).height(0.6.dp).background(c.line))
      }

      Btn(
        label = "Continue with Google",
        modifier = Modifier.fillMaxWidth(),
        icon = I.google,
        kind = BtnKind.Secondary,
        onClick = {
          AuthManager.signInWithGoogle { result ->
            if (result is AuthResult.Error) {
              errorMessage = result.message
            }
          }
        },
      )
    }
  }

  if (showForgotDialog) {
    ForgotPasswordDialog(
      initialEmail = email,
      onDismiss = { showForgotDialog = false },
    )
  }
}

@Composable
fun ForgotPasswordDialog(
  initialEmail: String,
  onDismiss: () -> Unit,
) {
  var resetEmail by remember { mutableStateOf(initialEmail) }
  var busy by remember { mutableStateOf(false) }
  var statusMessage by remember { mutableStateOf<String?>(null) }
  var isError by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  AppDialog(
    onDismiss = onDismiss,
    title = "Reset Password",
    subtitle = "Enter your account email to receive a password recovery link.",
  ) {
    Column(
      Modifier
        .fillMaxWidth()
        .padding(top = 10.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
      Field(
        value = resetEmail,
        onChange = { resetEmail = it; statusMessage = null },
        placeholder = "Registered email address",
        keyboard = KeyboardType.Email,
      )

      statusMessage?.let {
        T(it, Type.small, if (isError) c.error else c.primary)
      }

      Btn(
        "Send Reset Link",
        Modifier.fillMaxWidth(),
        busy = busy,
        enabled = resetEmail.isNotBlank() && !busy,
        onClick = {
          busy = true
          AuthManager.resetPassword(resetEmail, scope) { result ->
            busy = false
            when (result) {
              is AuthResult.Success -> {
                isError = false
                statusMessage = "Reset link dispatched! Check your email."
              }
              is AuthResult.Error -> {
                isError = true
                statusMessage = result.message
              }
            }
          }
        },
      )
    }
  }
}

