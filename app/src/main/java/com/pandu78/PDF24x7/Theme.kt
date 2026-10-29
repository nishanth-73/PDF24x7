package com.pandu78.PDF24x7

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File

// Central semantic theme tokens for PDF24x7
// Clean, trustworthy: Charcoal for structure, blue for action, white for space.
object BrandTokens {
  object Light {
    val background = Color(0xFFF5F6F8)
    val surface = Color(0xFFFFFFFF)
    val surfaceSecondary = Color(0xFFEBECF0)
    val textPrimary = Color(0xFF303136)
    val textSecondary = Color(0xFF6B6D76)
    val separator = Color(0x24303136) // rgba(48,49,54,0.14)
    val primary = Color(0xFF0572EC)
    val primaryPressed = Color(0xFF0364D3)
    val onPrimary = Color(0xFFFFFFFF)
    val error = Color(0xFFD92D20)
    val success = Color(0xFF12915A)
    val warning = Color(0xFFD97706)
  }

  object Dark {
    val background = Color(0xFF17181B)
    val surface = Color(0xFF232428)
    val surfaceSecondary = Color(0xFF303136)
    val textPrimary = Color(0xFFFFFFFF)
    val textSecondary = Color(0xFFA5A7B0)
    val separator = Color(0x1FFFFFFF) // rgba(255,255,255,0.12)
    val primary = Color(0xFF3D8EF5)
    val primaryPressed = Color(0xFF0572EC)
    val onPrimary = Color(0xFFFFFFFF)
    val error = Color(0xFFFF6B63)
    val success = Color(0xFF34D399)
    val warning = Color(0xFFFFB020)
  }
}

object Brand {
  val charcoal = Color(0xFF303136)
  val blue = Color(0xFF0572EC)
  val blueDark = Color(0xFF3D8EF5)
  val white = Color(0xFFFFFFFF)

  val cherry = charcoal
  val tangerine = blue
  val cool = Color(0xFFEBECF0)
}

@Immutable
data class Palette(
  // Semantic theme tokens
  val background: Color,
  val surface: Color,
  val surfaceSecondary: Color,
  val textPrimary: Color,
  val textSecondary: Color,
  val separator: Color,
  val primary: Color,
  val primaryPressed: Color,
  val onPrimary: Color,
  val error: Color,
  val success: Color,
  val warning: Color,
  val dark: Boolean,

  // Semantic aliases for existing codebase consumption
  val bg: Color = background,
  val sunken: Color = surfaceSecondary,
  val page: Color = surface,
  val ink: Color = textPrimary,
  val sub: Color = textSecondary,
  val faint: Color = textSecondary.copy(alpha = 0.55f),
  val line: Color = separator,
  val lineStrong: Color = if (dark) Color(0x33FFFFFF) else Color(0x38303136),
  val accent: Color = primary,
  val accentSoft: Color = primary.copy(alpha = 0.12f),
  val accentInk: Color = primary,
  val onInk: Color = onPrimary,
  val heroCard: Color = if (dark) BrandTokens.Dark.surfaceSecondary else Brand.charcoal,
  val heroSub: Color = if (dark) BrandTokens.Dark.textSecondary else BrandTokens.Light.surfaceSecondary.copy(alpha = 0.85f),
  val hero: List<Color> = listOf(heroCard, heroCard, heroCard),
  val panel: Color = if (dark) BrandTokens.Dark.surface else Brand.charcoal,
  val onPanel: Color = Color(0xFFFFFFFF),
  val onPanelSub: Color = if (dark) BrandTokens.Dark.textSecondary else Color(0xFFC0C2C8),
)

val LightPalette = Palette(
  background = BrandTokens.Light.background,
  surface = BrandTokens.Light.surface,
  surfaceSecondary = BrandTokens.Light.surfaceSecondary,
  textPrimary = BrandTokens.Light.textPrimary,
  textSecondary = BrandTokens.Light.textSecondary,
  separator = BrandTokens.Light.separator,
  primary = BrandTokens.Light.primary,
  primaryPressed = BrandTokens.Light.primaryPressed,
  onPrimary = BrandTokens.Light.onPrimary,
  error = BrandTokens.Light.error,
  success = BrandTokens.Light.success,
  warning = BrandTokens.Light.warning,
  dark = false,
)

val DarkPalette = Palette(
  background = BrandTokens.Dark.background,
  surface = BrandTokens.Dark.surface,
  surfaceSecondary = BrandTokens.Dark.surfaceSecondary,
  textPrimary = BrandTokens.Dark.textPrimary,
  textSecondary = BrandTokens.Dark.textSecondary,
  separator = BrandTokens.Dark.separator,
  primary = BrandTokens.Dark.primary,
  primaryPressed = BrandTokens.Dark.primaryPressed,
  onPrimary = BrandTokens.Dark.onPrimary,
  error = BrandTokens.Dark.error,
  success = BrandTokens.Dark.success,
  warning = BrandTokens.Dark.warning,
  dark = true,
)

// The scanner UI uses dark mode tokens consistently across both themes
object ScanUi {
  val bg = BrandTokens.Dark.background
  val panel = BrandTokens.Dark.surface
  val raised = BrandTokens.Dark.surfaceSecondary
  val text = BrandTokens.Dark.textPrimary
  val dim = BrandTokens.Dark.textSecondary
  val line = BrandTokens.Dark.separator
  val accent = BrandTokens.Dark.primary
  val accentPressed = BrandTokens.Dark.primaryPressed
  val accentSoft = BrandTokens.Dark.primary.copy(alpha = 0.15f)
  val onAccent = BrandTokens.Dark.onPrimary
  val scrim = Color(0x99000000)
}

val LocalPalette = staticCompositionLocalOf { LightPalette }

/** The active palette. */
val c: Palette @Composable get() = LocalPalette.current

// Poppins throughout. It runs tall, so line heights are ~1.3x to keep accents and descenders unclipped.
val Poppins = FontFamily(
  Font(R.font.poppins_regular, FontWeight.Normal),
  Font(R.font.poppins_medium, FontWeight.Medium),
  Font(R.font.poppins_semibold, FontWeight.SemiBold),
)

object Type {
  private fun s(size: Float, weight: FontWeight, line: Float? = null, spacing: Float = 0f) = TextStyle(
    fontFamily = Poppins, fontWeight = weight, fontSize = size.sp,
    lineHeight = (line ?: (size * 1.32f)).sp, letterSpacing = spacing.sp,
  )
  val largeTitle = s(32f, FontWeight.SemiBold, 42f, -0.5f)
  val title = s(25f, FontWeight.SemiBold, 33f, -0.3f)
  val hero = s(25f, FontWeight.SemiBold, 33f, -0.4f)
  val body = s(15f, FontWeight.Normal, 22f)
  val small = s(13f, FontWeight.Normal, 19f)
  val item = s(15f, FontWeight.Medium)
  val label = s(13f, FontWeight.SemiBold)
  val button = s(15f, FontWeight.SemiBold)
  val num = s(12.5f, FontWeight.Medium)
  val med = s(13.5f, FontWeight.Medium)
  val bold = s(14f, FontWeight.SemiBold)
  val big = s(26f, FontWeight.SemiBold, 32f, -0.6f) // the reference's big numbers: sizes and counts
  val caption = s(11.5f, FontWeight.Medium, 16f, 1.4f) // uppercase section labels, spaced out
}

// Deliberately not one radius for everything: small things are tighter.
object Radius {
  val tile = 10.dp
  val control = 12.dp
  val group = 16.dp
  val card = 22.dp
  val hero = 30.dp
}

enum class ThemePref { System, Light, Dark }

object ThemeState {
  private val file get() = File(appContext.filesDir, "theme.txt") // same file the Expo app used
  var pref by mutableStateOf(read())
    private set

  private fun read(): ThemePref = try {
    when (file.takeIf { it.exists() }?.readText()?.trim()) {
      "light" -> ThemePref.Light
      "dark" -> ThemePref.Dark
      else -> ThemePref.System
    }
  } catch (_: Exception) {
    ThemePref.System
  }

  fun set(p: ThemePref) {
    pref = p
    try { file.writeText(p.name.lowercase()) } catch (_: Exception) {}
  }
}
