import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ThemeProvider, fontAssets, useTheme } from '../src/theme';

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  // If the font files fail to load, fall back to the system font rather than a blank app.
  if (!loaded && !error) return null;
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
  const { c, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
    </>
  );
}
