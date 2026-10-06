package com.sammyi57.pdftools

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

// White paper and ink with one red pencil. Dark is the same idea at night: neutral near-black and soft white, with
// the same red as the only color. The hero gradient (maroon to orange, like a lit page edge) is the one loud surface.
@Immutable
data class Palette(
  val bg: Color, // screen background
  val surface: Color, // grouped lists, inputs, dialogs
  val sunken: Color, // tiles behind artwork, pressed rows, search, segmented track
  val page: Color, // paper inside illustrations
  val ink: Color, // text and primary buttons
  val sub: Color,
  val faint: Color,
  val line: Color,
  val lineStrong: Color,
  val accent: Color,
  val accentSoft: Color,
  val accentInk: Color,
  val onInk: Color, // text on primary buttons
  val hero: List<Color>, // top to bottom
  val panel: Color, // the black "sessions" panel and the floating tab bar
  val onPanel: Color,
  val onPanelSub: Color,
  val dark: Boolean,
)

val LightPalette = Palette(
  bg = Color(0xFFFFFFFF), surface = Color(0xFFFFFFFF), sunken = Color(0xFFF2F2F1), page = Color(0xFFFFFFFF),
  ink = Color(0xFF141414), sub = Color(0xFF6A6A6A), faint = Color(0xFFA6A6A4), line = Color(0xFFEAEAE8),
  lineStrong = Color(0xFFD4D4D1), accent = Color(0xFFC9442A), accentSoft = Color(0xFFFBE4DD), accentInk = Color(0xFF7C2613),
  onInk = Color(0xFFFFFFFF),
  hero = listOf(Color(0xFF3A0904), Color(0xFFB02E17), Color(0xFFEF8A2E)),
  panel = Color(0xFF111111), onPanel = Color(0xFFFFFFFF), onPanelSub = Color(0xFF9B9B9B),
  dark = false,
)

val DarkPalette = Palette(
  bg = Color(0xFF0A0A0A), surface = Color(0xFF151515), sunken = Color(0xFF1E1E1E), page = Color(0xFF262626),
  ink = Color(0xFFEDEDED), sub = Color(0xFFA1A1A1), faint = Color(0xFF6B6B6B), line = Color(0xFF242424),
  lineStrong = Color(0xFF363636), accent = Color(0xFFE5694B), accentSoft = Color(0xFF2B1B17), accentInk = Color(0xFFF2B8A6),
  onInk = Color(0xFF0A0A0A),
  hero = listOf(Color(0xFF2A0603), Color(0xFF8E2412), Color(0xFFD9772A)),
  panel = Color(0xFF1B1B1B), onPanel = Color(0xFFF2F2F2), onPanelSub = Color(0xFF8A8A8A),
  dark = true,
)

// The scanner is its own dark, camera-style surface in both themes, with Adobe Scan's blue for detection and actions.
object ScanUi {
  val bg = Color(0xFF000000)
  val panel = Color(0xFF161616)
  val raised = Color(0xFF262626)
  val text = Color(0xFFFFFFFF)
  val dim = Color(0xFFA3A3A3)
  val line = Color(0xFF333333)
  val blue = Color(0xFF1473E6)
  val blueSoft = Color(0x381473E6)
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
