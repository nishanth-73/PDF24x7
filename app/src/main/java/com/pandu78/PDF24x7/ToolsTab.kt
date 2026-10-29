package com.pandu78.PDF24x7

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun ToolsTab() {
  val nav = LocalNav.current
  var q by rememberSaveable { mutableStateOf("") }
  val files = remember(Store.version) { listAllFiles() }
  val tokens = q.trim().lowercase().split(Regex("\\s+")).filter { it.isNotEmpty() }
  val searching = tokens.isNotEmpty()
  val tools = if (searching) TOOLS.filter { matches("${it.title} ${it.desc}", tokens) } else TOOLS
  val found = if (searching) files.filter { matches(it.name, tokens) } else emptyList()
  val sections = remember { SECTIONS.indices.filter { si -> TOOLS.any { it.section == si && it.id != "scan" } } }
  var section by rememberSaveable { mutableStateOf(-1) }

  Screen {
    LargeTitle("Tools", "${TOOLS.size} tools. Everything runs on this phone.")
    SearchField(q, { q = it }, "Merge, split, compress…")

    if (!searching) {
      Row(
        Modifier.padding(top = 16.dp).horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        Chip("All tools", section == -1) { section = -1 }
        sections.forEach { si -> Chip(SECTIONS[si], section == si) { section = si } }
      }
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

    // Pinned tools first
    val pinned = Pins.ids.mapNotNull { toolById(it) }
    if (!searching && section == -1 && pinned.isNotEmpty()) {
      Stagger(0) {
        Column {
          GroupLabel("Pinned · ${pinned.size}")
          ToolGrid(pinned, shared = false) { nav.tool(it.id) }
        }
      }
    }

    SECTIONS.forEachIndexed { si, name ->
      if (!searching && section != -1 && section != si) return@forEachIndexed
      val items = tools.filter { it.section == si && (searching || it.id != "scan") }
      if (items.isEmpty()) return@forEachIndexed
      Stagger(si + 1) {
        Column {
          GroupLabel("$name · ${items.size}")
          ToolGrid(items) { nav.tool(it.id) }
        }
      }
    }

    if (tools.isEmpty() && found.isEmpty()) {
      T("No tools or files match \"${q.trim()}\". Try \"merge\", \"split\" or \"compress\".", Type.body, c.sub, Modifier.fillMaxWidth().padding(top = 40.dp, start = 24.dp, end = 24.dp), align = TextAlign.Center)
    }

    Spacer(Modifier.height(14.dp))
    com.pandu78.PDF24x7.ads.AdBannerSlot("tools_footer")
  }
}

