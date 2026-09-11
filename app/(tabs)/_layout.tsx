import { View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Icon } from '../../src/ui';
import { fonts, useTheme } from '../../src/theme';
import type { IconName } from '../../src/tools';

const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) =>
  <Icon name={name} size={size - 2} color={color} />;

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.sub,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarLabelStyle: { fontFamily: fonts.med, fontSize: 11 },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Tools', tabBarIcon: icon('view-grid-outline') }} />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ focused }) => (
            <View
              style={{
                width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                backgroundColor: focused ? c.accent : c.ink,
              }}
            >
              <Icon name="camera-outline" size={17} color={c.onInk} />
            </View>
          ),
        }}
      />
      <Tabs.Screen name="files" options={{ title: 'Files', tabBarIcon: icon('folder-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('cog-outline') }} />
    </Tabs>
  );
}
