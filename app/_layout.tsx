import { useState } from 'react';
import { Modal } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Consent } from '../src/Consent';
import { acceptTerms, acceptedTerms } from '../src/terms';
import { ThemeProvider, fontAssets, useTheme } from '../src/theme';

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  // If the font files fail to load, fall back to the system font rather than a blank app.
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { c, scheme } = useTheme();
  // Read before the first render, so a returning user never sees the terms flash past.
  const [agreed, setAgreed] = useState(acceptedTerms);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        {/* The scanner comes up over everything, sliding in from the bottom like a native camera sheet. */}
        <Stack.Screen name="scanner" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack>
      {/* Over the navigator, never instead of it: the root layout has to keep rendering the Stack, and putting the
          terms in its place meant the whole app — router, tabs, their file scans — only started mounting once you
          accepted, which read as a dead button followed by a long freeze. As a modal the app is already up behind it,
          so accepting just closes this. onRequestClose is deliberately inert: Android back must not skip the gate. */}
      <Modal visible={!agreed} animationType="none" onRequestClose={() => {}}>
        <Consent onAccept={() => { acceptTerms(); setAgreed(true); }} />
      </Modal>
    </>
  );
}
