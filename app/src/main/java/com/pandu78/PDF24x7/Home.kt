package com.pandu78.PDF24x7

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// Tokenized search: every word in the query must appear somewhere in the target.
internal fun matches(target: String, tokens: List<String>) = target.lowercase().let { t -> tokens.all { it in t } }

@Composable
fun Home() {
  val nav = LocalNav.current
  val files = remember(Store.version) { listAllFiles() }
  val pinned = Pins.ids.mapNotNull { toolById(it) }

  Screen {
    LargeTitle("Home", "Welcome to PDF24x7. Everything runs on this phone.")

    Stagger(0) { Hero(files) { nav.scan() } }
    if (files.isNotEmpty()) Stagger(1) { RecentPanel(files.take(4)) { nav.show(Tab.Files) } }

    if (pinned.isNotEmpty()) {
      Stagger(2) {
        Column {
          GroupLabel("Pinned · ${pinned.size}", "All tools", { nav.show(Tab.Tools) })
          ToolGrid(pinned, shared = false) { nav.tool(it.id) }
        }
      }
    }

    Stagger(3) {
      Row(
        Modifier
          .padding(top = 16.dp)
          .fillMaxWidth()
          .shadow(4.dp, RoundedCornerShape(Radius.card))
          .clip(RoundedCornerShape(Radius.card))
          .background(c.surface)
          .border(0.6.dp, c.line, RoundedCornerShape(Radius.card))
          .tap(shape = RoundedCornerShape(Radius.card), label = "Browse all tools") { nav.show(Tab.Tools) }
          .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
      ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Box(
            Modifier.size(42.dp).background(c.sunken, CircleShape),
            contentAlignment = Alignment.Center,
          ) {
            Icon(I.viewGridOutline, 22.dp, c.primary)
          }
          Spacer(Modifier.size(14.dp))
          Column {
            T("Browse All Tools", Type.bold)
            T("${TOOLS.size} PDF tools ready to use", Type.small, c.sub)
          }
        }
        Icon(I.arrowRight, 18.dp, c.sub)
      }
    }

    Stagger(4) {
      Spacer(Modifier.height(14.dp))
      com.pandu78.PDF24x7.ads.AdBannerSlot("home_footer")
    }
  }
}

private fun greeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
  in 5..11 -> "Good morning!"
  in 12..16 -> "Good afternoon!"
  else -> "Good evening!"
}

// The loud card: a warm gradient and one plain sentence about what's on the phone, with little icons in the words.
@Composable
private fun Hero(files: List<Saved>, onScan: () -> Unit) {
  val shape = RoundedCornerShape(Radius.hero)
  val today = files.count { dayLabel(it.modified).startsWith("Today") }
  val bytes = files.sumOf { it.size }
  val soft = Color.White.copy(alpha = 0.75f)
  val sentence = buildAnnotatedString {
    withStyle(SpanStyle(color = Color.White)) { append(greeting()) }
    withStyle(SpanStyle(color = soft)) { append(" Ready to ") }
    appendInlineContent("cam", "[camera]")
    withStyle(SpanStyle(color = Color.White)) { append(" scan?") }
  }
  val camSize = Type.hero.fontSize
  val drop = with(androidx.compose.ui.platform.LocalDensity.current) { (camSize * (4f / 24f)).toDp() }
  val inline = mapOf(
    "cam" to InlineTextContent(Placeholder(1.1.em, 1.em, PlaceholderVerticalAlign.AboveBaseline)) {
      Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        BasicText(
          String(Character.toChars(I.cameraOutline)), Modifier.offset(y = drop),
          TextStyle(fontFamily = Mdi, fontSize = camSize, lineHeight = camSize, color = Color.White),
        )
      }
    },
  )
  Column(
    Modifier.padding(top = 16.dp).fillMaxWidth().tap(shape = shape, scaleTo = 0.98f, label = "Scan a document", onClick = onScan)
      .clip(shape).glow(c.hero, 0.9f, 1.05f).padding(22.dp),
  ) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      T(SimpleDateFormat("EEE, d MMM", Locale.getDefault()).format(Date()), Type.bold.copy(fontSize = Type.bold.fontSize * 1.1f), Color.White.copy(alpha = 0.85f), Modifier.weight(1f))
      if (Backup.state.enabled) {
        Row(Modifier.background(Color.White.copy(alpha = 0.16f), CircleShape).padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
          Icon(I.googleDrive, 14.dp, Color.White)
          Spacer(Modifier.size(5.dp))
          T(if (Backup.syncing) "Syncing" else "Synced", Type.num, Color.White)
        }
      }
    }
    BasicText(sentence, Modifier.padding(top = 14.dp), Type.hero, inlineContent = inline)
    Spacer(Modifier.height(26.dp))
    Row(verticalAlignment = Alignment.Bottom) {
      Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Stat("Today", plural(today, "file"))
        Stat("On phone", fmtSize(bytes).ifEmpty { "0 KB" })
      }
      Row(
        Modifier.background(c.primary, CircleShape).padding(start = 14.dp, end = 10.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        T("Open camera", Type.label, c.onPrimary)
        Spacer(Modifier.size(4.dp))
        Icon(I.arrowRight, 16.dp, c.onPrimary)
      }
    }
  }
}

// Two cards a row, each the height of the taller one, so titles and descriptions line up across the grid.
@Composable
internal fun ToolGrid(items: List<Tool>, shared: Boolean = true, onOpen: (Tool) -> Unit) {
  Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
    items.chunked(2).forEach { pair ->
      Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        pair.forEach { t -> ToolCard(t, Modifier.weight(1f), shared) { onOpen(t) } }
        if (pair.size == 1) Spacer(Modifier.weight(1f))
      }
    }
  }
}

@Composable
internal fun ToolCard(t: Tool, modifier: Modifier, shared: Boolean, onClick: () -> Unit) {
  val shape = RoundedCornerShape(Radius.group)
  val pinned = t.id in Pins.ids
  Box(
    modifier.fillMaxHeight().tap(shape = shape, scaleTo = 0.96f, label = t.title, onClick = onClick)
      .background(c.surface, shape).border(0.6.dp, c.lineStrong, shape),
  ) {
    Column(Modifier.padding(14.dp)) {
      ArtTile(t.id, 46.dp, if (shared) Modifier.sharedArt(t.id) else Modifier)
      T(t.title, Type.bold, modifier = Modifier.padding(top = 12.dp), maxLines = 2)
      T(t.desc, Type.small.copy(fontSize = 12.sp, lineHeight = 17.sp), c.sub, Modifier.padding(top = 4.dp), maxLines = 2)
    }
    Box(Modifier.align(Alignment.TopEnd).padding(4.dp)) {
      IconBtn(if (pinned) I.pin else I.pinOutline, 18.dp, if (pinned) c.accent else c.faint, if (pinned) "Unpin ${t.title}" else "Pin ${t.title} to the top") { Pins.toggle(t.id) }
    }
  }
}

@Composable
private fun Stat(label: String, value: String) {
  Column {
    T(label, Type.num.copy(fontSize = Type.num.fontSize * 0.95f), Color.White.copy(alpha = 0.7f))
    T(value, Type.bold, Color.White)
  }
}

// The quiet card under the loud one: surfaceSecondary with clean textPrimary type, kept compact.
@Composable
private fun RecentPanel(recent: List<Saved>, onAll: () -> Unit) {
  val shape = RoundedCornerShape(Radius.card)
  val ink = c.textPrimary
  val dim = c.textSecondary
  Column(Modifier.padding(top = 12.dp).fillMaxWidth().clip(shape).background(c.surfaceSecondary, shape).padding(start = 16.dp, end = 10.dp, top = 12.dp, bottom = 6.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      T("RECENT", Type.caption, dim, Modifier.weight(1f))
      T("All files", Type.small, c.primary, Modifier.tap(scaleTo = 0.92f, onClick = onAll).padding(horizontal = 6.dp, vertical = 2.dp))
    }
    recent.forEach { f ->
      Row(
        Modifier.fillMaxWidth().tap(scaleTo = 0.98f, label = "Open ${stem(f.name)}") { openFile(f.path, f.name) }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column(Modifier.weight(1f)) {
          Marquee(stem(f.name), Type.item, ink)
          T("${kindOf(f.name).name.uppercase()} · ${fmtSize(f.size)} · ${fmtDate(f.modified)}", Type.small.copy(fontSize = 11.5.sp, lineHeight = 15.sp), dim, maxLines = 1)
        }
        Spacer(Modifier.size(8.dp))
        RoundBtn(I.shareVariantOutline, c.surface, ink, 34.dp, "Share") { share(f.path, f.name) }
      }
    }
  }
}
