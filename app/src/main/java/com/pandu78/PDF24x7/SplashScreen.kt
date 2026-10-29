package com.pandu78.PDF24x7

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

// ======================= TIMING (milliseconds) =======================
// DO NOT REMOVE OR MERGE PHASES 1-3. They are required by the design.
const val kHoldMs = 200     // phase 0: logo still, upright, centered
const val kSpinUpMs = 400   // phase 1: rotate 0->135deg clockwise, scale 1x->2x
const val kSpinBackMs = 400 // phase 2: rotate 135->0deg, scale 2x->1x
const val kRestMs = 100     // phase 3: still, upright, centered
const val kRevealMs = 1000  // phase 4: logo slides left, text wipes in
const val kEndHoldMs = 300  // phase 5: final lockup stays still
const val kTotalMs = kHoldMs + kSpinUpMs + kSpinBackMs + kRestMs + kRevealMs + kEndHoldMs // 2400

const val kMaxStepMs = 34.0 // max time advance per frame (no phase skipping)

val kBg = Color(0xFFF5F6F8)

fun easeInOutCubic(t: Double): Double {
  val clamped = t.coerceIn(0.0, 1.0)
  return if (clamped < 0.5) 4.0 * clamped * clamped * clamped
  else 1.0 - Math.pow(-2.0 * clamped + 2.0, 3.0) / 2.0
}

/// 0 = rest pose, 1 = fully spun (135deg, 2x). Pure function, unit-tested.
fun splashSpinValue(ms: Double): Double {
  if (ms < kHoldMs) return 0.0
  if (ms < kHoldMs + kSpinUpMs) {
    return easeInOutCubic((ms - kHoldMs) / kSpinUpMs.toDouble())
  }
  if (ms < kHoldMs + kSpinUpMs + kSpinBackMs) {
    return 1.0 - easeInOutCubic((ms - kHoldMs - kSpinUpMs) / kSpinBackMs.toDouble())
  }
  return 0.0
}

/// 0..1 progress of phase 4 (lockup reveal).
fun splashLockupValue(ms: Double): Double {
  val start = kHoldMs + kSpinUpMs + kSpinBackMs + kRestMs.toDouble()
  val t = ((ms - start) / kRevealMs.toDouble()).coerceIn(0.0, 1.0)
  return easeInOutCubic(t)
}

/// Frame-capped clock: a slow/janky frame can never skip phases 1-3.
fun advanceSplashMs(currentMs: Double, dtMs: Double): Double {
  val step = if (dtMs < 0.0) 0.0 else if (dtMs > kMaxStepMs) kMaxStepMs else dtMs
  return (currentMs + step).coerceIn(0.0, kTotalMs.toDouble())
}

fun lerp(a: Double, b: Double, t: Double): Double = a + (b - a) * t

class WindowClipShape(
  private val left: Float,
  private val top: Float,
  private val right: Float,
  private val bottom: Float,
) : Shape {
  override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
    return Outline.Rectangle(Rect(left, top, right, bottom))
  }
}

@Composable
fun Pdf24Splash(onFinished: () -> Unit) {
  var ms by remember { mutableDoubleStateOf(0.0) }
  val currentOnFinished by rememberUpdatedState(onFinished)

  LaunchedEffect(Unit) {
    var lastNano = 0L
    var finished = false
    while (!finished) {
      withFrameNanos { frameTimeNanos ->
        if (lastNano != 0L) {
          val dtMs = (frameTimeNanos - lastNano) / 1_000_000.0
          ms = advanceSplashMs(ms, dtMs)
          if (ms >= kTotalMs) {
            finished = true
            currentOnFinished()
          }
        }
        lastNano = frameTimeNanos
      }
    }
  }

  BoxWithConstraints(Modifier.fillMaxSize().background(kBg)) {
    val s = maxWidth.value.toDouble() / 393.0 // Figma frame 393x852 -> screen
    val midY = maxHeight.value.toDouble() / 2.0
    fun dx(x: Double) = (x * s).dp
    fun dy(y: Double) = (midY + (y - 426.0) * s).dp

    val spin = splashSpinValue(ms) // phases 1-3
    val t = splashLockupValue(ms)  // phase 4

    val angle = (spin * 135.0).toFloat() // clockwise degrees
    val scale = (1.0 + spin).toFloat()   // 1x -> 2x

    // logo centre: (197,426) -> (88,426)
    val cx = lerp(197.0, 88.0, t)

    // text window grows from the centre sliver to [131..346]
    val winL = lerp(196.5, 131.0, t)
    val winR = lerp(197.5, 346.0, t)
    val textLeft = lerp(156.0, 131.0, t) // text slides 25px left

    val density = LocalDensity.current

    Box(Modifier.fillMaxSize()) {
      // Text layer with clip window
      if (t > 0.0) {
        val clipLeft = with(density) { dx(winL).toPx() }
        val clipTop = with(density) { dy(404.0).toPx() }
        val clipRight = with(density) { dx(winR).toPx() }
        val clipBottom = with(density) { dy(445.0).toPx() }

        Box(
          Modifier
            .fillMaxSize()
            .clip(WindowClipShape(clipLeft, clipTop, clipRight, clipBottom))
        ) {
          Image(
            painter = painterResource(R.drawable.splash_text),
            contentDescription = null,
            modifier = Modifier
              .offset(x = dx(textLeft), y = dy(404.0))
              .size(width = (215.0 * s).dp, height = (41.0 * s).dp)
          )
        }
      }

      // Logo layer
      val logoLeft = dx(cx - 48.0)
      val logoTop = dy(426.0 - 48.0)
      Image(
        painter = painterResource(R.drawable.splash_logo),
        contentDescription = null,
        modifier = Modifier
          .offset(x = logoLeft, y = logoTop)
          .size((96.0 * s).dp)
          .graphicsLayer {
            rotationZ = angle
            scaleX = scale
            scaleY = scale
            transformOrigin = TransformOrigin.Center
          }
      )
    }
  }
}

