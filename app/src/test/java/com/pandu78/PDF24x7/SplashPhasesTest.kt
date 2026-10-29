package com.pandu78.PDF24x7

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SplashPhasesTest {
  @Test
  fun phases1to3ExistAndUse400msEach() {
    assertEquals(400, kSpinUpMs)
    assertEquals(400, kSpinBackMs)
    assertEquals(0.0, splashSpinValue(0.0), 0.0)
    assertEquals(0.0, splashSpinValue(kHoldMs - 1.0), 0.0)

    val mid1 = splashSpinValue(kHoldMs + kSpinUpMs / 2.0)
    assertTrue("mid1 > 0.1", mid1 > 0.1)
    assertTrue("mid1 < 0.9", mid1 < 0.9)

    assertEquals(1.0, splashSpinValue(kHoldMs + kSpinUpMs.toDouble()), 0.001)

    val mid2 = splashSpinValue(kHoldMs + kSpinUpMs + kSpinBackMs / 2.0)
    assertTrue("mid2 > 0.1", mid2 > 0.1)
    assertTrue("mid2 < 0.9", mid2 < 0.9)

    val end2 = kHoldMs + kSpinUpMs + kSpinBackMs.toDouble()
    assertEquals(0.0, splashSpinValue(end2), 0.001)
    assertEquals(0.0, splashSpinValue(end2 + kRestMs / 2.0), 0.0)
    assertEquals(0.0, splashLockupValue(end2 + kRestMs - 1.0), 0.0)
  }

  @Test
  fun noFrameCanSkipPhasesTimeAdvanceIsCapped() {
    assertEquals(kMaxStepMs, advanceSplashMs(0.0, 5000.0), 0.001)
    assertEquals(16.0, advanceSplashMs(0.0, 16.0), 0.001)
    assertEquals(0.0, advanceSplashMs(0.0, -5.0), 0.001)
    assertEquals(kTotalMs.toDouble(), advanceSplashMs(kTotalMs - 1.0, 100.0), 0.001)

    var ms = 0.0
    var frames = 0
    while (ms < kTotalMs) {
      ms = advanceSplashMs(ms, 400.0)
      frames++
    }
    assertTrue("frames > 60: actual was $frames", frames > 60)
  }
}

