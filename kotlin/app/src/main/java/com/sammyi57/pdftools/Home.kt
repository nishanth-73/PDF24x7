package com.sammyi57.pdftools

import androidx.compose.foundation.background
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
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

// Tokenized search: every word in the query must appear somewhere in the target. "split text" finds "Split PDF by Text".
private fun matches(target: String, tokens: List<String>) = target.lowercase().let { t -> tokens.all { it in t } }

@Composable
fun Home() {
  val nav = LocalNav.current
  var q by rememberSaveable { mutableStateOf("") }
  val files = remember(Store.version) { listAllFiles() }
  val tokens = q.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
  val searching = tokens.isNotEmpty()
  val tools = if (searching) TOOLS.filter { matches("${it.title} ${it.desc}", tokens) } else TOOLS
  val found = if (searching) files.filter { matches(it.name, tokens) } else emptyList()

  Screen {
    LargeTitle("Tools", "${TOOLS.size} tools. Everything runs on this phone.")
    SearchField(q, { q = it }, "Merge, split, compress…")

    if (!searching) {
      Stagger(0) { Hero(files) { nav.scan() } }
      if (files.isNotEmpty()) Stagger(1) { RecentPanel(files.take(3)) { nav.show(Tab.Files) } }
    }

    if (found.isNotEmpty()) {
      GroupLabel("Files", "All files", { nav.show(Tab.Files) })
      Group {
        found.take(5).forEachIndexed { i, f ->
          ListRow(
            stem(f.name), first = i == 0, lead = { DocGlyph(kindOf(f.name)) }, marquee = true,
            subtitle = "${fmtSize(f.size)} · ${fmtDate(f.modified)}", onClick = { openFile(f.path, f.name) },
          ) { IconBtn(I.shareVariantOutline, 18.dp, c.sub, "Share") { share(f.path, f.name) } }
        }
      }
    }

    SECTIONS.forEachIndexed { si, name ->
      val items = tools.filter { it.section == si && (searching || it.id != "scan") }
      if (items.isEmpty()) return@forEachIndexed
      Stagger(si + 2) {
        Column {
          GroupLabel(name)
          Group {
            items.forEachIndexed { i, t ->
              ListRow(
                t.title, first = i == 0, subtitle = t.desc, chevron = true,
                lead = { ArtTile(t.id, modifier = Modifier.sharedArt(t.id)) }, onClick = { nav.tool(t.id) },
              )
            }
          }
        }
      }
    }

    if (tools.isEmpty() && found.isEmpty()) {
      T("No tools or files match \"${q.trim()}\". Try \"merge\", \"split\" or \"compress\".", Type.body, c.sub, Modifier.fillMaxWidth().padding(top = 40.dp, start = 24.dp, end = 24.dp), align = TextAlign.Center)
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
  val soft = Color(0xFFFFD9C6)
  val sentence = buildAnnotatedString {
    withStyle(SpanStyle(color = Color.White)) { append(greeting()) }
    withStyle(SpanStyle(color = soft)) {
      if (files.isEmpty()) {
        append(" Scan a page ")
        appendInlineContent("cam", "[camera]")
        append(" and it becomes a PDF, ")
        withStyle(SpanStyle(color = Color.White)) { append("right here on your phone.") }
      } else {
        append(" You have ")
        appendInlineContent("doc", "[file]")
        withStyle(SpanStyle(color = Color.White)) { append(" ${plural(files.size, "file")}") }
        append(" saved")
        if (today > 0) {
          append(", ")
          withStyle(SpanStyle(color = Color.White)) { append("$today made today") }
        }
        append(". Ready to ")
        appendInlineContent("cam", "[camera]")
        withStyle(SpanStyle(color = Color.White)) { append(" scan") }
        append(" more?")
      }
    }
  }
  val inline = mapOf(
    "doc" to InlineTextContent(Placeholder(1.05.em, 1.em, PlaceholderVerticalAlign.TextCenter)) { Icon(I.fileDocumentOutline, 22.dp, Color.White) },
    "cam" to InlineTextContent(Placeholder(1.05.em, 1.em, PlaceholderVerticalAlign.TextCenter)) { Icon(I.cameraOutline, 22.dp, Color.White) },
  )
  Column(
    Modifier.padding(top = 16.dp).fillMaxWidth().tap(shape = shape, scaleTo = 0.98f, label = "Scan a document", onClick = onScan)
      .clip(shape).background(Brush.verticalGradient(c.hero), shape).padding(22.dp),
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
        Modifier.background(Color.White, CircleShape).padding(start = 14.dp, end = 10.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        T("Open camera", Type.label, Color(0xFF1A0503))
        Spacer(Modifier.size(4.dp))
        Icon(I.arrowRight, 16.dp, Color(0xFF1A0503))
      }
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

// The black panel from the reference: small label, big title, a round white button per row.
@Composable
private fun RecentPanel(recent: List<Saved>, onAll: () -> Unit) {
  val shape = RoundedCornerShape(Radius.hero)
  Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(c.panel, shape).padding(start = 20.dp, end = 14.dp, top = 18.dp, bottom = 10.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      T("Recent", Type.item.copy(fontSize = Type.item.fontSize * 1.12f, fontWeight = Type.bold.fontWeight), c.onPanel, Modifier.weight(1f))
      T("All files", Type.med, c.onPanelSub, Modifier.tap(scaleTo = 0.92f, onClick = onAll).padding(horizontal = 6.dp, vertical = 4.dp))
    }
    recent.forEach { f ->
      Row(
        Modifier.fillMaxWidth().tap(scaleTo = 0.98f, label = "Open ${stem(f.name)}") { openFile(f.path, f.name) }.padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column(Modifier.weight(1f)) {
          T("${kindOf(f.name).name.uppercase()} · ${fmtSize(f.size)} · ${fmtDate(f.modified)}", Type.small, c.onPanelSub, maxLines = 1)
          Marquee(stem(f.name), Type.big.copy(fontSize = Type.big.fontSize * 0.8f), c.onPanel)
        }
        Spacer(Modifier.size(10.dp))
        RoundBtn(I.shareVariantOutline, c.onPanel, c.panel, 46.dp, "Share") { share(f.path, f.name) }
      }
    }
  }
}
