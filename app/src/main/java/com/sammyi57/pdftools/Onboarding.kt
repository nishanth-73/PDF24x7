package com.sammyi57.pdftools

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin
import androidx.compose.ui.graphics.drawscope.Stroke as DrawStroke

// Three pages before the terms on a fresh install, as a sticker pinboard: one smooth scalloped seal, a
// taped card with a thick outline and a hard offset shadow, tilted notes and a scalloped sticker, smooth hand-drawn
// doodles in the margins, and a headline with the big word outlined. Nothing moves except the swipe itself.

private class IntroSpec(
  val bg: Color,
  val ink: Color, // small text, dots, doodle strokes
  val edge: Color, // outlines and hard shadows on the page
  val seal: Color, // the scalloped shape behind the card
  val tagBg: Color,
  val tagInk: Color,
  val btnBg: Color,
  val btnInk: Color,
  val btnShadow: Color,
  val darkIcons: Boolean, // dark status-bar icons (on a light page)
  val small: String,
  val big: String,
  val tag: String,
  val sticker: String,
  val topCard: Triple<String, String, Int>,
  val bottomCard: Triple<String, String, Int>,
)

private val INTROS = listOf(
  IntroSpec(
    Brand.tangerine, Brand.cherry, Brand.cherry, Color(0xFFFFE4DB), Brand.cool, Brand.cherry, Brand.cherry, Color.White, Brand.cool, true,
    "${TOOLS.size} free tools,", "Every PDF", "in your pocket", "100%\nfree",
    Triple("Merge PDFs", "Combine files", I.filePdfBox), Triple("Compress", "12 MB → 2 MB", I.folderZipOutline),
  ),
  IntroSpec(
    Brand.cool, Brand.cherry, Brand.cherry, Color.White, Brand.tangerine, Brand.cherry, Brand.cherry, Color.White, Brand.tangerine, true,
    "Point, tap,", "Scan", "in a snap", "on\ndevice",
    Triple("Auto crop", "Finds the edges", I.cameraOutline), Triple("Searchable", "Copy any text", I.textRecognition),
  ),
  IntroSpec(
    Brand.cherry, Color.White, Brand.tangerine, Color(0xFF5A2F42), Brand.cool, Brand.cherry, Brand.tangerine, Brand.cherry, Brand.cool, false,
    "Your files stay", "Private", "by design", "no\nsign-up",
    Triple("No ads", "No tracking", I.accountOffOutline), Triple("Works offline", "Even in airplane mode", I.wifiOff),
  ),
)

@Composable
fun Onboarding(onDone: () -> Unit) {
  val last = INTROS.lastIndex
  val pager = rememberPagerState { INTROS.size }
  val scope = rememberCoroutineScope()
  BackHandler(pager.currentPage > 0) { scope.launch { pager.animateScrollToPage(pager.currentPage - 1) } }

  // The page colour slides into the next one as you drag.
  val pos = pager.currentPage + pager.currentPageOffsetFraction
  val lo = floor(pos).toInt().coerceIn(0, last)
  val hi = (lo + 1).coerceAtMost(last)
  val bg = lerp(INTROS[lo].bg, INTROS[hi].bg, (pos - lo).coerceIn(0f, 1f))
  val now = INTROS[pager.currentPage]
  val ink by animateColorAsState(now.ink, tween(300), label = "introInk")
  val btnBg by animateColorAsState(now.btnBg, tween(300), label = "introBtn")
  val btnInk by animateColorAsState(now.btnInk, tween(300), label = "introBtnInk")
  val btnShadow by animateColorAsState(now.btnShadow, tween(300), label = "introBtnShadow")

  val view = LocalView.current
  val themeDark = c.dark
  DisposableEffect(now.darkIcons) {
    val ctl = WindowCompat.getInsetsController((view.context as Activity).window, view)
    ctl.isAppearanceLightStatusBars = now.darkIcons
    ctl.isAppearanceLightNavigationBars = now.darkIcons
    onDispose {
      ctl.isAppearanceLightStatusBars = !themeDark
      ctl.isAppearanceLightNavigationBars = !themeDark
    }
  }

  Box(Modifier.fillMaxSize().background(bg)) {
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
      Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
        if (pager.currentPage < last) T("Skip", Type.med, ink, Modifier.tap(scaleTo = 0.92f, label = "Skip the intro", onClick = onDone).padding(horizontal = 10.dp, vertical = 8.dp))
      }
      HorizontalPager(pager, Modifier.weight(1f).fillMaxWidth()) { i -> IntroPage(INTROS[i], i) }
      IntroDots(pager.currentPage, INTROS.size, ink)
      // The button gets the same hard offset shadow as everything else on the page.
      Box(Modifier.padding(start = 24.dp, end = 28.dp).padding(top = 18.dp, bottom = 26.dp).fillMaxWidth().height(56.dp)) {
        Box(Modifier.matchParentSize().offset(4.dp, 5.dp).background(btnShadow, CircleShape))
        Row(
          Modifier.matchParentSize()
            .tap(shape = CircleShape, scaleTo = 0.97f) { if (pager.currentPage < last) scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } else onDone() }
            .background(btnBg, CircleShape),
          horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) {
          T(if (pager.currentPage < last) "Next" else "Get started", Type.button, btnInk, maxLines = 1)
          Spacer(Modifier.size(8.dp))
          Icon(I.arrowRight, 20.dp, btnInk)
        }
      }
    }
  }
}

@Composable
private fun IntroPage(s: IntroSpec, index: Int) {
  Box(Modifier.fillMaxSize()) {
    Canvas(Modifier.fillMaxSize()) { introPaper(s.ink, s.btnShadow, flip = index == 1) }
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      IntroCollage(s, index, Modifier.weight(1f).fillMaxWidth())
      IntroHeadline(s)
      Spacer(Modifier.height(8.dp))
    }
  }
}

@Composable
private fun IntroDots(current: Int, count: Int, color: Color) {
  Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
    repeat(count) { i ->
      val on = i == current
      val w by animateDpAsState(if (on) 28.dp else 8.dp, tween(260), label = "introDot")
      Box(Modifier.padding(horizontal = 3.dp).height(8.dp).width(w).background(color.copy(alpha = if (on) 1f else 0.35f), CircleShape))
    }
  }
}

/** A box with a thick outline and a solid offset shadow, the way a sticker sits on a pinboard. */
@Composable
private fun Sticker(
  modifier: Modifier,
  shape: Shape,
  fill: Color,
  edge: Color,
  inner: Modifier = Modifier,
  shadow: Dp = 5.dp,
  line: Dp = 2.5.dp,
  content: @Composable () -> Unit,
) {
  Box(modifier) {
    Box(Modifier.matchParentSize().offset(shadow, shadow).background(edge, shape))
    Box(inner.background(fill, shape).border(line, edge, shape).clip(shape), contentAlignment = Alignment.Center) { content() }
  }
}

/** The small line, the big outlined word with its hard shadow, and the last line on a tilted tag. */
@Composable
private fun IntroHeadline(s: IntroSpec) {
  BoxWithConstraints(Modifier.fillMaxWidth()) {
    val size = (maxWidth.value / (s.big.length * 0.62f)).coerceIn(40f, 64f)
    val big = TextStyle(fontFamily = Poppins, fontWeight = FontWeight.SemiBold, fontSize = size.sp, lineHeight = (size * 1.08f).sp, letterSpacing = (-1.5).sp)
    val stroke = with(LocalDensity.current) { 7.dp.toPx() }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
      T(s.small, Type.body.copy(fontSize = 20.sp, lineHeight = 26.sp), s.ink)
      Box(contentAlignment = Alignment.Center) {
        T(s.big, big.copy(drawStyle = DrawStroke(stroke, join = StrokeJoin.Round)), s.edge, Modifier.offset(4.dp, 5.dp), maxLines = 1, overflow = TextOverflow.Clip)
        T(s.big, big.copy(drawStyle = DrawStroke(stroke, join = StrokeJoin.Round)), s.edge, maxLines = 1, overflow = TextOverflow.Clip)
        T(s.big, big, Color.White, maxLines = 1, overflow = TextOverflow.Clip)
      }
      Sticker(
        Modifier.offset(y = (-4).dp).graphicsLayer { rotationZ = -3f }, RoundedCornerShape(10.dp), s.tagBg, s.edge, shadow = 3.dp, line = 2.dp,
      ) { T(s.tag, Type.title.copy(fontSize = 26.sp, lineHeight = 34.sp), s.tagInk, Modifier.padding(horizontal = 16.dp, vertical = 2.dp), maxLines = 1) }
    }
  }
}

/** A circle with scalloped edges: one disc plus a ring of overlapping lobes, all one colour, so the outline is smooth. */
private fun DrawScope.scallop(c: Offset, radius: Float, lobes: Int, color: Color) {
  drawCircle(color, radius * 0.9f, c)
  for (k in 0 until lobes) {
    val a = k * 2 * PI / lobes
    drawCircle(color, radius * 0.26f, Offset(c.x + (radius * 0.86f * cos(a)).toFloat(), c.y + (radius * 0.86f * sin(a)).toFloat()))
  }
}

/** One scalloped seal behind a taped card, tilted notes, and a scalloped sticker over its corners. */
@Composable
private fun IntroCollage(s: IntroSpec, index: Int, modifier: Modifier) {
  BoxWithConstraints(modifier.padding(top = 4.dp, bottom = 12.dp), contentAlignment = Alignment.Center) {
    val cw = (maxWidth * 0.60f).coerceAtMost(250.dp)
    val ch = (maxHeight * 0.78f).coerceAtMost(cw * 1.25f)
    val edge = ((maxWidth - cw) / 2 - 16.dp).coerceAtLeast(0.dp)
    val seal = minOf(maxWidth.value, maxHeight.value) * 0.40f
    Canvas(Modifier.fillMaxSize()) {
      val c = Offset(size.width / 2, size.height / 2)
      scallop(Offset(c.x - 10.dp.toPx(), c.y + 8.dp.toPx()), seal.dp.toPx(), 12, s.btnShadow.copy(alpha = 0.55f)) // a second, offset seal for depth
      scallop(c, seal.dp.toPx(), 12, s.seal)
    }
    Sticker(Modifier.size(cw, ch).graphicsLayer { rotationZ = -2f }, RoundedCornerShape(28.dp), Color.White, s.edge, Modifier.matchParentSize(), shadow = 8.dp, line = 3.dp) { IntroArt(index) }
    // Tape holding the card down at two corners.
    Box(Modifier.offset(x = -cw / 2 + 22.dp, y = -ch / 2 + 6.dp).size(58.dp, 18.dp).graphicsLayer { rotationZ = -38f }.background(s.tagBg.copy(alpha = 0.92f), RoundedCornerShape(3.dp)))
    Box(Modifier.offset(x = cw / 2 - 22.dp, y = ch / 2 - 6.dp).size(58.dp, 18.dp).graphicsLayer { rotationZ = -38f }.background(s.tagBg.copy(alpha = 0.92f), RoundedCornerShape(3.dp)))
    IntroNote(s, s.topCard, Modifier.align(Alignment.TopStart).offset(x = edge, y = 12.dp).graphicsLayer { rotationZ = -4f })
    IntroNote(s, s.bottomCard, Modifier.align(Alignment.BottomEnd).offset(x = -edge - 4.dp, y = (-12).dp).graphicsLayer { rotationZ = 4f })
    // The scalloped sticker, over the card's top-right corner.
    Box(Modifier.align(Alignment.TopEnd).offset(x = -(edge - 6.dp).coerceAtLeast(0.dp), y = 70.dp).size(82.dp).graphicsLayer { rotationZ = 10f }) {
      Canvas(Modifier.matchParentSize()) {
        val c = Offset(size.width / 2 - 3.dp.toPx(), size.height / 2 - 3.dp.toPx())
        scallop(Offset(c.x + 4.dp.toPx(), c.y + 5.dp.toPx()), size.width * 0.42f, 12, s.edge)
        scallop(c, size.width * 0.42f, 12, s.tagBg)
      }
      T(s.sticker, Type.label.copy(fontSize = 12.sp, lineHeight = 14.sp), s.tagInk, Modifier.align(Alignment.Center).offset(x = (-3).dp, y = (-3).dp), align = TextAlign.Center)
    }
  }
}

@Composable
private fun IntroNote(s: IntroSpec, card: Triple<String, String, Int>, modifier: Modifier) {
  Sticker(modifier, RoundedCornerShape(16.dp), Color.White, s.edge, shadow = 4.dp) {
    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
      Box(Modifier.size(38.dp).background(Brand.cool, RoundedCornerShape(11.dp)), contentAlignment = Alignment.Center) { Icon(card.third, 22.dp, Brand.cherry) }
      Column(Modifier.padding(start = 10.dp, end = 4.dp)) {
        T(card.first, Type.bold.copy(fontSize = 13.sp), Brand.cherry, maxLines = 1)
        T(card.second, Type.small.copy(fontSize = 11.sp, lineHeight = 14.sp), Brand.cherry.copy(alpha = 0.6f), maxLines = 1)
      }
    }
  }
}

/** What's on the big card: four tool pictures, a page in the viewfinder, or a locked phone. */
@Composable
private fun IntroArt(index: Int) {
  when (index) {
    0 -> CompositionLocalProvider(LocalPalette provides LightPalette) {
      Column(verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        listOf(listOf("merge", "split"), listOf("compress", "watermark")).forEach { row ->
          Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) { row.forEach { id -> ArtTile(id, 64.dp, bg = Brand.cool.copy(alpha = 0.6f)) } }
        }
      }
    }
    1 -> Canvas(Modifier.size(130.dp, 160.dp)) {
      val w = size.width
      val h = size.height
      drawRoundRect(Color(0xFFF1ECE8), cornerRadius = CornerRadius(10.dp.toPx()))
      for (k in 0 until 6) {
        drawRoundRect(Color(0xFFD9CEC9), Offset(16.dp.toPx(), (22 + k * 22).dp.toPx()), Size(w * (if (k % 2 == 0) 0.68f else 0.48f), 7.dp.toPx()), CornerRadius(3.5.dp.toPx()))
      }
      // The viewfinder corners around the page, and the scan line caught mid-page.
      val m = 8.dp.toPx()
      val len = 24.dp.toPx()
      val sw = 5.dp.toPx()
      listOf(-m to -m, w + m to -m, -m to h + m, w + m to h + m).forEach { (x, y) ->
        val dx = if (x < 0) len else -len
        val dy = if (y < 0) len else -len
        drawLine(Brand.tangerine, Offset(x, y), Offset(x + dx, y), sw, StrokeCap.Round)
        drawLine(Brand.tangerine, Offset(x, y), Offset(x, y + dy), sw, StrokeCap.Round)
      }
      drawRect(Brand.tangerine.copy(alpha = 0.16f), Offset(0f, h * 0.5f - 22.dp.toPx()), Size(w, 22.dp.toPx()))
      drawLine(Brand.tangerine, Offset(0f, h * 0.5f), Offset(w, h * 0.5f), 3.dp.toPx(), StrokeCap.Round)
    }
    else -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
      Box(Modifier.size(104.dp).background(Brand.cool, CircleShape), contentAlignment = Alignment.Center) { Icon(I.cellphoneLock, 58.dp, Brand.cherry) }
      T("On this phone", Type.bold, Brand.cherry, Modifier.padding(top = 14.dp))
      T("Nothing is uploaded", Type.small, Brand.cherry.copy(alpha = 0.6f))
    }
  }
}

/**
 * The page behind everything: smooth hand-drawn doodles in the margins (sparkles, squiggles, rings, a cross, dots, a
 * zigzag). Every stroke is a round-capped curve, so no edge is jagged.
 */
private fun DrawScope.introPaper(ink: Color, accent: Color, flip: Boolean) {
  val w = size.width
  val h = size.height
  val line = ink.copy(alpha = 0.65f)
  val st = DrawStroke(2.6.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
  fun p(v: Float) = v.dp.toPx()
  fun fx(x: Float) = if (flip) w - x else x
  fun sparkle(cx: Float, cy: Float, r: Float, solid: Boolean) {
    val path = Path().apply {
      moveTo(cx, cy - r)
      quadraticBezierTo(cx, cy, cx + r, cy)
      quadraticBezierTo(cx, cy, cx, cy + r)
      quadraticBezierTo(cx, cy, cx - r, cy)
      quadraticBezierTo(cx, cy, cx, cy - r)
      close()
    }
    if (solid) drawPath(path, accent) else drawPath(path, line, style = st)
  }
  fun squiggle(sx: Float, sy: Float, len: Float, amp: Float, waves: Int, vertical: Boolean) {
    val x0 = if (!vertical && flip) w - sx - len else sx
    val path = Path().apply {
      moveTo(x0, sy)
      val step2 = len / (waves * 2)
      for (i in 0 until waves * 2) {
        val d = if (i % 2 == 0) -amp else amp
        val mid = step2 * i + step2 / 2
        val end = step2 * (i + 1)
        if (vertical) quadraticBezierTo(x0 + d * 2, sy + mid, x0, sy + end) else quadraticBezierTo(x0 + mid, sy + d * 2, x0 + end, sy)
      }
    }
    drawPath(path, line, style = st)
  }
  fun arrow(x1: Float, y1: Float, cx: Float, cy: Float, x2: Float, y2: Float) {
    drawPath(Path().apply { moveTo(x1, y1); quadraticBezierTo(cx, cy, x2, y2) }, line, style = st)
    val a = atan2(y2 - cy, x2 - cx)
    for (da in listOf(2.6f, -2.6f)) drawLine(line, Offset(x2, y2), Offset(x2 + p(9f) * cos(a + da), y2 + p(9f) * sin(a + da)), st.width, StrokeCap.Round)
  }

  sparkle(fx(w - p(30f)), p(30f), p(15f), solid = true)
  sparkle(fx(w - p(60f)), p(66f), p(7f), solid = false)
  sparkle(fx(p(26f)), p(38f), p(9f), solid = false)
  drawLine(line, Offset(fx(p(40f)) - p(6f), p(86f)), Offset(fx(p(40f)) + p(6f), p(86f)), st.width, StrokeCap.Round)
  drawLine(line, Offset(fx(p(40f)), p(86f) - p(6f)), Offset(fx(p(40f)), p(86f) + p(6f)), st.width, StrokeCap.Round)
  drawCircle(line, p(6f), Offset(fx(p(14f)), h * 0.36f), style = st)
  drawCircle(line, p(4.5f), Offset(fx(w - p(14f)), h * 0.52f), style = st)
  for (i in 0..2) drawCircle(line, p(2.4f), Offset(fx(w - p(17f)), h * 0.28f + i * p(9f)))
  squiggle(fx(p(14f)), h * 0.44f, p(70f), p(4f), 3, vertical = true)
  squiggle(w - p(92f), h * 0.69f, p(64f), p(4f), 3, vertical = false)
  arrow(fx(p(16f)), h * 0.58f, fx(p(34f)), h * 0.5f, fx(p(40f)), h * 0.43f)
  // A small zigzag low on the left, clear of the headline.
  val zig = Path().apply {
    moveTo(fx(p(14f)), h * 0.95f)
    for (i in 1..4) lineTo(fx(p(14f) + i * p(9f)), h * 0.95f + if (i % 2 == 1) -p(7f) else 0f)
  }
  drawPath(zig, line, style = st)
}
