package com.pandu78.PDF24x7.feedback

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.pandu78.PDF24x7.AppDialog
import com.pandu78.PDF24x7.Btn
import com.pandu78.PDF24x7.BtnKind
import com.pandu78.PDF24x7.Field
import com.pandu78.PDF24x7.I
import com.pandu78.PDF24x7.Icon
import com.pandu78.PDF24x7.Radius
import com.pandu78.PDF24x7.T
import com.pandu78.PDF24x7.Type
import com.pandu78.PDF24x7.c
import com.pandu78.PDF24x7.tap

val FEEDBACK_CATEGORIES = listOf(
  "Bug Report",
  "Feature Request",
  "PDF Issue",
  "General",
)

@Composable
fun FeedbackDialog(
  version: String,
  onDismiss: () -> Unit,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()

  var selectedCategory by remember { mutableStateOf(FEEDBACK_CATEGORIES[0]) }
  var email by remember { mutableStateOf("") }
  var message by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }

  var successMessage by remember { mutableStateOf<String?>(null) }
  var errorMessage by remember { mutableStateOf<String?>(null) }
  var showEmailFallback by remember { mutableStateOf(false) }

  AppDialog(
    onDismiss = onDismiss,
    title = "Send Feedback",
    subtitle = "Tell us what to improve or report an issue. Your feedback helps make PDF24x7 better.",
  ) {
    if (successMessage != null) {
      Column(
        Modifier
          .fillMaxWidth()
          .padding(vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
      ) {
        Box(
          Modifier
            .size(54.dp)
            .background(c.primary.copy(alpha = 0.12f), CircleShape),
          contentAlignment = Alignment.Center,
        ) {
          Icon(I.checkCircle, 30.dp, c.primary)
        }
        T("Thank You!", Type.bold)
        T(
          successMessage ?: "Your feedback has been received.",
          Type.small,
          c.sub,
          align = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Btn("Done", Modifier.fillMaxWidth(), onClick = onDismiss)
      }
    } else {
      Column(
        Modifier
          .fillMaxWidth()
          .padding(top = 10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
      ) {
        // Category selection chips
        T("Category", Type.small, c.sub)
        Row(
          Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          FEEDBACK_CATEGORIES.forEach { cat ->
            val active = cat == selectedCategory
            val shape = RoundedCornerShape(8.dp)
            Box(
              Modifier
                .weight(1f)
                .height(32.dp)
                .clip(shape)
                .background(if (active) c.primary else c.sunken)
                .tap { selectedCategory = cat },
              contentAlignment = Alignment.Center,
            ) {
              T(
                cat.substringBefore(" "),
                Type.small.copy(fontSize = Type.small.fontSize * 0.9f),
                color = if (active) c.onPrimary else c.ink,
              )
            }
          }
        }

        // Optional email
        Column {
          Field(
            value = email,
            onChange = { email = it },
            placeholder = "Your email address (optional)",
            keyboard = KeyboardType.Email,
          )
          T(
            "Used only to reply to your inquiry. Never shared.",
            Type.small.copy(fontSize = Type.small.fontSize * 0.85f),
            c.faint,
            Modifier.padding(top = 4.dp, start = 4.dp),
          )
        }

        // Multiline message field
        val shape = RoundedCornerShape(Radius.control)
        BasicTextField(
          value = message,
          onValueChange = { message = it; errorMessage = null },
          modifier = Modifier
            .fillMaxWidth()
            .height(110.dp)
            .background(c.surface, shape)
            .border(1.dp, c.line, shape)
            .padding(12.dp),
          textStyle = Type.body.copy(color = c.ink),
          cursorBrush = SolidColor(c.primary),
          keyboardOptions = KeyboardOptions(autoCorrectEnabled = true, imeAction = ImeAction.Default),
          decorationBox = { inner ->
            Box {
              if (message.isEmpty()) {
                T(
                  "Describe the problem, tool behavior, or feature you'd like to see…",
                  Type.body,
                  c.faint,
                )
              }
              inner()
            }
          },
        )

        // Error message
        AnimatedVisibility(errorMessage != null) {
          errorMessage?.let {
            T(it, Type.small, c.error)
          }
        }

        // Submit Button
        Btn(
          label = "Send Feedback",
          modifier = Modifier.fillMaxWidth(),
          icon = I.send,
          busy = busy,
          enabled = message.trim().length >= 10 && !busy,
          onClick = {
            busy = true
            errorMessage = null
            showEmailFallback = false

            FeedbackService.sendFeedback(
              category = selectedCategory,
              message = message,
              email = email.ifBlank { null },
              appVersion = version,
              scope = scope,
            ) { result ->
              busy = false
              when (result) {
                is FeedbackResult.Success -> {
                  successMessage = result.message
                }
                is FeedbackResult.Unconfigured -> {
                  errorMessage = result.message
                  showEmailFallback = true
                }
                is FeedbackResult.Error -> {
                  errorMessage = result.message
                  showEmailFallback = true
                }
              }
            }
          },
        )

        // Fallback option to launch email app directly
        if (showEmailFallback) {
          Btn(
            label = "Open Email App Instead",
            modifier = Modifier.fillMaxWidth(),
            icon = I.emailOutline,
            kind = BtnKind.Secondary,
            onClick = {
              FeedbackService.openEmailClient(
                context = context,
                category = selectedCategory,
                message = message,
                userEmail = email.ifBlank { null },
              )
            },
          )
        }
      }
    }
  }
}

