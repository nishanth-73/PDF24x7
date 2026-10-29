package com.pandu78.PDF24x7.ads

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.pandu78.PDF24x7.Radius
import com.pandu78.PDF24x7.T
import com.pandu78.PDF24x7.Type
import com.pandu78.PDF24x7.c

/**
 * Standardized ad placement slot designed to maintain complete separation
 * from critical PDF actions, viewers, and editors.
 *
 * Remains collapsed (0 height, no render) when ads are unconfigured or disabled.
 */
@Composable
fun AdBannerSlot(
  slotLocation: String,
  modifier: Modifier = Modifier,
) {
  if (!AdConfig.isEnabled && !AdConfig.showDebugPlaceholders) {
    // Collapses cleanly to 0 height with no DOM/layout penalty
    return
  }

  val shape = RoundedCornerShape(Radius.card)
  Box(
    modifier = modifier
      .fillMaxWidth()
      .height(60.dp)
      .clip(shape)
      .background(c.sunken.copy(alpha = 0.5f))
      .border(0.6.dp, c.line, shape)
      .padding(8.dp),
    contentAlignment = Alignment.Center,
  ) {
    if (AdConfig.showDebugPlaceholders) {
      T(
        "Ad Slot: $slotLocation (Pending Provider)",
        Type.small,
        c.faint,
      )
    } else {
      // Future AdView/Banner container once provider SDK is integrated
    }
  }
}

