import { Pressable, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/ui';
import { fonts, useTheme } from '../../src/theme';
import type { IconName } from '../../src/tools';

const icon = (name: IconName) => ({ color }: { color: ColorValue }) => <Icon name={name} size={25} color={color} />;

export default function TabsLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.sub,
        tabBarStyle: { height: 68 + insets.bottom, paddingTop: 8, backgroundColor: c.surface, borderTopColor: c.line },
        tabBarLabelStyle: { fontFamily: fonts.med, fontSize: 11.5, marginTop: 3 },
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
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('camera-outline') }} />
      <Tabs.Screen name="files" options={{ title: 'Files', tabBarIcon: icon('folder-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}
