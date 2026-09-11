import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, StyleSheet, useColorScheme, type TextStyle } from 'react-native';
import { File, Paths } from 'expo-file-system';
// Per-weight imports: the package root would bundle all 18 Poppins files (~3 MB).
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';

// White paper and ink with one red pencil. Dark is the same idea at night:
// charcoal and bone, never neon on pure black.
const light = {
  bg: '#FFFFFF', // screen background
  surface: '#FFFFFF', // grouped lists, inputs, tab bar (separated from bg by hairlines)
  sunken: '#F2F2F1', // tiles behind artwork, pressed rows, search, segmented track
  page: '#FFFFFF', // paper inside illustrations
  ink: '#141414', // text and primary buttons
  sub: '#6A6A6A',
  faint: '#A6A6A4',
  line: '#EAEAE8',
  lineStrong: '#D4D4D1',
  accent: '#C9442A',
  accentSoft: '#FBE4DD',
  accentInk: '#7C2613',
  onInk: '#FFFFFF', // text on primary buttons
};
export type Palette = typeof light;
const dark: Palette = {
  bg: '#141311',
  surface: '#1D1C19',
  sunken: '#27251F',
  page: '#302D28',
  ink: '#ECE6DA',
  sub: '#A19A8D',
  faint: '#6A6458',
  line: '#302E29',
  lineStrong: '#4A463E',
  accent: '#E5694B',
  accentSoft: '#3D251D',
  accentInk: '#F2B8A6',
  onInk: '#141311',
};
export const palettes = { light, dark };
export type Scheme = keyof typeof palettes;
export type ThemePref = 'system' | Scheme;

// Poppins throughout. It runs tall, so line heights are ~1.3× to keep accents and descenders unclipped on Android.
export const fonts = {
  display: 'Poppins_600SemiBold', // screen titles
  sans: 'Poppins_400Regular',
  med: 'Poppins_500Medium',
  bold: 'Poppins_600SemiBold',
} as const;

export const fontAssets = { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold };

export const typo = {
  largeTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 42, letterSpacing: -0.5 },
  title: { fontFamily: fonts.display, fontSize: 25, lineHeight: 33, letterSpacing: -0.3 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  item: { fontFamily: fonts.med, fontSize: 15 },
  label: { fontFamily: fonts.bold, fontSize: 13 },
  button: { fontFamily: fonts.bold, fontSize: 15 },
  num: { fontFamily: fonts.med, fontSize: 12.5 },
} satisfies Record<string, TextStyle>;

// Deliberately not one radius for everything: small things are tighter.
export const radius = { tile: 10, control: 12, group: 14, card: 16, pill: 99 } as const;

type ThemeValue = { c: Palette; scheme: Scheme; pref: ThemePref; setPref: (p: ThemePref) => void };
const ThemeCtx = createContext<ThemeValue>({ c: light, scheme: 'light', pref: 'system', setPref: () => {} });

const prefFile = () => new File(Paths.document, 'theme.txt');
function readPref(): ThemePref {
  try {
    const f = prefFile();
    const v = f.exists ? f.textSync().trim() : '';
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}
function writePref(p: ThemePref) {
  try {
    const f = prefFile();
    if (!f.exists) f.create();
    f.write(p);
  } catch {
    // no file system (web preview): the choice just won't persist
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPref] = useState<ThemePref>(readPref);
  useEffect(() => {
    writePref(pref);
    try {
      // Keeps native alerts, pickers and the keyboard in step with the in-app choice.
      Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
    } catch {
      // not supported on this platform
    }
  }, [pref]);
  const scheme: Scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({ c: palettes[scheme], scheme, pref, setPref }), [scheme, pref]);
  return createElement(ThemeCtx.Provider, { value }, children);
}

export const useTheme = () => useContext(ThemeCtx);

// Styles built from the active palette, cached per palette so re-renders stay cheap.
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (c: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return function useStyles() {
    const { c } = useTheme();
    let s = cache.get(c);
    if (!s) {
      s = StyleSheet.create(build(c));
      cache.set(c, s);
    }
    return s;
  };
}
