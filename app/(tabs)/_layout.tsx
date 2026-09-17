import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, plural } from '../../src/ui';
import { fonts, radius, useTheme } from '../../src/theme';
import { ArtTile } from '../../src/art';
import { getToolDraft, setToolDraft, subscribeToolDraft } from '../../src/toolDraft';
import { toolById } from '../../src/tools';
import type { IconName } from '../../src/tools';

const icon = (name: IconName) => ({ color }: { color: ColorValue }) => <Icon name={name} size={22} color={color} />;

const RESUME_H = 64; // space the resume bar takes above the tab bar

// The scanner covers the tab bar once open, so only a quick double tap could push it twice. A time guard does that
// without usePathname, which re-rendered the whole tab navigator on every navigation.
let scanOpenedAt = 0;
const openScanner = () => {
  if (Date.now() - scanOpenedAt < 1000) return;
  scanOpenedAt = Date.now();
  router.push('/scanner');
};

const s = StyleSheet.create({
  // Sits inside the bar like the other tabs, but filled in the accent color so it stands out.
  // marginTop lines its middle up with the other tab icons (bar paddingTop 6 + item paddingVertical 4 + half of 22).
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginTop: -2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resume: {
    position: 'absolute', left: 10, right: 10, height: RESUME_H - 8,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 8, paddingRight: 4,
    borderRadius: radius.group, borderWidth: StyleSheet.hairlineWidth,
  },
  resumeTitle: { fontFamily: fonts.bold, fontSize: 14 },
  resumeSub: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  resumeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  resumeBtnText: { fontFamily: fonts.bold, fontSize: 13 },
});

export default function TabsLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 10; // extra space under the labels, above the gesture bar
  const barH = 58 + bottomPad;
  const draft = useSyncExternalStore(subscribeToolDraft, getToolDraft);
  const draftTool = draft && toolById(draft.tool);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.sub,
          tabBarStyle: {
            height: barH,
            paddingTop: 6,
            paddingBottom: bottomPad,
            backgroundColor: c.surface,
            borderTopColor: c.line,
          },
          tabBarItemStyle: { paddingVertical: 4 },
          tabBarLabelStyle: { fontFamily: fonts.med, fontSize: 11, marginTop: 2 },
          sceneStyle: { backgroundColor: c.bg, paddingBottom: draftTool ? RESUME_H : 0 },
          // Replaces the default Android ripple with a light fade on every platform.
          tabBarButton: ({ children, style, onPress, onLongPress, accessibilityState, accessibilityLabel, testID }) => (
            <Pressable
              onPress={onPress} onLongPress={onLongPress} testID={testID} accessibilityRole="tab"
              accessibilityState={accessibilityState} accessibilityLabel={accessibilityLabel}
              style={({ pressed }) => [style, pressed && { opacity: 0.85 }]}
            >
              {children}
            </Pressable>
          ),
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Tools', tabBarIcon: icon('view-grid-outline') }} />
        <Tabs.Screen
          name="scan"
          options={{
            title: 'Scan',
            // A raised round button, not a screen: it opens the camera over whichever tab you're on.
            tabBarButton: () => (
              <Pressable
                onPress={openScanner}
                accessibilityRole="button" accessibilityLabel="Scan a document"
                style={({ pressed }) => [{ flex: 1, alignItems: 'center', justifyContent: 'flex-start' }, pressed && { opacity: 0.9 }]}
              >
                <View style={[s.fab, { backgroundColor: c.accent }]}>
                  <Icon name="camera-plus-outline" size={24} color={c.onInk} />
                </View>
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen name="files" options={{ title: 'Files', tabBarIcon: icon('folder-outline') }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('cog-outline') }} />
      </Tabs>
      {draftTool && (
        // A tool left open when the app closed: pick up where you were, or throw it away.
        <Pressable
          onPress={() => router.push({ pathname: '/tool/[id]', params: { id: draftTool.id, resume: '1' } })}
          accessibilityRole="button" accessibilityLabel={`Continue ${draftTool.title}`}
          style={({ pressed }) => [s.resume, { bottom: barH + 4, backgroundColor: pressed ? c.sunken : c.surface, borderColor: c.lineStrong }]}
        >
          <ArtTile id={draftTool.id} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[s.resumeTitle, { color: c.ink }]} numberOfLines={1}>{draftTool.title}</Text>
            <Text style={[s.resumeSub, { color: c.sub }]} numberOfLines={1}>Still open · {plural(draft.files.length, 'file')}</Text>
          </View>
          <Pressable onPress={() => setToolDraft(null)} hitSlop={6} style={({ pressed }) => [s.resumeBtn, pressed && { backgroundColor: c.line }]}>
            <Text style={[s.resumeBtnText, { color: c.sub }]}>Discard</Text>
          </Pressable>
          <View style={[s.resumeBtn, { backgroundColor: c.ink }]}>
            <Text style={[s.resumeBtnText, { color: c.onInk }]}>Open</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
