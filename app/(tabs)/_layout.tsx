import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/ui';
import { fonts, useTheme } from '../../src/theme';
import type { IconName } from '../../src/tools';

const icon = (name: IconName) => ({ color }: { color: ColorValue }) => <Icon name={name} size={22} color={color} />;

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
});

export default function TabsLayout() {
  const { c } = useTheme();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + 10; // extra space under the labels, above the gesture bar
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.sub,
        tabBarStyle: {
          height: 58 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
          backgroundColor: c.surface,
          borderTopColor: c.line,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: { fontFamily: fonts.med, fontSize: 11, marginTop: 2 },
        sceneStyle: { backgroundColor: c.bg },
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
              onPress={() => { if (pathname !== '/scanner') router.push('/scanner'); }}
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
  );
}
