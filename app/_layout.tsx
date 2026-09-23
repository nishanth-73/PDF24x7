import { useState } from 'react';
import { Modal, Pressable, Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, router, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Consent } from '../src/Consent';
import { acceptTerms, acceptedTerms } from '../src/terms';
import { ThemeProvider, fontAssets, palettes, useTheme } from '../src/theme';

// Anything that throws while drawing a screen lands here instead of closing the app. Outside the theme provider (it
// may be what failed), so it reads the system scheme itself. Files and drafts are on disk, so nothing is lost.
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const c = palettes[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const home = () => { router.replace('/'); retry(); };
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 28, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 20, fontWeight: '600', color: c.ink }}>Something went wrong</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: c.sub, marginTop: 8 }}>
        This screen hit a problem and had to stop. Your files are safe.
      </Text>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
        <Pressable onPress={retry} style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, backgroundColor: c.ink }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.onInk }}>Try again</Text>
        </Pressable>
        <Pressable onPress={home} style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: c.lineStrong }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>Go home</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
        <Consent onAccept={() => { console.log('PERF accept', Date.now()); acceptTerms(); setAgreed(true); setTimeout(() => console.log('PERF next tick', Date.now()), 0); }} />
      </Modal>
    </>
  );
}
